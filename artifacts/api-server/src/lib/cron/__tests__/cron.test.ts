import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The scheduler's due-slot arithmetic and the run bookkeeping: one claim per
 * (job, ET day), stale crashes re-claimable, failures recorded and emailed.
 * The database is an in-memory stand-in that honours the unique index the
 * way Postgres would; the jobs themselves are spies.
 */

type Row = Record<string, unknown> & { id: string; job: string; dueKey: string | null; status: string; startedAt: Date }
const rows: Row[] = []
vi.mock('@/lib/marketing/reconcile',()=>({
  cleanupMarketing:vi.fn(async()=>({aggregateGroups:0})),
  reconcileMarketing:vi.fn(async()=>({recorded:0})),
}))

vi.mock('@workspace/db', () => {
  const db = {
    // The stand-in is also handed out as the transaction handle.
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
    execute: async () => undefined,
    insert: () => ({
      values: (row: Row) => {
        const plain = { returning: async () => { rows.push({ ...row }); return [{ ...row }] } }
        return {
          ...plain,
          onConflictDoUpdate: ({ set }: { set: Record<string, unknown> }) => ({
            returning: async () => {
              const existing = rows.find((r) => r.job === row.job && r.dueKey === row.dueKey)
              if (!existing) { rows.push({ ...row }); return [{ ...row }] }
              const stale = existing.status === 'running' && existing.startedAt.getTime() < Date.now() - 30 * 60_000
              if (!stale && existing.status !== 'partial') return []
              Object.assign(existing, set)
              return [{ ...existing }]
            },
          }),
        }
      },
    }),
    update: () => ({
      set: (patch: Record<string, unknown>) => ({
        where: () => {
          // Finishing a run or checkpointing patches the most recent running
          // row; a manual take-over (status back to running) patches the
          // latest partial row.
          const apply = () => {
            const target = patch.status === 'running'
              ? [...rows].reverse().find((r) => r.status === 'partial')
              : [...rows].reverse().find((r) => r.status === 'running')
            if (target) Object.assign(target, patch)
            return target ? [{ ...target }] : []
          }
          return {
            returning: async () => apply(),
            then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(apply()).then(resolve, reject),
          }
        },
      }),
    }),
    // Stand-in for the three selects in jobs.ts: runForSlot (limit directly
    // after where), runInProgress (orderBy → limit) and the status list.
    // Filters are approximated: slot lookups match the requested dueKey via
    // pendingSlot, in-progress lookups return the newest running row.
    select: () => ({
      from: () => ({
        where: (cond: unknown) => {
          const text = JSON.stringify(cond)
          const running = () => [...rows].reverse().find((r) => r.status === 'running' && r.startedAt.getTime() >= Date.now() - 30 * 60_000)
          return {
            limit: async () => {
              const m = /\d{4}-\d{2}-\d{2}/.exec(text)
              const key = m?.[0]
              const hit = key ? rows.find((r) => r.dueKey === key) : running()
              return hit ? [{ ...hit }] : []
            },
            orderBy: () => ({
              limit: async (n: number) => {
                if (n !== 1) return [...rows].reverse()
                // runInProgress filters on status "running"; latestRun does not.
                if (text.includes('"running"')) return running() ? [{ ...running() }] : []
                const latest = [...rows].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())[0]
                return latest ? [{ ...latest }] : []
              },
            }),
          }
        },
      }),
    }),
  }
  return { cronRunsTable: { id: 'id', job: 'job', dueKey: 'dueKey', status: 'status', startedAt: 'startedAt' }, db }
})

