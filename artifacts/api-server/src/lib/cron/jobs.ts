import { randomUUID } from 'node:crypto'
import { assertRealEffectsAllowed } from '@/lib/deployment-safety'
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm'
import { cronRunsTable, db, type CronRun } from '@workspace/db'

import { retryPastDueInvoices, type RetrySummary } from '@/lib/billing/dunning'
import { retryFailedNotifications } from '@/lib/billing/notifications'
import { ensureAllDemosSeeded } from '@/lib/demo/seed'
import { appOrigin } from '@/lib/app-origin'
import { logger } from '@/lib/logger'
import { sendEmail } from '@/lib/mail'
import { dueKeyFor, hoursSinceSlot } from './slots'
import { RunBudget, cronRunBudgetMs } from './budget'
import { cleanupAuthRecords } from '@/lib/auth/retention'
import { cleanupAffiliateTelemetry } from '@/lib/affiliates/retention'
import { retryAffiliateHistory } from '@/lib/affiliates/ledger'
import { reconcilePendingEnrollments } from '@/actions/enrollment'
import { cleanupMarketing, reconcileMarketing } from '@/lib/marketing/reconcile'

/**
 * The scheduled jobs and the single entry point that runs one of them.
 *
 * Every run — whether the in-process scheduler, Vercel Cron, the
 * Bearer-protected HTTP route or an admin's "Run now" started it — goes
 * through runCronJob so it lands in cron_runs (what the admin dashboard
 * shows) and a thrown error emails the super admin. A job that completes
 * with declines in its summary is still a successful *run*; only the job
 * itself breaking is a failure.
 *
 * Every run has a time budget (lib/cron/budget.ts). A job that stops before
 * its budget runs out returns `incomplete: true`; the run is stored as
 * `partial` and the *same* daily slot can be claimed again by the next
 * trigger (the second UTC hour of the daily cron, the five-minute tick, or
 * the in-process scheduler), which continues from the progress already in
 * the database and receives the previous summary as `prior`.
 */

export type CronJobName = 'billing-retry' | 'demo-reset' | 'auth-cleanup'
export type CronTrigger = 'scheduler' | 'http' | 'admin' | 'vercel-cron'
export type CronRunStatus = 'running' | 'ok' | 'partial' | 'failed'

export interface CronJobContext {
  budget: RunBudget
  /** Summary of the partial run this one continues, if any. */
  prior: Record<string, unknown> | null
  /**
   * Store progress mid-run (the row stays `running`). If the function is
   * killed before the run finishes, the stale take-over 30 minutes later
   * continues from this summary instead of starting the slot over.
   */
  checkpoint: (summary: Record<string, unknown>) => Promise<void>
}

export interface CronJobDefinition {
  name: CronJobName
  label: string
  description: string
  /** Hour (0-23) in America/New_York at which the daily run becomes due. */
  hourEt: number
  run: (ctx: CronJobContext) => Promise<Record<string, unknown>>
}

/** A continuing job needs at least this much budget before starting another step. */
const STEP_RESERVE_MS = 15_000

/** A slot that is still partial after this many continuations is reported as failed. */
export const CRON_MAX_CONTINUATIONS = 24

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/** Add a continued billing pass to what the earlier partial passes already did. */
function mergeRetrySummary(prior: Record<string, unknown> | null, next: RetrySummary): Record<string, unknown> {
  const details = [...((prior?.details as unknown[] | undefined) ?? []), ...next.details].slice(0, 50)
  const { incomplete: _incomplete, remainingCustomers: _remaining, ...rest } = prior ?? {}
  return {
    ...rest,
    customers: num(prior?.customers) + next.customers,
    invoices: num(prior?.invoices) + next.invoices,
    paid: num(prior?.paid) + next.paid,
    failed: num(prior?.failed) + next.failed,
    details,
    // Per-slot progress: the next continuation skips these customers.
    attempted: [...attemptedCustomers(prior), ...(next.attempted ?? [])],
    ...(next.incomplete ? { remainingCustomers: next.remainingCustomers } : {}),
  }
}

