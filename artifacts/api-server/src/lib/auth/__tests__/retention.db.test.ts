import { randomUUID } from 'node:crypto'
import type { PoolClient } from '@workspace/db'
import type { Request } from 'express'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// Exercise actual Postgres locks and auth functions in an isolated schema.
// Never run the global cleanup against the shared practice database in tests.
const isolated = vi.hoisted(() => ({ schema: '', acquire: null as null | (() => Promise<PoolClient>) }))
vi.mock('@workspace/db', async importOriginal => {
  const actual = await importOriginal<typeof import('@workspace/db')>()
  return { ...actual, pool: {
    connect: () => isolated.acquire!(),
    query: async (text: string, values?: unknown[]) => {
      const client = await isolated.acquire!()
      try { return await client.query(text, values) } finally { client.release() }
    },
  } }
})
const actual = await vi.importActual<typeof import('@workspace/db')>('@workspace/db')
const { pool } = await import('@workspace/db')
const { cleanupAuthRecords } = await import('../retention')
const { authRateLimit, createChallenge, consumeLoginCode, pendingChallenge, savePortalPassword } = await import('../portal-challenges')
const { authDigest } = await import('../portal-password')
const { createIdleSession, readIdleSession, revokeIdleSession } = await import('../idle-session')
const { encodeSession } = await import('../token')
const { getSessionFromRequest } = await import('../session')