const retry = vi.fn(async (..._args: unknown[]) => ({ customers: 1, invoices: 2, paid: 1, failed: 1, details: [], attempted: ['c1'] }))
vi.mock('@/lib/billing/dunning', () => ({ retryPastDueInvoices: retry }))
const retryNotifications = vi.fn(async (_opts?: { deadline?: number }) => ({ retried: 0, sent: 0, failed: 0 }))
vi.mock('@/lib/billing/notifications', () => ({ retryFailedNotifications: retryNotifications }))
const salesWorker = vi.fn(async (_opts?: { deadline?: number }) => {})
vi.mock('@/lib/sales-leads/worker', () => ({ runSalesWorker: salesWorker }))
const leadEmails = vi.fn(async (_owner?: string, _opts?: { deadline?: number }) => {})
vi.mock('@/lib/lead-followup/notifications', () => ({ deliverLeadEmails: leadEmails }))
const enrollments = vi.fn(async (_opts?: { deadline?: number }) => ({ examined: 0, completed: 0 }))
vi.mock('@/actions/enrollment', () => ({ reconcilePendingEnrollments: enrollments }))
const seed = vi.fn(async (_opts?: { force?: boolean; deadline?: number }) => ({
  chiro: { status: 'seeded', summary: { patients: 12 } },
  aesthetics: { status: 'seeded', summary: { patients: 12 } },
}))
vi.mock('@/lib/demo/seed', () => ({ ensureAllDemosSeeded: seed }))
const sendEmail = vi.fn(async (..._args: unknown[]) => ({ ok: true, logId: 'log' }))
vi.mock('@/lib/mail', () => ({ sendEmail }))
const cleanup = vi.fn(async (..._args: unknown[]) => ({ challengesDeleted: 2, rateLimitsDeleted: 1, idleSessionsDeleted: 3 }))
vi.mock('@/lib/auth/retention', () => ({ cleanupAuthRecords: cleanup }))
vi.mock('@/lib/affiliates/retention', () => ({ cleanupAffiliateTelemetry: vi.fn(async () => ({ ipStripped: 0, telemetryDeleted: 0, sessionsDeleted: 0, challengesDeleted: 0 })) }))
const affiliates = vi.fn(async (_opts?: { deadline?: number }) => ({ processed: 0 }))
vi.mock('@/lib/affiliates/ledger', () => ({ retryAffiliateHistory: affiliates }))
vi.mock('@/lib/agreements/enrollment-invitation', () => ({ retryPendingEnrollmentInvitations: vi.fn(async () => {}) }))
vi.mock('@/lib/affiliates/onboarding-invitations', () => ({ retryOnboardingInvitations: vi.fn(async () => ({ examined: 0, accepted: 0 })) }))

const { tick, schedulerEnabled } = await import('@/lib/cron/scheduler')
const { runScheduledTick } = await import('@/lib/cron/tick')
const { dueKeyFor, hoursSinceSlot } = await import('@/lib/cron/slots')
const { runCronJob, getCronJobStatuses, CRON_MAX_CONTINUATIONS } = await import('@/lib/cron/jobs')
const { RunBudget } = await import('@/lib/cron/budget')

describe('dueKeyFor', () => {
  it('is today (ET) once the slot hour has passed', () => {
    // 11:30 UTC = 07:30 EDT on Sep 22, 2026
    expect(dueKeyFor(6, new Date('2026-09-22T11:30:00Z'))).toBe('2026-09-22')
  })
  it('is yesterday (ET) before the slot hour', () => {
    // 09:00 UTC = 05:00 EDT — the 06:00 slot has not started yet
    expect(dueKeyFor(6, new Date('2026-09-22T09:00:00Z'))).toBe('2026-09-21')
  })
  it('uses the ET calendar day, not UTC', () => {
    // 03:00 UTC Sep 22 = 23:00 EDT Sep 21 → the 03:00 ET slot of Sep 21 is the latest one
    expect(dueKeyFor(3, new Date('2026-09-22T03:00:00Z'))).toBe('2026-09-21')
    // Crossing a month boundary
    expect(dueKeyFor(6, new Date('2026-10-01T05:00:00Z'))).toBe('2026-09-30')
  })
})