function attemptedCustomers(prior: Record<string, unknown> | null): string[] {
  const list = prior?.attempted
  return Array.isArray(list) ? list.filter((v): v is string => typeof v === 'string') : []
}

const stepIncomplete = (v: unknown) => typeof v === 'object' && v !== null && (v as { incomplete?: unknown }).incomplete === true

/**
 * Run named steps in order, each bounded by the run's deadline. Every step's
 * result is checkpointed as soon as it lands; a continuation skips the steps
 * already recorded as complete and re-runs one that stopped at the deadline
 * (`incomplete: true`). Stops before a step when too little budget is left.
 */
async function runSteps(ctx: CronJobContext, steps: Array<[string, () => Promise<unknown>]>): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = ctx.prior ? { ...ctx.prior } : {}
  delete out.incomplete
  for (const [key, step] of steps) {
    if (out[key] !== undefined && !stepIncomplete(out[key])) continue
    if (ctx.budget.exhausted(STEP_RESERVE_MS)) return { ...out, incomplete: true }
    out[key] = await step()
    await ctx.checkpoint(out)
    if (stepIncomplete(out[key])) return { ...out, incomplete: true }
  }
  return out
}

export const CRON_JOBS: Record<CronJobName, CronJobDefinition> = {
  'auth-cleanup': {
    name: 'auth-cleanup',
    label: 'Authentication record cleanup',
    description: 'Removes retired sign-in codes, obsolete rate-limit counters, and inactive security sessions after one day; preserves analytics history.',
    hourEt: 4,
    run: async (ctx) => {
      // Each cleanup deletes in batches and stops at the deadline; a step
      // that stopped early is recorded as incomplete and re-run next time
      // (deletes are idempotent), the finished ones are skipped.
      const { budget } = ctx
      return runSteps(ctx, [
        ['auth', () => cleanupAuthRecords(undefined, { deadline: budget.deadline })],
        ['affiliates', () => cleanupAffiliateTelemetry(undefined, { deadline: budget.deadline })],
        ['marketing', () => cleanupMarketing({ deadline: budget.deadline })],
      ])
    },
  },
  'billing-retry': {
    name: 'billing-retry',
    label: 'Daily billing retry',
    description: 'Re-attempts every open invoice of every past-due customer on the primary card, then the secondary; then reconciles enrollments, affiliate history and marketing, and retries failed billing emails.',
    hourEt: 6,
    run: async (ctx) => {
      const { budget, prior } = ctx
      // Step 1: the card retries. Progress is the ledger plus the list of
      // customers already attempted for this slot (checkpointed after every
      // customer), so neither a budget stop nor a killed function makes a
      // continuation retry a card that already declined today.
      let out: Record<string, unknown> = prior ? { ...prior } : {}
      delete out.incomplete
      if (!out.billingDone) {
        const pass = await retryPastDueInvoices('cron', undefined, {
          deadline: budget.deadline,
          skipCustomerIds: attemptedCustomers(prior),
          onCustomerDone: (soFar) => ctx.checkpoint(mergeRetrySummary(prior, soFar)),
        })
        out = mergeRetrySummary(prior, pass)
        if (pass.incomplete) return { ...out, incomplete: true }
        out.billingDone = true
        await ctx.checkpoint(out)
      }
      // Steps 2-5 each run once per slot; a continuation skips the ones already
      // recorded as complete and re-runs one that itself stopped at the deadline.
      return runSteps({ ...ctx, prior: out }, [
        ['enrollments', () => reconcilePendingEnrollments({ deadline: budget.deadline })],
        ['affiliates', () => retryAffiliateHistory({ deadline: budget.deadline })],
        ['marketing', () => reconcileMarketing({ deadline: budget.deadline })],
        ['notifications', () => retryFailedNotifications({ deadline: budget.deadline })],
      ])
    },
  },
  'demo-reset': {
    name: 'demo-reset',
    label: 'Nightly demo reset',
    description: 'Rebuilds both demo accounts so every presenter starts the day with a fresh call list.',
    hourEt: 3,
    run: async ({ budget, prior }) => {
      // A continuation does not force: a practice already rebuilt today by
      // the earlier pass is "fresh" and skipped; only the deferred one runs.
      const results = await ensureAllDemosSeeded({ force: !prior, deadline: budget.deadline })
      const failed = Object.entries(results).filter(([, r]) => r.status === 'error')
      if (failed.length > 0) {
        throw new Error(
          failed.map(([key, r]) => `${key}: ${r.status === 'error' ? r.message : ''}`).join('; '),
        )
      }
      const summary: Record<string, unknown> = { ...(prior ?? {}) }
      delete summary.incomplete
      let deferred = false
      for (const [key, r] of Object.entries(results)) {
        if (r.status === 'deferred') {
          deferred = true
          if (summary[key] === undefined) summary[key] = { status: 'deferred' }
          continue
        }
        const already = summary[key] as { status?: string } | undefined
        // Keep the earlier pass's "seeded" detail rather than the continuation's "fresh".
        if (r.status === 'fresh' && already?.status === 'seeded') continue
        summary[key] = r.status === 'seeded' ? { status: 'seeded', ...r.summary } : { status: r.status }
      }
      return deferred ? { ...summary, incomplete: true } : summary
    },
  },
}