const subject = { id: randomUUID(), email: 'retention@example.invalid' }
const version = randomUUID()
describe.skipIf(!process.env.SUPABASE_DB_URL)('authentication retention (Postgres)', () => {
  beforeAll(async () => {
    actual.pool.options.max = 3
    isolated.schema = `auth_retention_${randomUUID().replaceAll('-', '')}`
    await actual.pool.query(`CREATE SCHEMA "${isolated.schema}"`)
    isolated.acquire = async () => {
      const client = await actual.pool.connect()
      try {
        // No public fallback: any accidental extra table access fails.
        await client.query(`SET search_path TO "${isolated.schema}"`)
        return client
      } catch (error) { client.release(); throw error }
    }
    for (const table of ['portal_auth_challenges', 'portal_auth_credentials', 'portal_auth_limits', 'auth_idle_sessions', 'portal_auth_devices']) {
      await pool.query(`CREATE TABLE ${table} (LIKE public.${table} INCLUDING ALL)`)
    }
    await pool.query('CREATE TABLE participants (id uuid PRIMARY KEY, email text, is_active boolean)')
    await pool.query('INSERT INTO participants VALUES ($1, $2, true)', [subject.id, subject.email])
    await pool.query(`INSERT INTO portal_auth_credentials (participant_id, email, password_hash, version)
      VALUES ($1, $2, 'unused', $3)`, [subject.id, subject.email, version])
    await pool.query('CREATE TABLE sessions (id text); CREATE TABLE activity_events (id text)')
    await pool.query(`INSERT INTO sessions VALUES ('history'); INSERT INTO activity_events VALUES ('history')`)
  }, 20_000)
  afterAll(async () => {
    if (isolated.schema) await actual.pool.query(`DROP SCHEMA "${isolated.schema}" CASCADE`)
    await actual.pool.end()
  }, 20_000)

  it('deletes old expired/consumed codes and rejects replay for both purposes', async () => {
    for (const purpose of ['login', 'password'] as const) {
      for (const column of ['expires_at', 'consumed_at']) {
        const challenge = await createChallenge(subject, purpose, version)
        await pool.query(`UPDATE portal_auth_challenges SET ${column} = statement_timestamp() - interval '2 days'
          WHERE id = $1`, [authDigest(challenge.token)])
        expect((await cleanupAuthRecords()).challengesDeleted).toBe(1)
        expect(await pendingChallenge(challenge.token, purpose)).toBeNull()
        expect(await consumeLoginCode(challenge.token, challenge.code ?? '123456')).toEqual({ ok: false, remaining: 0 })
        expect(await savePortalPassword(challenge.token, 'not-written')).toBeNull()
      }
    }
    const live = await createChallenge(subject, 'login', version)
    const livePassword = await createChallenge(subject, 'password', null)
    await Promise.all([cleanupAuthRecords(), cleanupAuthRecords()])
    expect(await pendingChallenge(live.token, 'login')).not.toBeNull()
    expect(await pendingChallenge(livePassword.token, 'password')).not.toBeNull()
    expect((await consumeLoginCode(live.token, live.code!)).ok).toBe(true)
    expect((await cleanupAuthRecords()).challengesDeleted).toBe(0) // grace period
  }, 20_000)

  it('preserves current and long windows, deletes obsolete and legacy counters, and grants no extra guesses', async () => {
    const value = randomUUID()
    expect(await authRateLimit('test', value, 1, 60)).toBe(true)
    await Promise.all([cleanupAuthRecords(), cleanupAuthRecords(), authRateLimit('test', value, 1, 60)])
    expect(await authRateLimit('test', value, 1, 60)).toBe(false)
    await pool.query(`INSERT INTO portal_auth_limits (key, window_start, window_seconds) VALUES
      ('old', statement_timestamp() - interval '3 days', 60),
      ('legacy-old', statement_timestamp() - interval '3 days', NULL),
      ('legacy-current', statement_timestamp(), NULL),
      ('long', statement_timestamp() - interval '2 days', 604800)`)
    expect((await cleanupAuthRecords()).rateLimitsDeleted).toBe(2)
    expect((await pool.query(`SELECT key FROM portal_auth_limits WHERE key IN ('long', 'legacy-current')`)).rowCount).toBe(2)
    // Force cleanup to wait behind a renewal: DELETE must recheck the new window.
    const key = authDigest(`test:${value}`)
    await pool.query(`UPDATE portal_auth_limits SET window_start = statement_timestamp() - interval '3 days' WHERE key = $1`, [key])
    const writer = await pool.connect()
    try {
      await writer.query('BEGIN')
      await writer.query('UPDATE portal_auth_limits SET window_start = statement_timestamp(), attempts = 1 WHERE key = $1', [key])
      const pid = (await writer.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
      const cleanup = cleanupAuthRecords()
      await expect.poll(async () => (await pool.query(
        'SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE $1::int = ANY(pg_blocking_pids(pid))) AS blocked',
        [pid],
      )).rows[0].blocked).toBe(true)
      await writer.query('COMMIT')
      await cleanup
    } finally { await writer.query('ROLLBACK'); writer.release() }
    expect(await authRateLimit('test', value, 1, 60)).toBe(false)
  }, 20_000)

  it('deletes expired, revoked and idle sessions without reviving cookies or touching live sessions/history', async () => {
    for (const kind of ['portal', 'admin'] as const) {
      const live = randomUUID()
      await createIdleSession(live, kind, subject.id, Date.now() + 86400_000)
      for (const column of ['expires_at', 'revoked_at', 'last_interaction_at']) {
        const id = randomUUID()
        await createIdleSession(id, kind, subject.id, Date.now() + 86400_000)
        await pool.query(`UPDATE auth_idle_sessions SET ${column} = statement_timestamp() - interval '2 days' WHERE id = $1`, [id])
        expect((await cleanupAuthRecords()).idleSessionsDeleted).toBe(1)
        expect(await readIdleSession(id, kind, subject.id, 0)).toBeNull()
        await expect(createIdleSession(randomUUID(), kind, subject.id, Date.now() + 86400_000, id)).rejects.toThrow('Session expired')
        const cookie = encodeSession({ participantId: subject.id, sessionId: id, issuedAt: Date.now(), credentialVersion: version })
        expect(await getSessionFromRequest({ cookies: { tp_session: cookie } } as unknown as Request)).toBeNull()
      }
      await Promise.all([cleanupAuthRecords(), cleanupAuthRecords(), readIdleSession(live, kind, subject.id, 0)])
      expect(await readIdleSession(live, kind, subject.id)).not.toBeNull()
      await revokeIdleSession(live, kind)
      expect((await cleanupAuthRecords()).idleSessionsDeleted).toBe(0)
      expect(await readIdleSession(live, kind, subject.id, 0)).toBeNull()
    }
    expect((await pool.query('SELECT * FROM sessions')).rows).toEqual([{ id: 'history' }])
    expect((await pool.query('SELECT * FROM activity_events')).rows).toEqual([{ id: 'history' }])
  }, 20_000)
  it('deletes remembered computers a day after they expire or are revoked, keeping live ones', async () => {
    const insert = async (expires: string, revoked: string | null) => {
      const id = randomUUID()
      await pool.query(`INSERT INTO portal_auth_devices (id, participant_id, credential_version, expires_at, revoked_at)
        VALUES ($1, $2, $3, statement_timestamp() + $4::interval, statement_timestamp() + $5::interval)`,
      [id, subject.id, version, expires, revoked])
      return id
    }
    const live = await insert('2 days', null)
    const recentlyExpired = await insert('-1 hour', null)
    await insert('-2 days', null)
    await insert('1 day', '-2 days')
    expect((await cleanupAuthRecords()).rememberedDevicesDeleted).toBe(2)
    const left = (await pool.query('SELECT id FROM portal_auth_devices ORDER BY id')).rows.map(r => r.id)
    expect(left.sort()).toEqual([live, recentlyExpired].sort())
  }, 20_000)
})
