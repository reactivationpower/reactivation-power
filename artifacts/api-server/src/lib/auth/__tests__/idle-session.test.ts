import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pool } from '@workspace/db'
import { createIdleSession, IDLE_TIMEOUT_MS, readIdleSession, revokeIdleSession } from '../idle-session'
import { decodeAdminSession, encodeAdminSession } from '../admin-token'
import { decodeSession, encodeSession } from '../token'
import { getSessionFromRequest } from '../session'
import type { Request } from 'express'

process.env.SESSION_SECRET ||= 'idle-test-secret'
const ids: string[] = []
const subject = randomUUID()
beforeAll(() => { pool.options.max = 1 })
async function fresh(kind: 'portal' | 'admin' = 'portal') {
  const id = randomUUID()
  ids.push(id)
  await createIdleSession(id, kind, subject, Date.now() + 86_400_000)
  return id
}
afterAll(async () => {
  if (ids.length) await pool.query('DELETE FROM auth_idle_sessions WHERE id = ANY($1::uuid[])', [ids])
  await pool.end()
})

describe.skipIf(!process.env.SUPABASE_DB_URL)('durable per-session inactivity', () => {
  it('rejects at the exact 30-minute boundary and cannot be revived by late activity', async () => {
    const id = await fresh()
    await pool.query(`UPDATE auth_idle_sessions SET last_interaction_at = statement_timestamp() - interval '30 minutes' WHERE id = $1`, [id])
    expect(await readIdleSession(id, 'portal', subject)).toBeNull()
    expect(await readIdleSession(id, 'portal', subject, 0)).toBeNull()
    const replay = encodeSession({ participantId: subject, sessionId: id, issuedAt: Date.now() })
    expect(await getSessionFromRequest({ cookies: { tp_session: replay } } as unknown as Request)).toBeNull()
  })
  it('extends a live session only through human activity, not read-only polling', async () => {
    const id = await fresh()
    await pool.query(`UPDATE auth_idle_sessions SET last_interaction_at = statement_timestamp() - interval '29 minutes' WHERE id = $1`, [id])
    const before = await readIdleSession(id, 'portal', subject)
    expect(before).not.toBeNull()
    for (let i = 0; i < 3; i++) expect((await readIdleSession(id, 'portal', subject))?.deadline).toBe(before!.deadline)
    const updated = await readIdleSession(id, 'portal', subject, 1000)
    expect(updated!.deadline - before!.deadline).toBeGreaterThan(29 * 60_000 - 5_000)
    // A late older interaction must not move the timestamp backwards.
    expect((await readIdleSession(id, 'portal', subject, 60_000))?.deadline).toBe(updated!.deadline)
  })
  it('revokes just one session, including concurrent activity, not another device', async () => {
    const one = await fresh('admin'), two = await fresh('admin')
    await Promise.all([readIdleSession(one, 'admin', subject, 0), revokeIdleSession(one, 'admin')])
    expect(await readIdleSession(one, 'admin', subject, 0)).toBeNull()
    expect(await readIdleSession(two, 'admin', subject)).not.toBeNull()
    expect(await readIdleSession(two, 'portal', subject)).toBeNull()
    expect(await readIdleSession(two, 'admin', randomUUID())).toBeNull()
  })
  it('rejects old signed portal cookies without trustworthy idle state', async () => {
    const id = randomUUID()
    const token = encodeSession({ sessionId: id, participantId: subject, issuedAt: Date.now() })
    expect(decodeSession(token)).not.toBeNull()
    expect(await getSessionFromRequest({ cookies: { tp_session: token } } as unknown as Request)).toBeNull()
  })
  it('stays signed in after 29 idle minutes, with the deadline 30 minutes after the last activity', async () => {
    const id = await fresh()
    await pool.query(`UPDATE auth_idle_sessions SET last_interaction_at = statement_timestamp() - interval '29 minutes' WHERE id = $1`, [id])
    const state = await readIdleSession(id, 'portal', subject)
    expect(state).not.toBeNull()
    expect(state!.deadline - state!.serverNow).toBeGreaterThan(55_000)
    expect(state!.deadline - state!.serverNow).toBeLessThanOrEqual(60_000)
    expect(IDLE_TIMEOUT_MS).toBe(30 * 60_000)
  })
  it('keeps absolute expiration as an upper limit', async () => {
    const id = await fresh()
    await pool.query(`UPDATE auth_idle_sessions SET expires_at = statement_timestamp() - interval '1 second' WHERE id = $1`, [id])
    expect(await readIdleSession(id, 'portal', subject, 0)).toBeNull()
  })
  it('automatic demo re-sign-in inherits idle and absolute deadlines', async () => {
    const old = await fresh()
    await pool.query(`UPDATE auth_idle_sessions SET last_interaction_at = statement_timestamp() - interval '29 minutes', expires_at = statement_timestamp() + interval '30 seconds' WHERE id = $1`, [old])
    const before = await readIdleSession(old, 'portal', subject)
    const next = randomUUID(); ids.push(next)
    await createIdleSession(next, 'portal', randomUUID(), Date.now() + 86400_000, old)
    const row = await pool.query('SELECT subject_id FROM auth_idle_sessions WHERE id = $1', [next])
    expect((await readIdleSession(next, 'portal', row.rows[0].subject_id))?.deadline).toBe(before!.deadline)
    await revokeIdleSession(old, 'portal')
    const delayed = randomUUID(); ids.push(delayed)
    await expect(createIdleSession(delayed, 'portal', subject, Date.now() + 86400_000, old)).rejects.toThrow('Session expired')
  })
})

describe('signed session absolute lifetimes and legacy cookies', () => {
  it('rejects legacy admin cookies without a durable session id', () => {
    expect(decodeAdminSession(encodeAdminSession({ userId: subject, email: 'test@example.invalid', name: null, role: 'super_admin' }))).toBeNull()
  })
  it('rejects old and future-issued portal cookies', () => {
    const base = { participantId: subject, sessionId: randomUUID() }
    expect(decodeSession(encodeSession({ ...base, issuedAt: Date.now() - 30 * 86400_000 }))).toBeNull()
    expect(decodeSession(encodeSession({ ...base, issuedAt: Date.now() + 60000 }))).toBeNull()
  })
})
