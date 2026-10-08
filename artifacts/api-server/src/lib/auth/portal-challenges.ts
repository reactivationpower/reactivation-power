import { randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import { pool, type PoolClient } from '@workspace/db'
import { authDigest, authToken, CODE_LIFETIME_MS, MAX_CODE_ATTEMPTS } from './portal-password'

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
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
}

/** Durable counters: concurrent requests / multiple servers share the limit. */
export async function authRateLimit(scope: string, value: string, max: number, windowSeconds: number): Promise<boolean> {
  const result = await pool.query(
    `INSERT INTO portal_auth_limits (key) VALUES ($1)
     ON CONFLICT (key) DO UPDATE SET
       attempts = CASE WHEN portal_auth_limits.window_start <= statement_timestamp() - ($2::int * interval '1 second') THEN 1 ELSE portal_auth_limits.attempts + 1 END,
       window_start = CASE WHEN portal_auth_limits.window_start <= statement_timestamp() - ($2::int * interval '1 second') THEN statement_timestamp() ELSE portal_auth_limits.window_start END
     RETURNING attempts`, [authDigest(`${scope}:${value}`), windowSeconds])
  return result.rows[0].attempts <= max
}
export async function reserveAuthEmail(subjectId: string): Promise<boolean> {
  if (!await authRateLimit('email-minute', subjectId, 1, 60)) return false
  return authRateLimit('email-hour', subjectId, 5, 3600)
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

/** Lock + consume in one transaction: six wrong guesses invalidate the code. */
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

export async function savePortalPassword(token: string, passwordHash: string): Promise<boolean> {
  if (!/^[\w-]{43}$/.test(token)) return false
  return authTransaction(async client => {
    const id = authDigest(token)
    // Lock the participant before challenges to match createChallenge's order.
    const candidate = await client.query<Challenge>('SELECT * FROM portal_auth_challenges WHERE id = $1', [id])
    const target = candidate.rows[0]
    if (!target) return false
    const person = await client.query(`SELECT email FROM participants WHERE id = $1 AND is_active = true FOR UPDATE`, [target.participant_id])
    if (person.rows[0]?.email?.toLowerCase() !== target.email) return false
    const result = await client.query<Challenge>(`SELECT * FROM portal_auth_challenges WHERE id = $1
      AND purpose = 'password' AND consumed_at IS NULL AND expires_at > statement_timestamp() FOR UPDATE`, [id])
    if (!result.rows[0]) return false
    await client.query(`INSERT INTO portal_auth_credentials (participant_id, email, password_hash, version)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (participant_id) DO UPDATE SET email = EXCLUDED.email, password_hash = EXCLUDED.password_hash,
      version = EXCLUDED.version, updated_at = statement_timestamp()`, [target.participant_id, target.email, passwordHash, randomUUID()])
    await client.query(`UPDATE portal_auth_challenges SET consumed_at = statement_timestamp()
      WHERE participant_id = $1 AND consumed_at IS NULL`, [target.participant_id])
    // Resetting a password retires the participant's existing portal sessions.
    await client.query(`UPDATE auth_idle_sessions SET revoked_at = statement_timestamp()
      WHERE kind = 'portal' AND subject_id = $1 AND revoked_at IS NULL`, [target.participant_id])
    return true
  })
}
