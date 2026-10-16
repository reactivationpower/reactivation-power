import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { RuntimePool, runtimePoolSettings } from '../../../../lib/db/src/pool-settings'
import { isDatabaseUnavailable } from '../../../../lib/db/src/capacity'

// Real pg Pool queue/lifecycle, fake socket client: never reaches any database.
class Client extends EventEmitter {
  _queryable = true
  _ending = false
  connect(cb: (error?: Error) => void) { queueMicrotask(() => cb()) }
  end() { this._ending = true; queueMicrotask(() => this.emit('end')) }
  ref() {}
  unref() {}
}

describe('bounded runtime pool', () => {
  it('has conservative defaults and rejects unsafe/nonfinite settings', () => {
    expect(runtimePoolSettings({})).toMatchObject({ max: 2, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000 })
    expect(runtimePoolSettings({ DB_POOL_MAX: '1' })).toMatchObject({ max: 1 })
    for (const value of ['0', '-1', '16', '2.5', 'Infinity', '', ' 2']) {
      expect(() => runtimePoolSettings({ DB_POOL_MAX: value })).toThrow('DB_POOL_MAX')
    }
    expect(() => runtimePoolSettings({ DB_POOL_ACQUIRE_TIMEOUT_MS: '0' })).toThrow()
    expect(() => runtimePoolSettings({ DB_POOL_IDLE_TIMEOUT_MS: '0' })).toThrow()
  })
  it('bounds connections, times out queued borrowers, recovers after release and idle error', async () => {
    const pool = new RuntimePool({ ...runtimePoolSettings({ DB_POOL_MAX: '1' }), connectionTimeoutMillis: 20,
      Client } as unknown as ConstructorParameters<typeof RuntimePool>[0])
    const errors = vi.fn()
    pool.on('error', errors)
    try {
      const first = await pool.connect()
      await expect(pool.connect()).rejects.toThrow('timeout exceeded')
      expect(pool.totalCount).toBe(1)
      expect(pool.waitingCount).toBe(0)
      first.release()
      const second = await pool.connect()
      expect(second).toBe(first)
      second.release()
      second.emit('error', Object.assign(new Error('socket lost'), { code: 'ECONNRESET' }))
      expect(errors).toHaveBeenCalledOnce()
      const replacement = await pool.connect()
      expect(replacement).not.toBe(first)
      expect(pool.totalCount).toBe(1)
      replacement.release()
    } finally { await pool.end() }
    expect(pool.totalCount).toBe(0)
  })
  it('recognizes wrapped capacity failures without classifying validation errors', () => {
    expect(isDatabaseUnavailable({ cause: { code: '53300' } })).toBe(true)
    expect(isDatabaseUnavailable(new Error('(EMAXCONNSESSION) max clients reached'))).toBe(true)
    expect(isDatabaseUnavailable(new Error('timeout exceeded when trying to connect'))).toBe(true)
    expect(isDatabaseUnavailable(new Error('Invalid affiliate status'))).toBe(false)
    const cycle: { cause?: unknown } = {}; cycle.cause = cycle
    expect(isDatabaseUnavailable(cycle)).toBe(false)
  })
})
