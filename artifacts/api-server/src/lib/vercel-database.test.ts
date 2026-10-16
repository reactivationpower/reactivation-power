import { EventEmitter } from 'node:events'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RuntimePool, poolHost, runtimePoolSettings } from '../../../../lib/db/src/pool-settings'
import { attachVercelPoolCleanup } from '../../../../lib/db/src/vercel-pool'
import { continueAfterResponse } from './background-work'

// Vercel's Node runtime exposes the per-request context (waitUntil, deadline)
// through this global; @vercel/functions reads it. Tests install a fake one.
const REQUEST_CONTEXT = Symbol.for('@vercel/request-context')
type Context = { waitUntil?: (promise: Promise<unknown>) => void }
function installRequestContext(context: Context | undefined) {
  ;(globalThis as Record<symbol, unknown>)[REQUEST_CONTEXT] = context ? { get: () => context } : undefined
}

// Real pg Pool queue/lifecycle, fake socket client: never reaches any database.
class Client extends EventEmitter {
  _queryable = true
  _ending = false
  connect(cb: (error?: Error) => void) { queueMicrotask(() => cb()) }
  end() { this._ending = true; queueMicrotask(() => this.emit('end')) }
  ref() {}
  unref() {}
}
const fakePool = (env: NodeJS.ProcessEnv, overrides: Record<string, unknown> = {}) =>
  new RuntimePool({ ...runtimePoolSettings(env), ...overrides, Client } as unknown as ConstructorParameters<typeof RuntimePool>[0])

afterEach(() => { vi.unstubAllEnvs(); installRequestContext(undefined) })

describe('pool settings per host', () => {
  it('keeps the Replit workspace pool and gives Vercel a shorter idle timeout', () => {
    expect(poolHost({})).toBe('replit')
    expect(poolHost({ VERCEL: '1', VERCEL_ENV: 'production' })).toBe('vercel-production')
    expect(poolHost({ VERCEL: '1', VERCEL_ENV: 'preview' })).toBe('vercel-preview')
    expect(runtimePoolSettings({})).toMatchObject({ max: 2, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000 })
    expect(runtimePoolSettings({ VERCEL: '1', VERCEL_ENV: 'production', NODE_ENV: 'production' }))
      .toMatchObject({ max: 2, connectionTimeoutMillis: 5000, idleTimeoutMillis: 5000 })
  })
  it('lets Vercel environment variables set size and both timeouts within the shared ceiling', () => {
    const env = { VERCEL: '1', VERCEL_ENV: 'production', DB_POOL_MAX: '3', DB_POOL_ACQUIRE_TIMEOUT_MS: '8000', DB_POOL_IDLE_TIMEOUT_MS: '4000' }
    expect(runtimePoolSettings(env)).toMatchObject({ max: 3, connectionTimeoutMillis: 8000, idleTimeoutMillis: 4000 })
    expect(() => runtimePoolSettings({ ...env, DB_POOL_MAX: '16' })).toThrow('DB_POOL_MAX')
    expect(() => runtimePoolSettings({ ...env, DB_POOL_IDLE_TIMEOUT_MS: '0' })).toThrow('DB_POOL_IDLE_TIMEOUT_MS')
  })
  it('labels sessions with environment and host so pg_stat_activity can attribute them', () => {
    expect(runtimePoolSettings({ VERCEL: '1', VERCEL_ENV: 'production', NODE_ENV: 'production' }).application_name)
      .toBe(`patient-pipeline:production:vercel-production:${process.pid}`)
    expect(runtimePoolSettings({ VERCEL: '1', VERCEL_ENV: 'preview', NODE_ENV: 'production' }).application_name)
      .toBe(`patient-pipeline:production:vercel-preview:${process.pid}`)
    expect(runtimePoolSettings({ NODE_ENV: 'test' }).application_name).toBe(`patient-pipeline:test:replit:${process.pid}`)
  })
})

