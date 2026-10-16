import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const isolated = vi.hoisted(() => ({ schema: '' }))
vi.mock('@workspace/db', async importOriginal => {
  const actual = await importOriginal<typeof import('@workspace/db')>()
  const { randomUUID } = await import('node:crypto')
  isolated.schema = `cron_test_${randomUUID().replaceAll('-', '')}`
  // Configure every connection before the first query. No public fallback:
  // scheduler queries and cleanup can only see this invocation's fixtures.
  actual.pool.options.options = `-c search_path=${isolated.schema}`
  return actual
})

/**
 * The slot claim against a real Postgres: concurrent scheduler + external
 * triggers for the same ET day must produce exactly one run, and a crashed
 * run must be re-claimable while a live one is not. Uses the workspace
 * database (SUPABASE_DB_URL) in a per-run disposable schema and cleans up
 * only that schema; skipped when no database is configured.
 */

const DUE_KEY = '2999-01-01'
const hasDb = Boolean(process.env.SUPABASE_DB_URL)

let started = 0
let holdRetry: Promise<void> | null = null
const retry = vi.fn(async () => {
  started += 1
  if (holdRetry) await holdRetry
  return { customers: 0, invoices: 0, paid: 0, failed: 0, details: [] }
})
vi.mock('@/lib/billing/dunning', () => ({ retryPastDueInvoices: retry }))
vi.mock('@/actions/enrollment', () => ({ reconcilePendingEnrollments: vi.fn(async () => ({ examined: 0, completed: 0 })) }))
vi.mock('@/lib/demo/seed', () => ({ ensureAllDemosSeeded: vi.fn(async () => ({ status: 'fresh' })) }))
vi.mock('@/lib/mail', () => ({ sendEmail: vi.fn(async (..._args: unknown[]) => ({ ok: true, logId: 'log' })) }))
const authCleanup = vi.fn(async () => ({ challengesDeleted: 0, rateLimitsDeleted: 0, idleSessionsDeleted: 0 }))
vi.mock('@/lib/auth/retention', () => ({ cleanupAuthRecords: authCleanup }))
// This suite exercises shared-DB slot claims, not live affiliate retention or financial work.
vi.mock('@/lib/affiliates/retention', () => ({ cleanupAffiliateTelemetry: vi.fn(async () => ({})) }))
vi.mock('@/lib/affiliates/ledger', () => ({ retryAffiliateHistory: vi.fn(async () => ({})) }))
vi.mock('@/lib/marketing/reconcile', () => ({
  cleanupMarketing: vi.fn(async () => ({})),
  reconcileMarketing: vi.fn(async () => ({ recorded: 0 })),
}))

const { cronRunsTable, db, pool } = await import('@workspace/db')
const { runCronJob, CRON_RUN_STALE_MS } = await import('@/lib/cron/jobs')

const MARK = 'cron-db-test'
const cleanup = async () => {
  await db.delete(cronRunsTable).where(and(eq(cronRunsTable.job, 'billing-retry'), eq(cronRunsTable.dueKey, DUE_KEY)))
  await db.delete(cronRunsTable).where(and(eq(cronRunsTable.job, 'billing-retry'), eq(cronRunsTable.actor, MARK)))
  await db.delete(cronRunsTable).where(and(eq(cronRunsTable.job, 'auth-cleanup'), eq(cronRunsTable.dueKey, DUE_KEY)))
}

