import { randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import { pool, type PoolClient } from '@workspace/db'
import {
  authDigest, authToken, CODE_LIFETIME_MS, LOGIN_CODE_RESEND_SECONDS, MAX_CODE_ATTEMPTS,
} from './portal-password'
import { revokeAllDevices } from './remembered-device'

export interface AuthSubject { id: string; email: string }
export interface Challenge {
  participant_id: string; email: string; purpose: 'login' | 'password'
  credential_version: string | null; code_hash: string | null
  attempts: number; next_path: string; expires_at: Date; consumed_at: Date | null
}
const digestEqual = (a: string, b: string) => {
  const aa = Buffer.from(a), bb = Buffer.from(b)
  return aa.length === bb.length && timingSafeEqual(aa, bb)
}
export async function authTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  let discard = false
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    try { await client.query('ROLLBACK') } catch { discard = true }
    throw error
  } finally { client.release(discard) }
}

const REMAINING_SQL = `GREATEST(0, CEIL(EXTRACT(EPOCH FROM (window_start
  + COALESCE(window_seconds, 3600) * interval '1 second' - statement_timestamp()))))::int`

/**
 * Durable counters: concurrent requests / multiple servers share the limit.
 * Returns 0 when allowed, otherwise the whole seconds left in the window.
 */
export async function authRateLimitWait(scope: string, value: string, max: number, windowSeconds: number): Promise<number> {
  if (!Number.isSafeInteger(windowSeconds) || windowSeconds <= 0 || windowSeconds > 2_147_483_647) {
    throw new Error('Invalid authentication rate-limit window')
  }
  const result = await pool.query<{ attempts: number; remaining: number }>(
    `INSERT INTO portal_auth_limits (key, window_seconds) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET
       attempts = CASE WHEN portal_auth_limits.window_start <= statement_timestamp() - ($2::int * interval '1 second') THEN 1 ELSE portal_auth_limits.attempts + 1 END,
       window_seconds = CASE WHEN portal_auth_limits.window_start <= statement_timestamp() - ($2::int * interval '1 second') THEN $2::int ELSE GREATEST(COALESCE(portal_auth_limits.window_seconds, 3600), $2::int) END,
       window_start = CASE WHEN portal_auth_limits.window_start <= statement_timestamp() - ($2::int * interval '1 second') THEN statement_timestamp() ELSE portal_auth_limits.window_start END
     RETURNING attempts, ${REMAINING_SQL} AS remaining`, [authDigest(`${scope}:${value}`), windowSeconds])
  const row = result.rows[0]
  return row.attempts <= max ? 0 : Math.max(1, Number(row.remaining))
}
export async function authRateLimit(scope: string, value: string, max: number, windowSeconds: number): Promise<boolean> {
  return await authRateLimitWait(scope, value, max, windowSeconds) === 0
}

interface EmailLimit { scope: string; max: number; windowSeconds: number }
/** Sign-in codes and password emails have separate per-person counters. */
export const LOGIN_CODE_LIMITS: readonly EmailLimit[] = [
  { scope: 'login-code-gap', max: 1, windowSeconds: LOGIN_CODE_RESEND_SECONDS },
  { scope: 'login-code-hour', max: 10, windowSeconds: 3600 },
]
export const PASSWORD_EMAIL_LIMITS: readonly EmailLimit[] = [
  { scope: 'password-email-gap', max: 1, windowSeconds: 10 },
  { scope: 'password-email-hour', max: 5, windowSeconds: 3600 },
]
/** 0 = reserved; otherwise seconds to wait. A blocked short gap never uses up the hourly allowance. */
async function reserveEmail(limits: readonly EmailLimit[], subjectId: string): Promise<number> {
  for (const limit of limits) {
    const wait = await authRateLimitWait(limit.scope, subjectId, limit.max, limit.windowSeconds)
    if (wait) return wait
  }
  return 0
}
export const reserveLoginCodeEmail = (subjectId: string) => reserveEmail(LOGIN_CODE_LIMITS, subjectId)
export const reservePasswordEmail = (subjectId: string) => reserveEmail(PASSWORD_EMAIL_LIMITS, subjectId)
/** Counts a code that was always allowed (first code after password setup). */
export async function recordLoginCodeEmail(subjectId: string) {
  for (const limit of LOGIN_CODE_LIMITS) await authRateLimitWait(limit.scope, subjectId, limit.max, limit.windowSeconds)
}
/** Read-only: seconds until another sign-in code may be sent (0 = now). */
export async function loginCodeWait(subjectId: string): Promise<number> {
  const keys = LOGIN_CODE_LIMITS.map(l => authDigest(`${l.scope}:${subjectId}`))
  const result = await pool.query<{ key: string; attempts: number; remaining: number }>(
    `SELECT key, attempts, ${REMAINING_SQL} AS remaining FROM portal_auth_limits WHERE key = ANY($1::text[])`, [keys])
  let wait = 0
  for (const row of result.rows) {
    const limit = LOGIN_CODE_LIMITS[keys.indexOf(row.key)]
    if (row.attempts >= limit.max && row.remaining > 0) wait = Math.max(wait, Number(row.remaining))
  }
  return wait
}
export async function createChallenge(
  subject: AuthSubject, purpose: 'login' | 'password', version: string | null, nextPath = '',
) {
  const token = authToken(), id = authDigest(token)
  const code = purpose === 'login' ? String(randomInt(0, 1_000_000)).padStart(6, '0') : null
  await authTransaction(async client => {
    // Serialize issuance per participant even when no credentials exist yet.
    await client.query('SELECT id FROM participants WHERE id = $1 FOR UPDATE', [subject.id])
    await client.query(`UPDATE portal_auth_challenges SET consumed_at = statement_timestamp()
      WHERE participant_id = $1 AND purpose = $2 AND consumed_at IS NULL`, [subject.id, purpose])
    await client.query(`INSERT INTO portal_auth_challenges
      (id, participant_id, email, purpose, credential_version, code_hash, expires_at, next_path)
      VALUES ($1, $2, $3, $4, $5, $6, statement_timestamp() + ($7::int * interval '1 millisecond'), $8)`,
    [id, subject.id, subject.email, purpose, version, code ? authDigest(`${id}:${code}`) : null,
      purpose === 'login' ? CODE_LIFETIME_MS : 30 * 60_000, nextPath])
  })
  return { token, code }
}
export async function invalidateChallenge(token: string) {
  await pool.query(`UPDATE portal_auth_challenges SET consumed_at = statement_timestamp()
    WHERE id = $1`, [authDigest(token)])
}
export async function pendingChallenge(token: string, purpose: 'login' | 'password'): Promise<Challenge | null> {
  if (!/^[\w-]{43}$/.test(token)) return null
  const result = await pool.query(`SELECT * FROM portal_auth_challenges
    WHERE id = $1 AND purpose = $2 AND consumed_at IS NULL AND attempts < $3
    AND expires_at > statement_timestamp()`, [authDigest(token), purpose, MAX_CODE_ATTEMPTS])
  return result.rows[0] ?? null
}
export type CodeResult = { ok: true; challenge: Challenge } | { ok: false; remaining: number }

