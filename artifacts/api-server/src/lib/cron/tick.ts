import { logger } from '@/lib/logger'
import { deliverLeadEmails } from '@/lib/lead-followup/notifications'
import { retryPendingEnrollmentInvitations } from '@/lib/agreements/enrollment-invitation'
import { retryOnboardingInvitations } from '@/lib/affiliates/onboarding-invitations'
import { runSalesWorker } from '@/lib/sales-leads/worker'
import { reconcileMarketing } from '@/lib/marketing/reconcile'
import { CRON_JOBS, CRON_JOB_NAMES, runCronJob, type CronJobName, type CronTrigger } from './jobs'
import { dueKeyFor } from './slots'
import { DAILY_JOB_MIN_BUDGET_MS, RunBudget, TICK_STEP_BUDGET_MS, cronRunBudgetMs } from './budget'

/**
 * One five-minute pass, shared by the in-process scheduler (Replit) and the
 * Vercel Cron route GET /api/cron/workers.
 *
 * 1. The five-minute workers, each with its own slice of the budget: lead
 *    emails, enrollment and affiliate invitation recovery, the sales worker
 *    (sales inbox inbound, appointment confirmations, GoHighLevel sync,
 *    cadence) and marketing reconciliation. Each stops between items when
 *    its slice is used up; durable claims make the next pass pick up the rest.
 * 2. The daily jobs: claim the current slot of each (a no-op when the hourly
 *    cron already ran it), continue a partial one, or catch up a slot that a
 *    missed cron call left un-run. Vercel does not retry a failed cron call,
 *    so this is what makes a missed day run late instead of never.
 */

export type TickStepStatus = 'ok' | 'failed' | 'skipped'

export interface TickReport {
  trigger: CronTrigger
  steps: Record<string, TickStepStatus>
  daily: Partial<Record<CronJobName, 'ran' | 'continued' | 'partial' | 'skipped' | 'failed' | 'deferred' | 'error'>>
  budgetLeftMs: number
}

export interface TickOptions {
  trigger: CronTrigger
  budget?: RunBudget
  now?: Date
}

const inFlight = new Set<CronJobName>()

export async function runScheduledTick(opts: TickOptions): Promise<TickReport> {
  const budget = opts.budget ?? RunBudget.of(cronRunBudgetMs())
  const now = opts.now ?? new Date()
  const report: TickReport = { trigger: opts.trigger, steps: {}, daily: {}, budgetLeftMs: 0 }

  const step = async (name: keyof typeof TICK_STEP_BUDGET_MS, work: (deadline: number) => Promise<unknown>) => {
    if (budget.exhausted(1_000)) { report.steps[name] = 'skipped'; return }
    const slice = budget.slice(TICK_STEP_BUDGET_MS[name])
    try {
      await work(slice.deadline)
      report.steps[name] = 'ok'
    } catch (err) {
      report.steps[name] = 'failed'
      logger.error({ err, step: name }, 'five-minute worker failed')
    }
  }

  await step('leadEmails', (deadline) => deliverLeadEmails(undefined, { deadline }))
  await step('enrollmentInvitations', (deadline) => retryPendingEnrollmentInvitations({ deadline }))
  await step('onboardingInvitations', (deadline) => retryOnboardingInvitations({ deadline }))
  await step('salesWorker', (deadline) => runSalesWorker({ deadline }))
  await step('marketing', (deadline) => reconcileMarketing({ deadline }))

  for (const name of CRON_JOB_NAMES) {
    if (inFlight.has(name)) { report.daily[name] = 'skipped'; continue }
    if (budget.exhausted(DAILY_JOB_MIN_BUDGET_MS)) { report.daily[name] = 'deferred'; continue }
    const dueKey = dueKeyFor(CRON_JOBS[name].hourEt, now)
    inFlight.add(name)
    try {
      const outcome = await runCronJob(name, { trigger: opts.trigger, dueKey, budget })
      report.daily[name] = 'skipped' in outcome ? 'skipped' : !outcome.ok ? 'failed' : outcome.incomplete ? 'partial'
        : outcome.summary.continuations ? 'continued' : 'ran'
    } catch (err) {
      // runCronJob only throws if the claim itself failed (e.g. DB down).
      report.daily[name] = 'error'
      logger.error({ err, job: name, dueKey }, 'cron tick could not claim run')
    } finally {
      inFlight.delete(name)
    }
  }
  report.budgetLeftMs = budget.remaining()
  return report
}
