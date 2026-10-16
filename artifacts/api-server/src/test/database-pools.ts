import { afterAll, vi } from 'vitest'
import type { Pool as PgPool } from 'pg'
import { flushDatabaseReadTracking, trackDatabasePool } from '../../../../lib/db/src/read-tracking'

// File isolation also isolates this registry. Always release clients before the
// next suite, including suites whose setup fails before their own cleanup runs.
const pools = vi.hoisted(() => new Set<PgPool>())
vi.mock('pg', async importOriginal => {
  const original = await importOriginal<typeof import('pg')>()
  class TestPool extends original.default.Pool {
    constructor(options?: import('pg').PoolConfig) {
      super({ ...options, max: Math.min(options?.max ?? 2, 2) })
      pools.add(this)
      trackDatabasePool(this)
    }
  }
  return { ...original, Pool: TestPool, default: { ...original.default, Pool: TestPool } }
})

afterAll(async () => {
  await Promise.all([...pools].filter(pool => !pool.ended).map(pool => pool.end()))
  pools.clear()
  flushDatabaseReadTracking()
})