export const CRON_JOB_NAMES = Object.keys(CRON_JOBS) as CronJobName[]

export function isCronJobName(value: unknown): value is CronJobName {
  return typeof value === 'string' && value in CRON_JOBS
}

/** Considered crashed if still "running" after this long; the scheduler may re-claim it. */
export const CRON_RUN_STALE_MS = 30 * 60_000

export type RunOutcome =
  | { ok: true; run: CronRun; summary: Record<string, unknown>; incomplete: boolean }
  | { ok: false; run: CronRun; error: string }
  /** The slot (or the job) is already taken; `existing` is the run that owns it. */
  | { ok: true; skipped: true; existing: CronRun | null; reason: string }

export interface RunOptions {
  trigger: CronTrigger
  /**
   * Which daily slot this run stands for. Scheduler and external-cron
   * triggers pass the current slot so that, whichever fires first, the day's
   * run happens exactly once. Omit only for an explicit manual re-run.
   */
  dueKey?: string
  actor?: string | null
  /** Wall-clock budget for this run; defaults to CRON_RUN_BUDGET_MS. */
  budget?: RunBudget
}

export function currentDueKey(job: CronJobName, now: Date = new Date()): string {
  return dueKeyFor(CRON_JOBS[job].hourEt, now)
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** The run currently holding a job's slot, if any. */
async function runForSlot(job: CronJobName, dueKey: string, conn: Tx | typeof db = db): Promise<CronRun | null> {
  const [row] = await conn
    .select()
    .from(cronRunsTable)
    .where(and(eq(cronRunsTable.job, job), eq(cronRunsTable.dueKey, dueKey)))
    .limit(1)
  return row ?? null
}

/** The most recently started run of a job. */
async function latestRun(job: CronJobName, conn: Tx | typeof db = db): Promise<CronRun | null> {
  const [row] = await conn
    .select()
    .from(cronRunsTable)
    .where(eq(cronRunsTable.job, job))
    .orderBy(desc(cronRunsTable.startedAt))
    .limit(1)
  return row ?? null
}

/** A run of this job that started recently and has not finished. */
async function runInProgress(job: CronJobName, conn: Tx | typeof db = db): Promise<CronRun | null> {
  const staleBefore = new Date(Date.now() - CRON_RUN_STALE_MS)
  const [row] = await conn
    .select()
    .from(cronRunsTable)
    .where(and(eq(cronRunsTable.job, job), eq(cronRunsTable.status, 'running'), sql`${cronRunsTable.startedAt} >= ${staleBefore.toISOString()}`))
    .orderBy(desc(cronRunsTable.startedAt))
    .limit(1)
  return row ?? null
}

/**
 * Claim a run row. All trigger modes go through one per-job transaction
 * lock (pg_advisory_xact_lock), so the "is anything running?" check and the
 * insert are atomic across instances: a scheduled run never starts on top of
 * a manual one and two manual clicks cannot both start. The reason for a
 * refused claim is decided inside the same transaction: checking it
 * afterwards would race the winner finishing (on a remote database the
 * winner can be done before the loser's second query lands).
 *
 * A slot whose run is `partial` (stopped at its time budget) is claimed
 * again by the next trigger; the previous summary comes back as `prior`.
 */
type ClaimResult =
  | { claimed: CronRun; prior: Record<string, unknown> | null }
  | { claimed: null; inProgress: CronRun | null }

async function claimRun(job: CronJobName, opts: RunOptions): Promise<ClaimResult> {
  const id = randomUUID()
  const base = {
    id,
    job,
    dueKey: opts.dueKey ?? null,
    trigger: opts.trigger,
    status: 'running' as const,
    startedAt: new Date(),
    actor: opts.actor ?? null,
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`cron:${job}`}))`)
    // Never two passes of the same job at once, whatever started them: the
    // billing pass must not retry a card while another pass is mid-way
    // through the same invoices.
    const inProgress = await runInProgress(job, tx)
    if (inProgress) return { claimed: null, inProgress }
    if (!opts.dueKey) {
      // A manual run first continues the job's latest run if that one stopped
      // at its time budget — "Run now again" finishes the rest instead of
      // starting over — otherwise it is a fresh run outside any slot.
      const latest = await latestRun(job, tx)
      if (latest?.status === 'partial') {
        const [row] = await tx
          .update(cronRunsTable)
          .set({ id, trigger: opts.trigger, status: 'running', startedAt: base.startedAt, finishedAt: null, summary: null, error: null, actor: base.actor })
          .where(and(eq(cronRunsTable.id, latest.id), eq(cronRunsTable.status, 'partial')))
          .returning()
        if (row) return { claimed: row, prior: latest.summary ?? {} }
      }
      const [row] = await tx.insert(cronRunsTable).values(base).returning()
      return row ? { claimed: row, prior: null } : { claimed: null, inProgress: null }
    }
    const existing = await runForSlot(job, opts.dueKey, tx)
    const staleBefore = new Date(Date.now() - CRON_RUN_STALE_MS)
    // Continue a partial run, or a stale "running" one from its last checkpoint.
    const stale = existing?.status === 'running' && existing.startedAt < staleBefore
    const prior = existing?.status === 'partial' || stale ? existing?.summary ?? null : null
    const [row] = await tx
      .insert(cronRunsTable)
      .values(base)
      .onConflictDoUpdate({
        target: [cronRunsTable.job, cronRunsTable.dueKey],
        set: {
          id,
          trigger: opts.trigger,
          status: 'running',
          startedAt: base.startedAt,
          finishedAt: null,
          summary: null,
          error: null,
          actor: base.actor,
        },
        // Take over a run that is stuck in "running" long past any plausible
        // duration (the instance that owned it died), or continue one that
        // stopped at its time budget.
        setWhere: or(
          and(eq(cronRunsTable.status, 'running'), sql`${cronRunsTable.startedAt} < ${staleBefore.toISOString()}`),
          eq(cronRunsTable.status, 'partial'),
        ),
      })
      .returning()
    return row && row.id === id ? { claimed: row, prior } : { claimed: null, inProgress: null }
  })
}

/** Run a job now, recording the attempt. Skips (without running) if the slot is already taken. */
export async function runCronJob(job: CronJobName, opts: RunOptions): Promise<RunOutcome> {
  const def = CRON_JOBS[job]
  // Checked before claiming, so a preview never uses up production's daily slot.
  assertRealEffectsAllowed('Scheduled jobs')
  const claim = await claimRun(job, opts)
  if (!claim.claimed) {
    if (claim.inProgress) return { ok: true, skipped: true, existing: claim.inProgress, reason: 'a run is already in progress' }
    const existing = opts.dueKey ? await runForSlot(job, opts.dueKey) : null
    return { ok: true, skipped: true, existing, reason: opts.dueKey ? `already ran for ${opts.dueKey}` : 'a run is already in progress' }
  }
  const run = claim.claimed
  const budget = opts.budget ?? RunBudget.of(cronRunBudgetMs())
  const continuations = num(claim.prior?.continuations) + (claim.prior ? 1 : 0)
  const log = logger.child({ cron: { job, runId: run.id, trigger: opts.trigger, dueKey: opts.dueKey ?? null, continuation: continuations } })
  log.info({ budgetMs: budget.remaining() }, continuations ? 'cron job continued' : 'cron job started')
  try {
    if (continuations > CRON_MAX_CONTINUATIONS) {
      throw new Error(`still unfinished after ${CRON_MAX_CONTINUATIONS} continued runs; check the job for an item that never completes`)
    }
    const checkpoint = async (summary: Record<string, unknown>) => {
      await db.update(cronRunsTable).set({ summary: { ...summary, ...(continuations ? { continuations } : {}) } }).where(eq(cronRunsTable.id, run.id))
    }
    const result = await def.run({ budget, prior: claim.prior, checkpoint })
    const incomplete = result.incomplete === true
    const summary: Record<string, unknown> = { ...result, ...(continuations ? { continuations } : {}) }
    if (!incomplete) delete summary.incomplete
    const [done] = await db
      .update(cronRunsTable)
      .set({ status: incomplete ? 'partial' : 'ok', finishedAt: new Date(), summary })
      .where(eq(cronRunsTable.id, run.id))
      .returning()
    log.info({ summary }, incomplete ? 'cron job stopped at its time budget; the rest runs next time' : 'cron job finished')
    return { ok: true, run: done ?? run, summary, incomplete }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    log.error({ err }, 'cron job failed')
    const [done] = await db
      .update(cronRunsTable)
      .set({ status: 'failed', finishedAt: new Date(), error })
      .where(eq(cronRunsTable.id, run.id))
      .returning()
    await notifyFailure(def, run, opts.trigger, error)
    return { ok: false, run: done ?? run, error }
  }
}

/** Email the super admin. Never throws — a mail problem must not mask the job error. */
async function notifyFailure(def: CronJobDefinition, run: CronRun, trigger: CronTrigger, error: string): Promise<void> {
  const to = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase()
  if (!to) {
    logger.warn({ job: def.name }, 'SUPER_ADMIN_EMAIL is not set; cron failure alert not sent')
    return
  }
  try {
    await sendEmail(
      'cron_failed',
      to,
      {
        jobLabel: def.label,
        job: def.name,
        trigger,
        startedAt: run.startedAt.toISOString(),
        error,
        dashboardUrl: `${appOrigin()}/admin/payments`,
      },
      { metadata: { runId: run.id, job: def.name } },
    )
  } catch (err) {
    logger.error({ err, job: def.name }, 'cron failure alert could not be sent')
  }
}

/** How long after its slot a job may go un-run before the dashboard calls it overdue. */
export const CRON_OVERDUE_AFTER_HOURS = 2

export interface CronJobStatus {
  name: CronJobName
  label: string
  description: string
  hourEt: number
  /** The slot that should have run by now. */
  expectedDueKey: string
  /** True when the expected slot has no run and the grace period has passed. */
  overdue: boolean
  lastRun: CronRun | null
  lastSuccess: CronRun | null
  recent: CronRun[]
}

/** What the admin dashboard shows: the last few runs of every job. */
export async function getCronJobStatuses(recentLimit = 10): Promise<CronJobStatus[]> {
  const rows = await db
    .select()
    .from(cronRunsTable)
    .where(inArray(cronRunsTable.job, CRON_JOB_NAMES))
    .orderBy(desc(cronRunsTable.startedAt))
    .limit(recentLimit * CRON_JOB_NAMES.length * 4)
  const now = new Date()
  return CRON_JOB_NAMES.map((name) => {
    const def = CRON_JOBS[name]
    const mine = rows.filter((r) => r.job === name)
    const expectedDueKey = dueKeyFor(def.hourEt, now)
    const slotRun = mine.find((r) => r.dueKey === expectedDueKey)
    const overdue = !slotRun && hoursSinceSlot(expectedDueKey, def.hourEt, now) > CRON_OVERDUE_AFTER_HOURS
    return {
      name,
      label: def.label,
      description: def.description,
      hourEt: def.hourEt,
      expectedDueKey,
      overdue,
      lastRun: mine[0] ?? null,
      lastSuccess: mine.find((r) => r.status === 'ok') ?? null,
      recent: mine.slice(0, recentLimit),
    }
  })
}
