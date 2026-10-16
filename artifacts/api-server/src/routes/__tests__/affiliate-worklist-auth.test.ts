import express from 'express'
import type { Server } from 'node:http'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ role: null as string | null, worklist: vi.fn().mockResolvedValue({ rows: [] }) }))
vi.mock('@/lib/auth/admin-session', async original => ({
  ...await original<typeof import('@/lib/auth/admin-session')>(),
  getAdminSessionFromRequest: vi.fn(async () => auth.role ? { role: auth.role } : null),
}))
vi.mock('@/actions/affiliates', () => ({ getAffiliatePayoutWorklist: auth.worklist }))
const { default: actions } = await import('../actions')
let server: Server, base: string
beforeAll(async () => {
  const app = express()
  app.use(express.json(), actions)
  server = app.listen(0)
  await new Promise<void>(resolve => server.on('listening', resolve))
  const address = server.address()
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
})
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())) })
beforeEach(() => { auth.role = null; auth.worklist.mockClear() })
it.each([null, 'sales_rep', 'sales_manager'])('blocks affiliate-only/anonymous and non-super-admin sessions (%s)', async role => {
  auth.role = role
  const r = await fetch(base + '/actions/affiliates/getAffiliatePayoutWorklist', {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: 'pp_affiliate=affiliate-only-session' },
    body: JSON.stringify({ args: ['2026-05'] }),
  })
  expect(r.status).toBe(401)
  expect(auth.worklist).not.toHaveBeenCalled()
})
it('allows only a super-admin through the global action gate', async () => {
  auth.role = 'super_admin'
  const r = await fetch(base + '/actions/affiliates/getAffiliatePayoutWorklist', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ args: ['2026-05'] }),
  })
  expect(r.status).toBe(200)
  expect(auth.worklist).toHaveBeenCalledWith('2026-05')
})
