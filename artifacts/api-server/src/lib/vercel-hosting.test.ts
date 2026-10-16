import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertRealEffectsAllowed, deploymentTarget, isVercelPreview, PreviewSafetyError } from '@/lib/deployment-safety'

const TEST_KEY = 'sk_test_fixture'
const LIVE_KEY = 'sk_live_fixture'

/** Fresh copy of the Stripe module, so its once-per-instance cache starts empty. */
async function loadStripe(env: Record<string, string | undefined>) {
  for (const name of ['VERCEL', 'VERCEL_ENV', 'STRIPE_MODE', 'STRIPE_SECRET_KEY', 'STRIPE_TEST_SECRET_KEY',
    'STRIPE_TEST_PUBLISHABLE_KEY', 'REPLIT_CONNECTORS_HOSTNAME', 'REPL_IDENTITY', 'WEB_REPL_RENEWAL']) vi.stubEnv(name, '')
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value ?? '')
  vi.resetModules()
  return import('@/lib/stripe')
}

describe('deployment target', () => {
  it('treats Replit (no VERCEL variable) as unrestricted', () => {
    expect(deploymentTarget({})).toBe('replit')
    expect(() => assertRealEffectsAllowed('Anything', {})).not.toThrow()
  })
  it('treats only VERCEL_ENV=production as production on Vercel', () => {
    expect(deploymentTarget({ VERCEL: '1', VERCEL_ENV: 'production' })).toBe('vercel-production')
    for (const VERCEL_ENV of ['preview', 'development', undefined]) {
      expect(isVercelPreview({ VERCEL: '1', VERCEL_ENV })).toBe(true)
      expect(() => assertRealEffectsAllowed('Sending', { VERCEL: '1', VERCEL_ENV })).toThrow(PreviewSafetyError)
    }
  })
})

describe('Stripe mode selection', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('uses direct test keys off Replit when STRIPE_MODE=test', async () => {
    const s = await loadStripe({ VERCEL: '1', VERCEL_ENV: 'preview', STRIPE_MODE: 'test', STRIPE_TEST_SECRET_KEY: TEST_KEY, STRIPE_SECRET_KEY: LIVE_KEY })
    await expect(s.initStripe()).resolves.toBe('test')
  })
  it('never falls back from test to live keys', async () => {
    const explicit = await loadStripe({ STRIPE_MODE: 'test', STRIPE_SECRET_KEY: LIVE_KEY, NODE_ENV: 'development' })
    await expect(explicit.initStripe()).rejects.toThrow(/no Stripe test keys/)
    const implicit = await loadStripe({ STRIPE_SECRET_KEY: LIVE_KEY, NODE_ENV: 'development' })
    await expect(implicit.initStripe()).rejects.toThrow(/STRIPE_MODE=live to use live keys on purpose/)
  })
  it('requires an explicit mode on Vercel and refuses live on Preview', async () => {
    const unset = await loadStripe({ VERCEL: '1', VERCEL_ENV: 'production', NODE_ENV: 'production', STRIPE_SECRET_KEY: LIVE_KEY })
    await expect(unset.initStripe()).rejects.toThrow(/must be set/)
    const preview = await loadStripe({ VERCEL: '1', VERCEL_ENV: 'preview', STRIPE_MODE: 'live', STRIPE_SECRET_KEY: LIVE_KEY })
    await expect(preview.initStripe()).rejects.toThrow(/not allowed on Vercel Preview/)
    const production = await loadStripe({ VERCEL: '1', VERCEL_ENV: 'production', STRIPE_MODE: 'live', STRIPE_SECRET_KEY: LIVE_KEY })
    await expect(production.initStripe()).resolves.toBe('live')
  })
  it('keeps the Replit deployment live by default', async () => {
    const s = await loadStripe({ NODE_ENV: 'production', STRIPE_SECRET_KEY: LIVE_KEY })
    await expect(s.initStripe()).resolves.toBe('live')
  })
  it('rejects a test key used as the live key', async () => {
    const s = await loadStripe({ STRIPE_MODE: 'live', STRIPE_SECRET_KEY: TEST_KEY })
    await expect(s.initStripe()).rejects.toThrow(/is a test key/)
  })
})

describe('Preview leaves production queues untouched', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.doUnmock('@workspace/db'); vi.resetModules() })
  it('sales, appointment and inbox workers return before touching the database', async () => {
    vi.stubEnv('VERCEL', '1')
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('NODE_ENV', 'production')
    vi.resetModules()
    const touched = vi.fn(() => { throw new Error('database touched on Preview') })
    vi.doMock('@workspace/db', () => ({ pool: { query: touched, connect: touched }, db: new Proxy({}, { get: touched }) }))
    const { runSalesWorker, drainSalesSync } = await import('@/lib/sales-leads/worker')
    const { runAppointmentMessages } = await import('@/lib/appointment-messages/worker')
    const { runInboxInbound } = await import('@/lib/sales-inbox/inbound')
    const { nudgeSalesSync } = await import('@/lib/sales-leads/dispatch')
    await runSalesWorker()
    await expect(drainSalesSync()).resolves.toBe(false)
    await runAppointmentMessages()
    await runInboxInbound()
    nudgeSalesSync()
    await new Promise(resolve => setImmediate(resolve))
    expect(touched).not.toHaveBeenCalled()
  })
})

describe('Preview refuses manual inbox sends before changing anything', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.doUnmock('@workspace/db'); vi.doUnmock('@/lib/auth/admin-session'); vi.resetModules() })
  it('throws before opening a database connection', async () => {
    vi.stubEnv('VERCEL', '1')
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.resetModules()
    const touched = vi.fn(() => { throw new Error('database touched on Preview') })
    vi.doMock('@workspace/db', () => ({ pool: { query: touched, connect: touched }, db: new Proxy({}, { get: touched }) }))
    vi.doMock('@/lib/auth/admin-session', () => ({ requireAdmin: async () => ({ userId: 'fixture-admin', role: 'super_admin' }) }))
    const { sendMessage } = await import('@/actions/sales-inbox')
    await expect(sendMessage({ leadId: 'lead-fixture', channel: 'sms', body: 'Hello', requestId: '00000000-0000-4000-8000-000000000000' }))
      .rejects.toMatchObject({ name: 'PreviewSafetyError' })
    expect(touched).not.toHaveBeenCalled()
  })
})
