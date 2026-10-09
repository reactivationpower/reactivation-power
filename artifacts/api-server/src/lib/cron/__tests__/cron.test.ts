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
              if (!stale) return []
              Object.assign(existing, set)
              return [{ ...existing }]
            },
          }),
        }
      },
    }),
    update: () => ({
      set: (patch: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            // eq(cronRunsTable.id, run.id) — our stand-in patches the most recent running row.
            const target = [...rows].reverse().find((r) => r.status === 'running')
            if (target) Object.assign(target, patch)
            return target ? [{ ...target }] : []
          },
        }),
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
              limit: async (n: number) => (n === 1 ? (running() ? [{ ...running() }] : []) : [...rows].reverse()),
            }),
          }
        },
      }),
    }),
  }
  return { cronRunsTable: { id: 'id', job: 'job', dueKey: 'dueKey', status: 'status', startedAt: 'startedAt' }, db }
})

const retry = vi.fn(async () => ({ customers: 1, invoices: 2, paid: 1, failed: 1, details: [] }))
vi.mock('@/lib/billing/dunning', () => ({ retryPastDueInvoices: retry }))
vi.mock('@/actions/enrollment', () => ({ reconcilePendingEnrollments: vi.fn(async () => ({ examined: 0, completed: 0 })) }))
const seed = vi.fn(async () => ({
  chiro: { status: 'seeded', summary: { patients: 12 } },
  aesthetics: { status: 'seeded', summary: { patients: 12 } },
}))
vi.mock('@/lib/demo/seed', () => ({ ensureAllDemosSeeded: seed }))
const sendEmail = vi.fn(async (..._args: unknown[]) => ({ ok: true, logId: 'log' }))
vi.mock('@/lib/mail', () => ({ sendEmail }))
const cleanup = vi.fn(async () => ({ challengesDeleted: 2, rateLimitsDeleted: 1, idleSessionsDeleted: 3 }))
vi.mock('@/lib/auth/retention', () => ({ cleanupAuthRecords: cleanup }))
vi.mock('@/lib/affiliates/retention', () => ({ cleanupAffiliateTelemetry: vi.fn(async () => ({ ipStripped: 0, telemetryDeleted: 0, sessionsDeleted: 0, challengesDeleted: 0 })) }))
vi.mock('@/lib/affiliates/ledger', () => ({ retryAffiliateHistory: vi.fn(async () => ({ examined: 0, completed: 0 })) }))
vi.mock('@/lib/agreements/enrollment-invitation', () => ({ retryPendingEnrollmentInvitations: vi.fn(async () => {}) }))
vi.mock('@/lib/affiliates/onboarding-invitations', () => ({ retryOnboardingInvitations: vi.fn(async () => ({ examined: 0, accepted: 0 })) }))

const { tick } = await import('@/lib/cron/scheduler')
const { dueKeyFor, hoursSinceSlot } = await import('@/lib/cron/slots')
const { runCronJob, getCronJobStatuses } = await import('@/lib/cron/jobs')

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
    seed.mockClear()
    cleanup.mockClear()
    sendEmail.mockClear()
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
})
