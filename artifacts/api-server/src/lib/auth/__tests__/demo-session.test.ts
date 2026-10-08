import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { pool } from '@workspace/db'
import { createIdleSession, revokeIdleSession } from '../idle-session'
import { isDemoSessionParticipant, readDemoSession } from '../demo-session'
import { validatePortalToken } from '../session'
import { encodeSession, SESSION_MAX_AGE } from '../token'

// Exercise the actual family checks without modifying either sales demo.
const fixtures = vi.hoisted(() => ({ locals: [crypto.randomUUID(), crypto.randomUUID()] }))
vi.mock('../../demo/config', () => ({
  DEMO_PRACTICES: fixtures.locals.map(email => ({ owner: { email } })),
  demoEmail: (local: string) => `${local}@example.invalid`,
}))
process.env.SESSION_SECRET ||= 'demo-session-test-secret'
const owners = [randomUUID(), randomUUID()]
const callers = [randomUUID(), randomUUID()]
const outsider = randomUUID()
const sessionIds: string[] = []

const payload = (participantId: string) => ({
  participantId, sessionId: randomUUID(), issuedAt: Date.now(),
})
beforeAll(async () => {
  if (!process.env.SUPABASE_DB_URL) return
  pool.options.max = 1
  for (let i = 0; i < 2; i++) {
    await pool.query(`INSERT INTO participants (id,email,first_name,last_name,role,is_demo,is_active)
      VALUES ($1,$2,'Demo','Test','owner',true,true)`,
      [owners[i], `${fixtures.locals[i]}@example.invalid`])
    await pool.query(`INSERT INTO participants (id,email,first_name,last_name,role,parent_id,is_demo,is_active)
      VALUES ($1,$2,'Demo','Caller','staff',$3,true,true)`,
      [callers[i], `${callers[i]}@example.invalid`, owners[i]])
  }
  await pool.query(`INSERT INTO participants (id,email,first_name,last_name,role,is_demo,is_active)
    VALUES ($1,$2,'Outside','Test','owner',true,true)`, [outsider, `${outsider}@example.invalid`])
})
afterAll(async () => {
  if (process.env.SUPABASE_DB_URL) {
    if (sessionIds.length) await pool.query('DELETE FROM auth_idle_sessions WHERE id = ANY($1::uuid[])', [sessionIds])
    await pool.query('DELETE FROM participants WHERE id = ANY($1::uuid[])', [[...owners, ...callers, outsider]])
  }
  await pool.end()
})

describe.skipIf(!process.env.SUPABASE_DB_URL)('the two sales-demo families retain their original sign-in behavior', () => {
  it('keeps both owners and both caller views authenticated after a long idle period', async () => {
    for (const participantId of [...owners, ...callers]) {
      const p = payload(participantId)
      sessionIds.push(p.sessionId)
      await createIdleSession(p.sessionId, 'portal', participantId, p.issuedAt + SESSION_MAX_AGE * 1000)
      await pool.query(`UPDATE auth_idle_sessions SET last_interaction_at = statement_timestamp() - interval '1 day' WHERE id = $1`, [p.sessionId])
      expect(await isDemoSessionParticipant(participantId)).toBe(true)
      const state = await readDemoSession(p)
      expect(state?.inactivityExempt).toBe(true)
      expect(state!.deadline - state!.serverNow).toBeGreaterThan(29 * 86400_000)
      expect(await validatePortalToken(encodeSession(p))).toEqual(p)
    }
  })
  it('preserves existing signed demo cookies issued before idle tracking', async () => {
    const p = payload(owners[0]!)
    expect(await validatePortalToken(encodeSession(p))).toEqual(p)
    expect((await readDemoSession(p))?.inactivityExempt).toBe(true)
  })
  it('does not let an arbitrary demo flag or a real account claim the exemption', async () => {
    expect(await isDemoSessionParticipant(outsider)).toBe(false)
    expect(await readDemoSession(payload(outsider))).toBeNull()
    expect(await validatePortalToken(encodeSession(payload(outsider)))).toBeNull()
    await pool.query('UPDATE participants SET is_demo = false WHERE id = $1', [callers[0]])
    expect(await readDemoSession(payload(callers[0]!))).toBeNull()
    await pool.query('UPDATE participants SET is_demo = true WHERE id = $1', [callers[0]])
  })
  it('still honors explicit sign-out and the original absolute cookie expiration', async () => {
    const p = payload(owners[0]!)
    sessionIds.push(p.sessionId)
    await createIdleSession(p.sessionId, 'portal', p.participantId, Date.now() + 86400_000)
    await revokeIdleSession(p.sessionId, 'portal')
    expect(await readDemoSession(p)).toBeNull()
    expect(await validatePortalToken(encodeSession(p))).toBeNull()
    expect(await validatePortalToken(encodeSession({
      ...payload(owners[1]!), issuedAt: Date.now() - SESSION_MAX_AGE * 1000,
    }))).toBeNull()
  })
})
