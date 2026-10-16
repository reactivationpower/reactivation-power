import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pool } from '@workspace/db'
import { createIdleSession, readIdleSession } from '@/lib/auth/idle-session'
import { encodeSession } from '@/lib/auth/token'
import { encodeAdminSession } from '@/lib/auth/admin-token'
import app from '@/app'

process.env.SESSION_SECRET ||= 'idle-route-test-secret'
const ids: string[] = []
const subject = randomUUID()
let server: Server | undefined
let base = ''
async function cookie(kind: 'portal' | 'admin', expired = true) {
  const id = randomUUID(); ids.push(id)
  await createIdleSession(id, kind, subject, Date.now() + 86400_000)
  if (expired) await pool.query(`UPDATE auth_idle_sessions SET last_interaction_at = statement_timestamp() - interval '30 minutes' WHERE id = $1`, [id])
  return { id, value: kind === 'portal'
    ? `tp_session=${encodeSession({ sessionId: id, participantId: subject, issuedAt: Date.now() })}`
    : `tp_admin=${encodeAdminSession({ userId: subject, email: 'idle@example.invalid', name: null, role: 'super_admin' }, id)}` }
}
beforeAll(async () => {
  if (!process.env.SUPABASE_DB_URL) return
  pool.options.max = 1
  await pool.query(`INSERT INTO participants (id,email,first_name,last_name,role,is_demo,is_active)
    VALUES ($1,$2,'Idle','Route Test','owner',true,true)`, [subject, `idle-route-${subject}@example.invalid`])
  server = app.listen(0)
  await new Promise<void>(resolve => server!.on('listening', resolve))
  const address = server.address()
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/api`
})
afterAll(async () => {
  await new Promise<void>(resolve => server ? server.close(() => resolve()) : resolve())
  if (ids.length) await pool.query('DELETE FROM auth_idle_sessions WHERE id = ANY($1::uuid[])', [ids])
  if (process.env.SUPABASE_DB_URL) await pool.query('DELETE FROM participants WHERE id = $1', [subject])
  await pool.end()
})
const request = (path: string, cookie = '', method = 'GET', body?: unknown, extra = {}) =>
  fetch(base + path, { method, headers: { cookie, 'content-type': 'application/json', ...extra },
    ...(body && method !== 'GET' ? { body: JSON.stringify(body) } : {}) })

describe.skipIf(!process.env.SUPABASE_DB_URL)('idle enforcement across the protected HTTP surfaces', () => {
  it('rejects portal loaders, actions, progress, media and delayed activity', async () => {
    const portal = await cookie('portal')
    const loader = await request('/pages/portal', portal.value)
    expect(loader.headers.get('cache-control')).toBe('no-store')
    expect(((await loader.json()) as { redirect: string }).redirect).toContain('/login?reason=inactivity')
    for (const [path, method, body] of [
      ['/actions/reactivation/updateMyProfile', 'POST', { args: [] }],
      ['/progress', 'POST', { videoId: randomUUID() }],
      ['/media?pathname=videos%2Fidle-test.mp4', 'GET', undefined],
      ['/session/portal', 'POST', { interactionAgeMs: 0 }],
    ] as const) {
      expect((await request(path, portal.value, method, body, { 'X-Session-Id': portal.id })).status).toBe(401)
    }
    expect(await readIdleSession(portal.id, 'portal', subject)).toBeNull()
  })
  it('rejects admin loaders, actions, uploads and private media, including impersonation', async () => {
    const admin = await cookie('admin')
    expect(((await (await request('/pages/admin/_layout', admin.value)).json()) as { redirect: string }).redirect).toContain('/admin-login?reason=inactivity')
    for (const [path, method] of [
      ['/actions/admin-view-as/viewAsParticipant', 'POST'],
      ['/actions/admin/createCourse', 'POST'],
      ['/upload/token', 'POST'], ['/upload?name=test.txt', 'POST'],
      ['/media?pathname=videos%2Fidle-test.mp4', 'GET'],
    ]) expect((await request(path, admin.value, method, { args: [] })).status).toBe(401)
  })
  it('revokes logout cookies and refuses replay without touching another session', async () => {
    const current = await cookie('portal', false), other = await cookie('portal', false)
    const before = await readIdleSession(current.id, 'portal', subject)
    for (let i = 0; i < 3; i++) expect((await request('/session/portal', current.value)).status).toBe(200)
    expect((await readIdleSession(current.id, 'portal', subject))?.deadline).toBe(before!.deadline)
    const logout = await request('/session/portal', current.value, 'DELETE', undefined, { 'X-Session-Id': current.id })
    expect(logout.status).toBe(200)
    expect(logout.headers.get('set-cookie')).toContain('tp_session=')
    expect((await request('/session/portal', current.value)).status).toBe(401)
    expect((await request('/session/portal', other.value)).status).toBe(200)
    expect((await request('/session/portal', other.value, 'DELETE', undefined, { 'X-Session-Id': current.id })).status).toBe(401)
    expect(await readIdleSession(other.id, 'portal', subject)).not.toBeNull()
  })
  it('accepts human activity up to 30 minutes old and rejects older reports', async () => {
    const live = await cookie('portal', false)
    const post = (interactionAgeMs: number) => request('/session/portal', live.value, 'POST', { interactionAgeMs }, { 'X-Session-Id': live.id })
    expect((await post(30 * 60_000)).status).toBe(400)
    // Older than the former five-minute limit, still within 30 minutes.
    const accepted = await post(10 * 60_000)
    expect(accepted.status).toBe(200)
    const body = await accepted.json() as { deadline: number; serverNow: number }
    // A fresh session never moves backwards; the full 30 minutes remain.
    expect(body.deadline - body.serverNow).toBeGreaterThan(29 * 60_000)
    expect(body.deadline - body.serverNow).toBeLessThanOrEqual(30 * 60_000)
  })
  it('keeps public login, health, signing and checkout independent of idle cookies', async () => {
    const expired = await cookie('portal')
    for (const path of ['/pages/login', '/pages/admin-login', '/healthz']) {
      expect((await request(path, expired.value)).status).toBe(200)
    }
    for (const path of ['/pages/agreements/not-a-real-token', '/pages/pay/not-a-real-token']) {
      expect((await request(path, expired.value)).status).not.toBe(401)
    }
  })
})