describe('hoursSinceSlot', () => {
  it('measures from the ET slot start, across DST', () => {
    // 06:00 EDT on Sep 22 = 10:00 UTC
    expect(hoursSinceSlot('2026-09-22', 6, new Date('2026-09-22T12:00:00Z'))).toBeCloseTo(2)
    // 06:00 EST on Jan 15 = 11:00 UTC
    expect(hoursSinceSlot('2026-01-15', 6, new Date('2026-01-15T11:30:00Z'))).toBeCloseTo(0.5)
  })
})

describe('runCronJob / tick', () => {
  beforeEach(() => {
    rows.length = 0
    retry.mockClear()
    retryNotifications.mockClear()
    seed.mockClear()
    cleanup.mockClear()
    sendEmail.mockClear()
    salesWorker.mockClear()
    leadEmails.mockClear()
    vi.unstubAllEnvs()
    process.env.SUPER_ADMIN_EMAIL = 'owner@example.com'
  })

  it('runs each job once per due slot even across repeated ticks', async () => {
    const now = new Date('2026-09-22T12:00:00Z')
    await tick(now)
    await tick(now)
    await tick(now)
    expect(retry).toHaveBeenCalledTimes(1)
    expect(seed).toHaveBeenCalledTimes(1)
    expect(cleanup).toHaveBeenCalledTimes(1)
    expect(rows.find((r) => r.job === 'auth-cleanup')).toMatchObject({ dueKey: '2026-09-22', status: 'ok', trigger: 'scheduler' })
    expect(rows.filter((r) => r.job === 'billing-retry')).toHaveLength(1)
    expect(rows.find((r) => r.job === 'billing-retry')).toMatchObject({ dueKey: '2026-09-22', status: 'ok', trigger: 'scheduler' })
  })

  it('runs again when the next day’s slot arrives', async () => {
    await tick(new Date('2026-09-22T12:00:00Z'))
    await tick(new Date('2026-09-23T12:00:00Z'))
    expect(retry).toHaveBeenCalledTimes(2)
    expect(rows.filter((r) => r.job === 'billing-retry').map((r) => r.dueKey)).toEqual(['2026-09-22', '2026-09-23'])
  })

  it('re-claims a run left "running" by a crashed instance', async () => {
    rows.push({ id: 'dead', job: 'billing-retry', dueKey: '2026-09-22', trigger: 'scheduler', status: 'running', startedAt: new Date(Date.now() - 60 * 60_000) })
    const outcome = await runCronJob('billing-retry', { trigger: 'scheduler', dueKey: '2026-09-22' })
    expect(outcome).toMatchObject({ ok: true })
    expect(outcome).not.toHaveProperty('skipped')
    expect(retry).toHaveBeenCalledTimes(1)
    expect(rows.find((r) => r.job === 'billing-retry')).toMatchObject({ status: 'ok' })
  })

  it('does not double-run a slot that is genuinely in progress', async () => {
    rows.push({ id: 'live', job: 'billing-retry', dueKey: '2026-09-22', trigger: 'scheduler', status: 'running', startedAt: new Date() })
    const outcome = await runCronJob('billing-retry', { trigger: 'scheduler', dueKey: '2026-09-22' })
    expect(outcome).toMatchObject({ ok: true, skipped: true, reason: 'a run is already in progress' })
    expect(retry).not.toHaveBeenCalled()
  })

  it('an external trigger for a slot the scheduler already ran is a no-op', async () => {
    await tick(new Date('2026-09-22T12:00:00Z'))
    const outcome = await runCronJob('billing-retry', { trigger: 'http', dueKey: '2026-09-22' })
    expect(outcome).toMatchObject({ ok: true, skipped: true, reason: 'already ran for 2026-09-22' })
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('manual runs are recorded outside the day slot but refused while a run is in progress', async () => {
    await tick(new Date('2026-09-22T12:00:00Z'))
    const outcome = await runCronJob('billing-retry', { trigger: 'admin', actor: 'Dr. S' })
    expect(outcome).toMatchObject({ ok: true })
    expect(outcome).not.toHaveProperty('skipped')
    expect(retry).toHaveBeenCalledTimes(2)
    expect(rows.filter((r) => r.job === 'billing-retry')).toHaveLength(2)

    rows.push({ id: 'live', job: 'billing-retry', dueKey: null, trigger: 'admin', status: 'running', startedAt: new Date() })
    const blocked = await runCronJob('billing-retry', { trigger: 'admin', actor: 'Dr. S' })
    expect(blocked).toMatchObject({ ok: true, skipped: true, reason: 'a run is already in progress' })
    expect(retry).toHaveBeenCalledTimes(2)
  })

  it('records a thrown job as failed and emails the super admin', async () => {
    retry.mockRejectedValueOnce(new Error('Stripe is down'))
    const outcome = await runCronJob('billing-retry', { trigger: 'admin', actor: 'Dr. S' })
    expect(outcome).toMatchObject({ ok: false, error: 'Stripe is down' })
    expect(rows[0]).toMatchObject({ status: 'failed', error: 'Stripe is down' })
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(sendEmail.mock.calls[0]?.[0]).toBe('cron_failed')
    expect(sendEmail.mock.calls[0]?.[1]).toBe('owner@example.com')
    const statuses = await getCronJobStatuses()
    expect(statuses.find((s) => s.name === 'billing-retry')?.lastRun?.status).toBe('failed')
    // A slot with no run well past its hour is flagged so the gap is visible.
    const billing = statuses.find((s) => s.name === 'billing-retry')!
    expect(billing.overdue).toBe(hoursSinceSlot(billing.expectedDueKey, 6) > 2)
  })

  it('a demo reset error result is a failure, not a success with an error inside', async () => {
    // One practice failing fails the run, even though the other rebuilt fine.
    seed.mockResolvedValueOnce({
      chiro: { status: 'seeded', summary: { patients: 12 } },
      aesthetics: { status: 'error', message: 'lock held' },
    } as never)
    const outcome = await runCronJob('demo-reset', { trigger: 'http' })
    expect(outcome).toMatchObject({ ok: false, error: 'aesthetics: lock held' })
  })

  it('the daily billing run also retries failed billing emails, whatever triggered it', async () => {
    await tick(new Date('2026-09-22T12:00:00Z'))
    expect(retryNotifications).toHaveBeenCalledTimes(1)
    expect(rows.find((r) => r.job === 'billing-retry')?.summary).toMatchObject({ notifications: { retried: 0 } })
  })
})

/**
 * Vercel Cron: no process outlives a request, no retries of a failed call,
 * UTC schedules, and a hard function time limit. The same slot claim and the
 * run budget cover all of it.
 */
describe('Vercel Cron', () => {
  beforeEach(() => {
    rows.length = 0
    retry.mockClear()
    seed.mockClear()
    cleanup.mockClear()
    sendEmail.mockClear()
    salesWorker.mockClear()
    vi.unstubAllEnvs()
    process.env.SUPER_ADMIN_EMAIL = 'owner@example.com'
  })

  it('both scheduled UTC hours of a daily job run it once, in summer and in winter (DST)', async () => {
    // billing-retry is 06:00 ET; vercel.json schedules 10:00 and 11:00 UTC.
    // EDT (Sep): 10:00 UTC is 06:00 ET → runs; 11:00 UTC is the same slot → no-op.
    const summer = ['2026-09-22T10:00:00Z', '2026-09-22T11:00:00Z'].map((t) => dueKeyFor(6, new Date(t)))
    expect(summer).toEqual(['2026-09-22', '2026-09-22'])
    // EST (Jan): 10:00 UTC is 05:00 ET → still yesterday's slot; 11:00 UTC is 06:00 ET → today's.
    const winter = ['2026-01-15T10:00:00Z', '2026-01-15T11:00:00Z'].map((t) => dueKeyFor(6, new Date(t)))
    expect(winter).toEqual(['2026-01-14', '2026-01-15'])
    // Transition day itself (DST ends 2026-11-01 06:00 UTC): both calls still land on one slot each.
    expect(dueKeyFor(6, new Date('2026-11-01T10:00:00Z'))).toBe('2026-10-31')
    expect(dueKeyFor(6, new Date('2026-11-01T11:00:00Z'))).toBe('2026-11-01')

    for (const t of ['2026-01-14T11:00:00Z', '2026-01-15T10:00:00Z', '2026-01-15T11:00:00Z']) {
      await runCronJob('billing-retry', { trigger: 'vercel-cron', dueKey: dueKeyFor(6, new Date(t)) })
    }
    expect(retry).toHaveBeenCalledTimes(2)
    expect(rows.filter((r) => r.job === 'billing-retry').map((r) => [r.dueKey, r.trigger, r.status])).toEqual([
      ['2026-01-14', 'vercel-cron', 'ok'],
      ['2026-01-15', 'vercel-cron', 'ok'],
    ])
  })

  it('duplicate and overlapping cron calls for one slot run the job once', async () => {
    const dueKey = '2026-09-22'
    const first = await runCronJob('billing-retry', { trigger: 'vercel-cron', dueKey })
    const second = await runCronJob('billing-retry', { trigger: 'vercel-cron', dueKey })
    expect(first).toMatchObject({ ok: true })
    expect(second).toMatchObject({ ok: true, skipped: true, reason: 'already ran for 2026-09-22' })
    // Overlap: a call that lands while the slot's run is still in flight is refused, not queued.
    rows.push({ id: 'live', job: 'demo-reset', dueKey, trigger: 'vercel-cron', status: 'running', startedAt: new Date() })
    expect(await runCronJob('demo-reset', { trigger: 'vercel-cron', dueKey })).toMatchObject({ ok: true, skipped: true, reason: 'a run is already in progress' })
    expect(retry).toHaveBeenCalledTimes(1)
    expect(seed).not.toHaveBeenCalled()
  })

  it('a missed day (failed or absent cron call) is caught up by the next five-minute pass, not lost', async () => {
    // Nothing ran on the 22nd (Vercel does not retry). The first workers pass
    // on the 23rd before 06:00 ET claims the 22nd's slot; the 23rd's slot runs
    // when its hour arrives.
    await runScheduledTick({ trigger: 'vercel-cron', now: new Date('2026-09-23T09:30:00Z') })
    expect(rows.find((r) => r.job === 'billing-retry')).toMatchObject({ dueKey: '2026-09-22', trigger: 'vercel-cron', status: 'ok' })
    await runScheduledTick({ trigger: 'vercel-cron', now: new Date('2026-09-23T10:01:00Z') })
    expect(rows.filter((r) => r.job === 'billing-retry').map((r) => r.dueKey)).toEqual(['2026-09-22', '2026-09-23'])
    expect(retry).toHaveBeenCalledTimes(2)
    expect(salesWorker).toHaveBeenCalledTimes(2)
  })

  it('a job that stops at its time budget is stored as partial and continued by the next call with its summary', async () => {
    retry.mockResolvedValueOnce({ customers: 2, invoices: 3, paid: 1, failed: 2, details: [], attempted: ['a', 'b'], incomplete: true, remainingCustomers: 5 } as never)
    const dueKey = '2026-09-22'
    const first = await runCronJob('billing-retry', { trigger: 'vercel-cron', dueKey, budget: RunBudget.of(60_000) })
    expect(first).toMatchObject({ ok: true, incomplete: true })
    expect(rows[0]).toMatchObject({ status: 'partial', summary: { customers: 2, incomplete: true } })
    // Later steps did not run: no budget was left after the card retries.
    expect(retryNotifications).not.toHaveBeenCalled()

    const second = await runCronJob('billing-retry', { trigger: 'vercel-cron', dueKey })
    expect(second).toMatchObject({ ok: true, incomplete: false })
    expect(retry).toHaveBeenCalledTimes(2)
    expect(retryNotifications).toHaveBeenCalledTimes(1)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ status: 'ok', trigger: 'vercel-cron', summary: { customers: 3, invoices: 5, paid: 2, failed: 3, continuations: 1 } })
    expect(rows[0]!.summary).not.toHaveProperty('incomplete')
    // Done: a further call for the slot is a no-op.
    expect(await runCronJob('billing-retry', { trigger: 'vercel-cron', dueKey })).toMatchObject({ skipped: true })
  })

  it('a continuation skips the daily steps an earlier pass already finished', async () => {
    const dueKey = '2026-09-22'
    // First pass: cards done, then the budget ran out before the later steps.
    const first = await runCronJob('billing-retry', { trigger: 'vercel-cron', dueKey, budget: new RunBudget(Date.now() + 1) })
    expect(first).toMatchObject({ ok: true, incomplete: true, summary: { billingDone: true } })
    expect(retryNotifications).not.toHaveBeenCalled()
    const second = await runCronJob('billing-retry', { trigger: 'vercel-cron', dueKey })
    expect(second).toMatchObject({ ok: true, incomplete: false })
    expect(retry).toHaveBeenCalledTimes(1)
    expect(retryNotifications).toHaveBeenCalledTimes(1)
  })

  it('a demo reset that cannot fit the second practice defers it and the continuation rebuilds only that one', async () => {
    seed.mockResolvedValueOnce({ chiro: { status: 'seeded', summary: { patients: 12 } }, aesthetics: { status: 'deferred' } } as never)
    seed.mockResolvedValueOnce({ chiro: { status: 'fresh' }, aesthetics: { status: 'seeded', summary: { patients: 9 } } } as never)
    const dueKey = '2026-09-22'
    const first = await runCronJob('demo-reset', { trigger: 'vercel-cron', dueKey })
    expect(first).toMatchObject({ ok: true, incomplete: true, summary: { chiro: { status: 'seeded', patients: 12 }, aesthetics: { status: 'deferred' } } })
    expect(seed.mock.calls[0]?.[0]).toMatchObject({ force: true })
    const second = await runCronJob('demo-reset', { trigger: 'vercel-cron', dueKey })
    expect(seed.mock.calls[1]?.[0]).toMatchObject({ force: false })
    expect(second).toMatchObject({ ok: true, incomplete: false, summary: { chiro: { status: 'seeded', patients: 12 }, aesthetics: { status: 'seeded', patients: 9 }, continuations: 1 } })
  })

  it('a continued billing pass skips the customers already attempted for the slot, so declined cards are not retried while the tail waits', async () => {
    retry.mockResolvedValueOnce({ customers: 2, invoices: 2, paid: 0, failed: 2, details: [], attempted: ['c1', 'c2'], incomplete: true, remainingCustomers: 1 } as never)
    retry.mockResolvedValueOnce({ customers: 1, invoices: 1, paid: 1, failed: 0, details: [], attempted: ['c3'] } as never)
    const dueKey = '2026-09-22'
    await runCronJob('billing-retry', { trigger: 'vercel-cron', dueKey })
    expect(rows[0]).toMatchObject({ status: 'partial', summary: { attempted: ['c1', 'c2'], remainingCustomers: 1 } })
    const second = await runCronJob('billing-retry', { trigger: 'vercel-cron', dueKey })
    // c1 and c2 declined in the first pass and are still past due; the continuation leaves them alone.
    expect(retry.mock.calls[1]?.[2]).toMatchObject({ skipCustomerIds: ['c1', 'c2'] })
    expect(second).toMatchObject({ ok: true, incomplete: false, summary: { customers: 3, paid: 1, failed: 2, attempted: ['c1', 'c2', 'c3'] } })
    expect(rows[0]!.summary).not.toHaveProperty('remainingCustomers')
  })

  it('a later step that stops at the deadline keeps the slot partial and is re-run by the continuation', async () => {
    retryNotifications.mockResolvedValueOnce({ retried: 3, sent: 3, failed: 0, incomplete: true } as never)
    const dueKey = '2026-09-22'
    const first = await runCronJob('billing-retry', { trigger: 'vercel-cron', dueKey })
    expect(first).toMatchObject({ ok: true, incomplete: true, summary: { billingDone: true, notifications: { incomplete: true } } })
    expect(rows[0]).toMatchObject({ status: 'partial' })
    const second = await runCronJob('billing-retry', { trigger: 'vercel-cron', dueKey })
    expect(second).toMatchObject({ ok: true, incomplete: false, summary: { notifications: { retried: 0 } } })
    expect(retryNotifications).toHaveBeenCalledTimes(2)
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('an admin "Run now" after a partial run continues it instead of starting the job over', async () => {
    seed.mockResolvedValueOnce({ chiro: { status: 'seeded', summary: { patients: 12 } }, aesthetics: { status: 'deferred' } } as never)
    seed.mockResolvedValueOnce({ chiro: { status: 'fresh' }, aesthetics: { status: 'seeded', summary: { patients: 9 } } } as never)
    await runCronJob('demo-reset', { trigger: 'vercel-cron', dueKey: '2026-09-22' })
    expect(rows[0]).toMatchObject({ status: 'partial' })
    const manual = await runCronJob('demo-reset', { trigger: 'admin', actor: 'owner@example.com' })
    // Not forced: the practice already rebuilt is left alone, only the deferred one runs.
    expect(seed.mock.calls[1]?.[0]).toMatchObject({ force: false })
    expect(manual).toMatchObject({ ok: true, incomplete: false, summary: { chiro: { status: 'seeded', patients: 12 }, aesthetics: { status: 'seeded', patients: 9 }, continuations: 1 } })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ status: 'ok', trigger: 'admin', actor: 'owner@example.com', dueKey: '2026-09-22' })
    // With nothing partial left, Run now is a fresh forced run again.
    await runCronJob('demo-reset', { trigger: 'admin' })
    expect(seed.mock.calls[2]?.[0]).toMatchObject({ force: true })
    expect(rows).toHaveLength(2)
  })

  it('the cleanup job stops between its steps and finishes the rest next time', async () => {
    cleanup.mockResolvedValueOnce({ challengesDeleted: 5000, rateLimitsDeleted: 0, idleSessionsDeleted: 0, incomplete: true } as never)
    const dueKey = '2026-09-22'
    const first = await runCronJob('auth-cleanup', { trigger: 'vercel-cron', dueKey })
    expect(first).toMatchObject({ ok: true, incomplete: true, summary: { auth: { incomplete: true } } })
    const second = await runCronJob('auth-cleanup', { trigger: 'vercel-cron', dueKey })
    expect(second).toMatchObject({ ok: true, incomplete: false, summary: { auth: { challengesDeleted: 2 }, affiliates: {}, marketing: { aggregateGroups: 0 } } })
    expect(cleanup).toHaveBeenCalledTimes(2)
    expect(cleanup.mock.calls[1]?.[1]).toMatchObject({ deadline: expect.any(Number) })
  })

  it('a run killed mid-way (function cut off) is continued from its last checkpoint after the stale take-over, not restarted', async () => {
    // The card pass checkpoints after every customer while the row is still "running".
    retry.mockImplementationOnce(async (...args: unknown[]) => {
      const opts = args[2] as { onCustomerDone: (s: unknown) => Promise<void> }
      await opts.onCustomerDone({ customers: 1, invoices: 1, paid: 0, failed: 1, details: [], attempted: ['c1'] })
      expect(rows[0]).toMatchObject({ status: 'running', summary: { attempted: ['c1'], failed: 1 } })
      await opts.onCustomerDone({ customers: 2, invoices: 2, paid: 0, failed: 2, details: [], attempted: ['c1', 'c2'] })
      // ...and here Vercel kills the function: the promise never settles.
      return new Promise(() => {})
    })
    const dueKey = '2026-09-22'
    void runCronJob('billing-retry', { trigger: 'vercel-cron', dueKey })
    await vi.waitFor(() => expect(rows[0]).toMatchObject({ status: 'running', summary: { attempted: ['c1', 'c2'] } }))
    expect(rows[0]!.summary).not.toHaveProperty('billingDone')

    // 31 minutes later the slot is stale; the next cron call takes it over.
    rows[0]!.startedAt = new Date(Date.now() - 31 * 60_000)
    const recovered = await runCronJob('billing-retry', { trigger: 'vercel-cron', dueKey })
    expect(retry).toHaveBeenCalledTimes(2)
    // c1 and c2 already declined in the killed run: not charged again.
    expect(retry.mock.calls[1]?.[2]).toMatchObject({ skipCustomerIds: ['c1', 'c2'] })
    expect(recovered).toMatchObject({ ok: true, incomplete: false, summary: { customers: 3, failed: 3, attempted: ['c1', 'c2', 'c1'], continuations: 1 } })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ status: 'ok' })
    expect(retryNotifications).toHaveBeenCalledTimes(1)
  })

  it('every later step of the billing day is bounded and checkpointed as it lands', async () => {
    const dueKey = '2026-09-22'
    const budget = RunBudget.of(60_000)
    await runCronJob('billing-retry', { trigger: 'vercel-cron', dueKey, budget })
    for (const call of [enrollments.mock.calls[0], affiliates.mock.calls[0]]) {
      expect(call?.[0]).toMatchObject({ deadline: budget.deadline })
    }
    expect(rows[0]).toMatchObject({ status: 'ok', summary: { billingDone: true, enrollments: { examined: 0 }, affiliates: { processed: 0 }, notifications: { retried: 0 } } })
  })

  it('a slot still partial after too many continuations fails loudly instead of looping forever', async () => {
    rows.push({ id: 'stuck', job: 'billing-retry', dueKey: '2026-09-22', trigger: 'vercel-cron', status: 'partial', startedAt: new Date(), summary: { continuations: CRON_MAX_CONTINUATIONS, incomplete: true } })
    const outcome = await runCronJob('billing-retry', { trigger: 'vercel-cron', dueKey: '2026-09-22' })
    expect(outcome).toMatchObject({ ok: false })
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(retry).not.toHaveBeenCalled()
  })

  it('the five-minute pass leaves the daily jobs for later when its budget is nearly gone', async () => {
    const report = await runScheduledTick({ trigger: 'vercel-cron', now: new Date('2026-09-22T12:00:00Z'), budget: RunBudget.of(30_000) })
    expect(report.daily).toEqual({ 'auth-cleanup': 'deferred', 'billing-retry': 'deferred', 'demo-reset': 'deferred' })
    expect(retry).not.toHaveBeenCalled()
    // Workers still ran, each handed a deadline inside the budget.
    expect(salesWorker).toHaveBeenCalledTimes(1)
    const deadline = salesWorker.mock.calls[0]?.[0]?.deadline
    expect(deadline).toBeLessThanOrEqual(Date.now() + 30_000)
  })

  it('refuses to run anything on a Vercel Preview deployment', async () => {
    vi.stubEnv('VERCEL', '1')
    vi.stubEnv('VERCEL_ENV', 'preview')
    await expect(runCronJob('billing-retry', { trigger: 'vercel-cron', dueKey: '2026-09-22' })).rejects.toThrow(/preview/i)
    expect(rows).toHaveLength(0)
    expect(retry).not.toHaveBeenCalled()
    expect(schedulerEnabled()).toBe(false)
  })

  it('never starts the in-process scheduler on Vercel, but still does on Replit production', () => {
    expect(schedulerEnabled({ NODE_ENV: 'production' })).toBe(true)
    expect(schedulerEnabled({ NODE_ENV: 'production', VERCEL: '1', VERCEL_ENV: 'production' })).toBe(false)
    expect(schedulerEnabled({ NODE_ENV: 'production', VERCEL: '1', VERCEL_ENV: 'production', CRON_SCHEDULER: 'on' })).toBe(false)
  })
})
