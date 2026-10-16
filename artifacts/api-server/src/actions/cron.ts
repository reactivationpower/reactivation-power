import { requireAdmin } from '@/lib/auth/admin-session'
import { getCronJobStatuses, isCronJobName, runCronJob, type CronJobStatus } from '@/lib/cron/jobs'
import { scheduledJobsBlockedReason } from '@/lib/deployment-safety'

/**
 * Super-admin view of the scheduled jobs (daily billing retry, nightly demo reset)
 * and a way to run one immediately. Runs are recorded in cron_runs exactly
 * like scheduled ones, stamped with the acting admin.
 */

type Result<T = Record<string, never>> = ({ ok: true } & T) | { ok: false; error: string }

export async function listCronJobs(): Promise<CronJobStatus[]> {
  await requireAdmin('super_admin')
  return getCronJobStatuses(5)
}

export async function runCronJobNow(input: { job: string }): Promise<Result<{ runId: string; summary: Record<string, unknown>; incomplete: boolean }>> {
  const admin = await requireAdmin('super_admin')
  if (!isCronJobName(input.job)) return { ok: false, error: 'Unknown job.' }
  const blocked = scheduledJobsBlockedReason()
  if (blocked) return { ok: false, error: blocked }
  const outcome = await runCronJob(input.job, { trigger: 'admin', actor: admin.name || admin.email })
  if ('skipped' in outcome) return { ok: false, error: 'That job is already running — wait for it to finish.' }
  if (!outcome.ok) return { ok: false, error: outcome.error }
  // A manual run has no daily slot to continue; incomplete means "click Run now again for the rest".
  return { ok: true, runId: outcome.run.id, summary: outcome.summary, incomplete: outcome.incomplete }
}
