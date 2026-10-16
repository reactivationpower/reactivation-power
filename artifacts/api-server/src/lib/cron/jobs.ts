import { randomUUID } from 'node:crypto'
import { assertRealEffectsAllowed } from '@/lib/deployment-safety'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { cronRunsTable, db, type CronRun } from '@workspace/db'

import { retryPastDueInvoices } from '@/lib/billing/dunning'
import { ensureAllDemosSeeded } from '@/lib/demo/seed'
import { appOrigin } from '@/lib/app-origin'
import { logger } from '@/lib/logger'
import { sendEmail } from '@/lib/mail'
import { dueKeyFor, hoursSinceSlot } from './slots'
import { cleanupAuthRecords } from '@/lib/auth/retention'
import { cleanupAffiliateTelemetry } from '@/lib/affiliates/retention'
import { retryAffiliateHistory } from '@/lib/affiliates/ledger'
import { reconcilePendingEnrollments } from '@/actions/enrollment'
import { cleanupMarketing, reconcileMarketing } from '@/lib/marketing/reconcile'

/**
 * The scheduled jobs and the single entry point that runs one of them.
 *
 * Every run — whether the in-process scheduler, the Bearer-protected HTTP
 * route or an admin's "Run now" started it — goes through runCronJob so it
 * lands in cron_runs (what the admin dashboard shows) and a thrown error
 * emails the super admin. A job that completes with declines in its summary
 * is still a successful *run*; only the job itself breaking is a failure.
 */

export type CronJobName = 'billing-retry' | 'demo-reset' | 'auth-cleanup'
export type CronTrigger = 'scheduler' | 'http' | 'admin'

export interface CronJobDefinition {
  name: CronJobName
  label: string
  description: string
  /** Hour (0-23) in America/New_York at which the daily run becomes due. */
  hourEt: number
  run: () => Promise<Record<string, unknown>>
}

export const CRON_JOBS: Record<CronJobName, CronJobDefinition> = {
  'auth-cleanup': {
    name: 'auth-cleanup',
    label: 'Authentication record cleanup',
    description: 'Removes retired sign-in codes, obsolete rate-limit counters, and inactive security sessions after one day; preserves analytics history.',
    hourEt: 4,
    run: async () => ({ ...await cleanupAuthRecords(), affiliates: await cleanupAffiliateTelemetry(), marketing: await cleanupMarketing() }),
  },
  'billing-retry': {
    name: 'billing-retry',
    label: 'Daily billing retry',
    description: 'Re-attempts every open invoice of every past-due customer on the primary card, then the secondary.',
    hourEt: 6,
    run: async () => {
      const summary = await retryPastDueInvoices('cron')
      const enrollments = await reconcilePendingEnrollments()
      const affiliates = await retryAffiliateHistory()
      const marketing = await reconcileMarketing()
      // Keep per-invoice detail in the log but cap it so the row stays small.
      return { ...summary, enrollments, affiliates, marketing, details: summary.details.slice(0, 50) }
    },
  },
  'demo-reset': {
    name: 'demo-reset',
    label: 'Nightly demo reset',
    description: 'Rebuilds both demo accounts so every presenter starts the day with a fresh call list.',
    hourEt: 3,
    run: async () => {
      const results = await ensureAllDemosSeeded({ force: true })
      const failed = Object.entries(results).filter(([, r]) => r.status === 'error')
      if (failed.length > 0) {
        throw new Error(
          failed.map(([key, r]) => `${key}: ${r.status === 'error' ? r.message : ''}`).join('; '),
        )
      }
      const summary: Record<string, unknown> = {}
      for (const [key, r] of Object.entries(results)) {
        summary[key] = r.status === 'seeded' ? { status: 'seeded', ...r.summary } : { status: r.status }
      }
      return summary
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
  | { ok: true; run: CronRun; summary: Record<string, unknown> }
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
}

export function currentDueKey(job: CronJobName, now: Date = new Date()): string {
  return dueKeyFor(CRON_JOBS[job].hourEt, now)
}

/** The run currently holding a job's slot, if any. */
async function runForSlot(job: CronJobName, dueKey: string): Promise<CronRun | null> {
  const [row] = await db
    .select()
    .from(cronRunsTable)
    .where(and(eq(cronRunsTable.job, job), eq(cronRunsTable.dueKey, dueKey)))
    .limit(1)
  return row ?? null
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

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
 */
type ClaimResult =
  | { claimed: CronRun }
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
      const [row] = await tx.insert(cronRunsTable).values(base).returning()
      return row ? { claimed: row } : { claimed: null, inProgress: null }
    }
    const staleBefore = new Date(Date.now() - CRON_RUN_STALE_MS)
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
        // Only take over a run that is stuck in "running" long past any
        // plausible duration (the instance that owned it died).
        setWhere: and(eq(cronRunsTable.status, 'running'), sql`${cronRunsTable.startedAt} < ${staleBefore.toISOString()}`),
      })
      .returning()
    return row && row.id === id ? { claimed: row } : { claimed: null, inProgress: null }
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
  const log = logger.child({ cron: { job, runId: run.id, trigger: opts.trigger, dueKey: opts.dueKey ?? null } })
  log.info('cron job started')
  try {
    const summary = await def.run()
    const [done] = await db
      .update(cronRunsTable)
      .set({ status: 'ok', finishedAt: new Date(), summary })
      .where(eq(cronRunsTable.id, run.id))
      .returning()
    log.info({ summary }, 'cron job finished')
    return { ok: true, run: done ?? run, summary }
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
