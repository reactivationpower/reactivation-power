import express from 'express'
import type { Server } from 'node:http'
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'

/**
 * The cron routes on Vercel: Preview refuses everything, a production
 * deployment answers only the safe scheduler check until SCHEDULED_JOBS=on,
 * and Vercel Cron calls are recorded as such.
 */

const f = vi.hoisted(() => ({
  run: vi.fn(async (..._args: unknown[]): Promise<Record<string, unknown>> => ({ ok: true, run: { id: 'run-1' }, summary: { customers: 0 }, incomplete: false })),
  check: vi.fn(async (trigger: string) => ({ recorded: true, hour: '2026-10-16T14', trigger })),
  tick: vi.fn(async (..._args: unknown[]) => ({ steps: {} })),
}))
vi.mock('@/lib/cron/jobs', () => ({ currentDueKey: () => '2026-10-16', runCronJob: f.run }))
vi.mock('@/lib/cron/tick', () => ({ runScheduledTick: f.tick }))
vi.mock('@/lib/cron/scheduler-check', () => ({ recordSchedulerCheck: f.check }))
vi.mock('@/lib/patient-texting/worker', () => ({ reconcileTextIntents: vi.fn(async () => ({})) }))
vi.mock('@/lib/sales-leads/wake', () => ({ NATIVE_WAKE_HEADER: 'x-wake', NATIVE_WAKE_MARKER: 'm', recordNativeWake: vi.fn(), recordVercelCronWake: vi.fn() }))
vi.mock('@/lib/request-context', () => ({ runWithRequestContext: async (_q: unknown, _s: unknown, fn: () => Promise<void>) => fn() }))
const { default: router } = await import('../cron')

let server: Server, url: string
const SECRET = 'cron-vercel-test-only'
const call = (path: string, headers: Record<string, string> = {}) =>
  fetch(url + path, { headers: { authorization: `Bearer ${SECRET}`, ...headers } })
beforeAll(async () => {
  const app = express(); app.use('/api', router); server = app.listen(0)
  await new Promise<void>((resolve) => server.on('listening', resolve))
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}`
})
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })
afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())) })

const onVercel = (env: 'production' | 'preview', jobs?: string) => {
  vi.stubEnv('CRON_SECRET', SECRET)
  vi.stubEnv('VERCEL', '1')
  vi.stubEnv('VERCEL_ENV', env)
  vi.stubEnv('SCHEDULED_JOBS', jobs ?? '')
}

it('Preview refuses every cron route, including the scheduler check', async () => {
  onVercel('preview', 'on')
  for (const path of ['/api/cron/heartbeat', '/api/cron/billing-retry', '/api/cron/workers']) {
    expect((await call(path)).status).toBe(503)
  }
  expect(f.check).not.toHaveBeenCalled()
  expect(f.run).not.toHaveBeenCalled()
})

it('before switch-over only the scheduler check runs; real jobs report skipped', async () => {
  onVercel('production')
  const check = await call('/api/cron/heartbeat', { 'user-agent': 'vercel-cron/1.0' })
  expect(check.status).toBe(200)
  expect(f.check).toHaveBeenCalledWith('vercel-cron')
  for (const path of ['/api/cron/billing-retry', '/api/cron/demo-reset', '/api/cron/workers', '/api/cron/lead-emails', '/api/cron/sales-leads', '/api/cron/patient-texting']) {
    const res = await call(path)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ok: true, skipped: true, reason: expect.stringMatching(/switch-over/) })
  }
  expect(f.run).not.toHaveBeenCalled()
  expect(f.tick).not.toHaveBeenCalled()
})

it('still requires the secret for the scheduler check', async () => {
  onVercel('production')
  expect((await fetch(url + '/api/cron/heartbeat', { headers: { authorization: 'Bearer wrong' } })).status).toBe(401)
  expect((await fetch(url + '/api/cron/heartbeat')).status).toBe(401)
  expect(f.check).not.toHaveBeenCalled()
})

it('after switch-over runs the day slot and the five-minute pass, recorded as Vercel Cron calls', async () => {
  onVercel('production', 'on')
  const res = await call('/api/cron/billing-retry', { 'user-agent': 'vercel-cron/1.0' })
  expect(res.status).toBe(200)
  expect(f.run).toHaveBeenCalledWith('billing-retry', expect.objectContaining({ trigger: 'vercel-cron', dueKey: '2026-10-16' }))
  expect((await call('/api/cron/workers', { 'user-agent': 'vercel-cron/1.0' })).status).toBe(200)
  expect(f.tick).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'vercel-cron' }))
})

it('Replit keeps running jobs without the switch', async () => {
  vi.stubEnv('CRON_SECRET', SECRET)
  vi.stubEnv('VERCEL', '')
  vi.stubEnv('VERCEL_ENV', '')
  vi.stubEnv('SCHEDULED_JOBS', '')
  expect((await call('/api/cron/auth-cleanup')).status).toBe(200)
  expect(f.run).toHaveBeenCalledWith('auth-cleanup', expect.objectContaining({ trigger: 'http' }))
})
