import { and, desc, eq, lt } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { cronRunsTable, db, type CronRun } from '@workspace/db'
import { deploymentTarget, scheduledJobsBlockedReason } from '@/lib/deployment-safety'
import type { CronTrigger } from './jobs'

/**
 * A side-effect-free scheduled call that proves a scheduler (Vercel Cron, an
 * external cron) reaches this deployment with the right secret. It only
 * writes one cron_runs row per UTC hour (job "scheduler-check"), so it can be
 * left on before switch-over while the real jobs stay off, and its result is
 * shown at the bottom of the Scheduled jobs card.
 */

export const SCHEDULER_CHECK_JOB = 'scheduler-check'
const KEEP_DAYS = 7

export async function recordSchedulerCheck(trigger: CronTrigger, now: Date = new Date()) {
  const hourKey = now.toISOString().slice(0, 13) // UTC hour, e.g. 2026-10-16T14
  const blocked = scheduledJobsBlockedReason()
  const summary = {
    target: deploymentTarget(),
    region: process.env.VERCEL_REGION ?? null,
    scheduledJobs: blocked ? 'off' : 'on',
  }
  const [row] = await db
    .insert(cronRunsTable)
    .values({ id: randomUUID(), job: SCHEDULER_CHECK_JOB, dueKey: hourKey, trigger, status: 'ok', startedAt: now, finishedAt: now, summary })
    .onConflictDoNothing({ target: [cronRunsTable.job, cronRunsTable.dueKey] })
    .returning()
  await db
    .delete(cronRunsTable)
    .where(and(eq(cronRunsTable.job, SCHEDULER_CHECK_JOB), lt(cronRunsTable.startedAt, new Date(now.getTime() - KEEP_DAYS * 86_400_000))))
  return { recorded: Boolean(row), hour: hourKey, ...summary }
}

export async function lastSchedulerCheck(): Promise<CronRun | null> {
  const [row] = await db
    .select()
    .from(cronRunsTable)
    .where(eq(cronRunsTable.job, SCHEDULER_CHECK_JOB))
    .orderBy(desc(cronRunsTable.startedAt))
    .limit(1)
  return row ?? null
}