/** Lock + consume in one transaction: MAX_CODE_ATTEMPTS wrong guesses invalidate the code. */
export async function consumeLoginCode(token: string, code: string): Promise<CodeResult> {
  if (!/^[\w-]{43}$/.test(token)) return { ok: false, remaining: 0 }
  return authTransaction(async client => {
    const id = authDigest(token)
    const result = await client.query<Challenge>(`SELECT * FROM portal_auth_challenges
      WHERE id = $1 AND purpose = 'login' AND consumed_at IS NULL
      AND expires_at > statement_timestamp() AND attempts < $2 FOR UPDATE`, [id, MAX_CODE_ATTEMPTS])
    const row = result.rows[0]
    if (!row) return { ok: false, remaining: 0 }
    const credential = await client.query(`SELECT c.version FROM portal_auth_credentials c
      JOIN participants p ON p.id = c.participant_id
      WHERE c.participant_id = $1 AND c.email = $2 AND lower(p.email) = $2 AND p.is_active = true`,
    [row.participant_id, row.email])
    if (credential.rows[0]?.version !== row.credential_version) {
      await client.query('UPDATE portal_auth_challenges SET consumed_at = statement_timestamp() WHERE id = $1', [id])
      return { ok: false, remaining: 0 }
    }
    if (!/^\d{6}$/.test(code) || !row.code_hash || !digestEqual(row.code_hash, authDigest(`${id}:${code}`))) {
      const attempts = row.attempts + 1
      await client.query(`UPDATE portal_auth_challenges SET attempts = $2::int,
        consumed_at = CASE WHEN $2::int >= $3::int THEN statement_timestamp() ELSE NULL END WHERE id = $1`,
      [id, attempts, MAX_CODE_ATTEMPTS])
      return { ok: false, remaining: MAX_CODE_ATTEMPTS - attempts }
    }
    await client.query('UPDATE portal_auth_challenges SET consumed_at = statement_timestamp() WHERE id = $1', [id])
    return { ok: true, challenge: row }
  })
}

export interface SavedPassword { participantId: string; email: string; version: string }
export async function savePortalPassword(token: string, passwordHash: string): Promise<SavedPassword | null> {
  if (!/^[\w-]{43}$/.test(token)) return null
  return authTransaction(async client => {
    const id = authDigest(token)
    // Lock the participant before challenges to match createChallenge's order.
    const candidate = await client.query<Challenge>('SELECT * FROM portal_auth_challenges WHERE id = $1', [id])
    const target = candidate.rows[0]
    if (!target) return null
    const person = await client.query(`SELECT email FROM participants WHERE id = $1 AND is_active = true FOR UPDATE`, [target.participant_id])
    if (person.rows[0]?.email?.toLowerCase() !== target.email) return null
    const result = await client.query<Challenge>(`SELECT * FROM portal_auth_challenges WHERE id = $1
      AND purpose = 'password' AND consumed_at IS NULL AND expires_at > statement_timestamp() FOR UPDATE`, [id])
    if (!result.rows[0]) return null
    const version = randomUUID()
    await client.query(`INSERT INTO portal_auth_credentials (participant_id, email, password_hash, version)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (participant_id) DO UPDATE SET email = EXCLUDED.email, password_hash = EXCLUDED.password_hash,
      version = EXCLUDED.version, updated_at = statement_timestamp()`, [target.participant_id, target.email, passwordHash, version])
    await client.query(`UPDATE portal_auth_challenges SET consumed_at = statement_timestamp()
      WHERE participant_id = $1 AND consumed_at IS NULL`, [target.participant_id])
    // Resetting a password retires the participant's existing portal sessions.
    await client.query(`UPDATE auth_idle_sessions SET revoked_at = statement_timestamp()
      WHERE kind = 'portal' AND subject_id = $1 AND revoked_at IS NULL`, [target.participant_id])
    // It also makes every remembered computer ask for a code again.
    await revokeAllDevices(client, target.participant_id)
    return { participantId: target.participant_id, email: target.email, version }
  })
}