describe('Vercel idle-connection cleanup', () => {
  it('attaches nothing off Vercel, so Replit keeps plain pg idle handling', async () => {
    const pool = fakePool({})
    try {
      expect(attachVercelPoolCleanup(pool, {})).toBe(false)
      expect(pool.listenerCount('release')).toBe(0)
    } finally { await pool.end() }
  })
  it('keeps a Vercel instance awake until the released client has actually closed', async () => {
    vi.stubEnv('VERCEL_URL', 'example.vercel.app')
    vi.stubEnv('VERCEL_REGION', 'iad1')
    const held: Promise<unknown>[] = []
    installRequestContext({ waitUntil: promise => { held.push(promise) } })
    const pool = fakePool({ VERCEL: '1', VERCEL_ENV: 'production' }, { idleTimeoutMillis: 30 })
    try {
      expect(attachVercelPoolCleanup(pool, { VERCEL: '1' })).toBe(true)
      const client = await pool.connect()
      expect(pool.totalCount).toBe(1)
      client.release()
      expect(held).toHaveLength(1)
      // The instance stays awake (waitUntil pending) until after pg's own idle
      // timer, so the idle session is closed before Vercel can suspend us.
      await held[0]
      expect(pool.totalCount).toBe(0)
      expect(pool.idleCount).toBe(0)
    } finally { await pool.end() }
  })
  it('does not close a client that is still borrowed (lock holders keep their session)', async () => {
    vi.stubEnv('VERCEL_URL', 'example.vercel.app')
    vi.stubEnv('VERCEL_REGION', 'iad1')
    const held: Promise<unknown>[] = []
    installRequestContext({ waitUntil: promise => { held.push(promise) } })
    const pool = fakePool({ VERCEL: '1', VERCEL_ENV: 'production' }, { idleTimeoutMillis: 30 })
    try {
      attachVercelPoolCleanup(pool, { VERCEL: '1' })
      const first = await pool.connect()
      const second = await pool.connect()
      second.release()
      await held[0]
      // The busy client (think: holding pg_advisory_lock) survives the sweep.
      expect(pool.totalCount).toBe(1)
      expect(pool.idleCount).toBe(0)
      first.release()
    } finally { await pool.end() }
  })
})

describe('work that outlives the response', () => {
  it('registers the work with the Vercel request context and never rejects it', async () => {
    const held: Promise<unknown>[] = []
    installRequestContext({ waitUntil: promise => { held.push(promise) } })
    continueAfterResponse(Promise.reject(new Error('worker failed')))
    expect(held).toHaveLength(1)
    await expect(held[0]).resolves.toBeUndefined()
  })
  it('is a plain fire-and-forget off Vercel', () => {
    installRequestContext(undefined)
    expect(() => continueAfterResponse(Promise.resolve())).not.toThrow()
  })
  it('keeps the instance awake for the whole post-commit sales drain', async () => {
    const held: Promise<unknown>[] = []
    installRequestContext({ waitUntil: promise => { held.push(promise) } })
    vi.resetModules()
    let finish!: (value: boolean) => void
    const drain = vi.fn().mockImplementationOnce(() => new Promise<boolean>(resolve => { finish = resolve })).mockResolvedValue(false)
    vi.doMock('./sales-leads/worker', () => ({ drainSalesSync: drain }))
    try {
      const { nudgeSalesSync } = await import('./sales-leads/dispatch')
      nudgeSalesSync()
      expect(held).toHaveLength(1)
      let settled = false
      void held[0].then(() => { settled = true })
      await vi.waitFor(() => expect(drain).toHaveBeenCalledTimes(1))
      nudgeSalesSync() // coalesced into the running loop; no second registration needed
      expect(held).toHaveLength(1)
      expect(settled).toBe(false)
      finish(false)
      await vi.waitFor(() => expect(drain).toHaveBeenCalledTimes(2))
      await held[0]
      expect(settled).toBe(true)
    } finally { vi.doUnmock('./sales-leads/worker'); vi.resetModules() }
  })
})

/** Session advisory locks belong to one Postgres session. They are only safe
 * when lock, work and unlock run on one dedicated pooled client (session
 * pooler), never through pool.query, which may pick any client. */
describe('session-lock discipline', () => {
  const root = path.resolve(__dirname, '..')
  const sources: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const file = path.join(dir, name)
      if (statSync(file).isDirectory()) { if (name !== 'test' && name !== 'shims') walk(file) }
      else if (/\.ts$/.test(name) && !/\.test\.ts$/.test(name)) sources.push(file)
    }
  }
  walk(root)
  const sessionLocked = sources.filter(file => /pg_(try_)?advisory_lock\(/.test(readFileSync(file, 'utf8')))
  it('covers the four session-lock paths', () => {
    expect(sessionLocked.map(file => path.relative(root, file)).sort()).toEqual([
      'actions/sales-inbox.ts',
      'lib/appointment-messages/worker.ts',
      'lib/booking-handoff.ts',
      'lib/sales-inbox/inbound.ts',
    ])
  })
  it.each(sessionLocked.map(file => [path.relative(root, file), file]))('%s locks and unlocks on one dedicated client', (_name, file) => {
    const source = readFileSync(file, 'utf8')
    expect(source).toMatch(/pool\.connect\(\)/)
    expect(source).toMatch(/pg_advisory_unlock\(/)
    // A failed unlock must destroy the client rather than return a locked session.
    expect(source).toMatch(/release\(true\)/)
  })
  it('never runs advisory lock functions through pool.query or a drizzle execute', () => {
    for (const file of sources) {
      const source = readFileSync(file, 'utf8')
      expect(source, path.relative(root, file)).not.toMatch(/pool\.query\([^)]*pg_(try_)?advisory/)
      expect(source, path.relative(root, file)).not.toMatch(/\bdb\.execute\([^)]*pg_(try_)?advisory/)
    }
  })
})