describe.skipIf(!hasDb)('cron slot claim (Postgres)', { timeout: 25000 }, () => {
  beforeAll(async () => {
    await pool.query(`CREATE SCHEMA "${isolated.schema}"`)
    await pool.query('CREATE TABLE cron_runs (LIKE public.cron_runs INCLUDING ALL)')
  })
  afterAll(async () => {
    try { await pool.query(`DROP SCHEMA IF EXISTS "${isolated.schema}" CASCADE`) }
    finally { await pool.end() }
  })

  it('claims the authentication cleanup slot only once across concurrent triggers', async () => {
    const outcomes = await Promise.all([
      runCronJob('auth-cleanup', { trigger: 'scheduler', dueKey: DUE_KEY }),
      runCronJob('auth-cleanup', { trigger: 'http', dueKey: DUE_KEY }),
      runCronJob('auth-cleanup', { trigger: 'scheduler', dueKey: DUE_KEY }),
    ])
    expect(authCleanup).toHaveBeenCalledTimes(1)
    expect(outcomes.filter(o => !('skipped' in o))).toHaveLength(1)
    expect(outcomes.filter(o => 'skipped' in o)).toHaveLength(2)
    const rows = await db.select().from(cronRunsTable).where(and(eq(cronRunsTable.job, 'auth-cleanup'), eq(cronRunsTable.dueKey, DUE_KEY)))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ status: 'ok', summary: { challengesDeleted: 0, rateLimitsDeleted: 0, idleSessionsDeleted: 0 } })
  })

  it('scheduler instances and the external trigger racing for one slot run it once', async () => {
    const outcomes = await Promise.all([
      runCronJob('billing-retry', { trigger: 'scheduler', dueKey: DUE_KEY }),
      runCronJob('billing-retry', { trigger: 'scheduler', dueKey: DUE_KEY }),
      runCronJob('billing-retry', { trigger: 'http', dueKey: DUE_KEY }),
      runCronJob('billing-retry', { trigger: 'http', dueKey: DUE_KEY }),
    ])
    expect(started).toBe(1)
    expect(outcomes.filter((o) => !('skipped' in o))).toHaveLength(1)
    expect(outcomes.filter((o) => 'skipped' in o)).toHaveLength(3)
    const rows = await db.select().from(cronRunsTable).where(and(eq(cronRunsTable.job, 'billing-retry'), eq(cronRunsTable.dueKey, DUE_KEY)))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ status: 'ok' })

    // Later trigger for the same slot: nothing happens.
    const later = await runCronJob('billing-retry', { trigger: 'http', dueKey: DUE_KEY })
    expect(later).toMatchObject({ skipped: true, reason: `already ran for ${DUE_KEY}` })
    expect(started).toBe(1)
  })

  it('manual, forced and scheduled triggers never run the same job at the same time', async () => {
    await cleanup()
    const before = started
    let release!: () => void
    holdRetry = new Promise<void>(resolve => { release = resolve })
    let settled = 0
    const attempts = [
      runCronJob('billing-retry', { trigger: 'admin', actor: MARK }),
      runCronJob('billing-retry', { trigger: 'admin', actor: MARK }),
      runCronJob('billing-retry', { trigger: 'http', actor: MARK }), // ?force=1
      runCronJob('billing-retry', { trigger: 'scheduler', dueKey: DUE_KEY, actor: MARK }),
    ].map(attempt => attempt.finally(() => { settled += 1 }))
    try {
      // Do not guess how quickly the remote pool can process four claims.
      // Keep the winner running until every competing claim has returned.
      await vi.waitFor(() => expect(settled).toBe(3), { timeout: 15000, interval: 20 })
    } finally {
      release()
      holdRetry = null
      await Promise.allSettled(attempts)
    }
    const outcomes = await Promise.all(attempts)
    expect(started - before).toBe(1)
    expect(outcomes.filter((o) => !('skipped' in o))).toHaveLength(1)
    for (const o of outcomes.filter((o) => 'skipped' in o)) expect(o).toMatchObject({ reason: 'a run is already in progress' })

    // Once it finishes, the scheduled slot is still free to run (it was not consumed by the skip).
    const slot = await runCronJob('billing-retry', { trigger: 'scheduler', dueKey: DUE_KEY, actor: MARK })
    const slotSkippedEarlier = outcomes[3] && 'skipped' in outcomes[3]
    if (slotSkippedEarlier) expect(slot).not.toHaveProperty('skipped')
    else expect(slot).toMatchObject({ skipped: true, reason: `already ran for ${DUE_KEY}` })
  })

  it('a slot stuck in "running" is re-claimed only once it is stale', async () => {
    await cleanup()
    await db.insert(cronRunsTable).values({ id: 'live-' + DUE_KEY, job: 'billing-retry', dueKey: DUE_KEY, trigger: 'scheduler', status: 'running', startedAt: new Date() })
    const before = started
    const blocked = await runCronJob('billing-retry', { trigger: 'scheduler', dueKey: DUE_KEY })
    expect(blocked).toMatchObject({ skipped: true, reason: 'a run is already in progress' })
    const manualBlocked = await runCronJob('billing-retry', { trigger: 'admin', actor: MARK })
    expect(manualBlocked).toMatchObject({ skipped: true, reason: 'a run is already in progress' })
    expect(started).toBe(before)

    await db
      .update(cronRunsTable)
      .set({ startedAt: new Date(Date.now() - CRON_RUN_STALE_MS - 60_000) })
      .where(eq(cronRunsTable.id, 'live-' + DUE_KEY))
    const taken = await runCronJob('billing-retry', { trigger: 'scheduler', dueKey: DUE_KEY })
    expect(taken).not.toHaveProperty('skipped')
    expect(started).toBe(before + 1)
    const rows = await db.select().from(cronRunsTable).where(and(eq(cronRunsTable.job, 'billing-retry'), eq(cronRunsTable.dueKey, DUE_KEY)))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ status: 'ok' })
    expect(rows[0]?.id).not.toBe('live-' + DUE_KEY)
  })
})
