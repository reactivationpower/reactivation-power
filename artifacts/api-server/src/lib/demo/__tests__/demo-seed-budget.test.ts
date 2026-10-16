import { describe, expect, it, vi } from 'vitest'

/**
 * The nightly reset runs under a cron time budget. A rebuild cannot be
 * stopped half-way, so a practice is only started while enough budget is
 * left; the rest are reported as deferred for the next run without touching
 * the database at all.
 */

const getAdminClient = vi.fn(() => { throw new Error('database must not be touched for a deferred practice') })
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient }))

const { ensureAllDemosSeeded, DEMO_PRACTICE_RESERVE_MS } = await import('@/lib/demo/seed')

describe('ensureAllDemosSeeded with a deadline', () => {
  it('defers every practice that no longer fits the budget and never opens a connection for it', async () => {
    const results = await ensureAllDemosSeeded({ force: true, deadline: Date.now() + DEMO_PRACTICE_RESERVE_MS - 1_000 })
    expect(Object.values(results)).toHaveLength(2)
    for (const r of Object.values(results)) expect(r).toEqual({ status: 'deferred' })
    expect(getAdminClient).not.toHaveBeenCalled()
  })
})
