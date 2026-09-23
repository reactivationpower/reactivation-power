import { logger } from '@/lib/logger'
import { CRON_JOBS, CRON_JOB_NAMES, runCronJob, type CronJobName } from './jobs'
import { dueKeyFor } from './slots'

export { dueKeyFor } from './slots'

/**
 * In-process daily scheduler.
 *
 * The API server is an autoscale deployment, so there is no always-on box
 * to hang a classic cron on and instances may come and go. Instead every
 * instance ticks every few minutes and asks, per job, "which scheduled slot
 * is the most recent one that has already passed?" (the ET calendar day of
 * that slot is the due key). It then tries to claim that slot in cron_runs;
 * the unique (job, due_key) index means exactly one instance wins and the
 * others do nothing. A slot missed while no instance was awake is picked up
 * on the next tick after boot, so a quiet night delays a run rather than
 * skipping it.
 *
 * Autoscale scales to zero when idle, so a tick can only fire while some
 * instance is awake. An external trigger hitting GET /api/cron/<job> at the
 * slot time (see replit.md → Scheduled jobs) wakes an instance and claims
 * the very same slot, so the two mechanisms never double-run a day.
 *
 * Enabled when NODE_ENV=production; force with CRON_SCHEDULER=on (or off).
 */

export const CRON_TICK_MS = 5 * 60_000

const pad = (n: number) => String(n).padStart(2, '0')

export function schedulerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = env.CRON_SCHEDULER?.trim().toLowerCase()
  if (flag === 'on' || flag === 'true' || flag === '1') return true
  if (flag === 'off' || flag === 'false' || flag === '0') return false
  return env.NODE_ENV === 'production'
}

const inFlight = new Set<CronJobName>()

/** One pass over every job. Exported for tests and the boot-time first tick. */
export async function tick(now: Date = new Date()): Promise<void> {
  for (const name of CRON_JOB_NAMES) {
    if (inFlight.has(name)) continue
    const dueKey = dueKeyFor(CRON_JOBS[name].hourEt, now)
    inFlight.add(name)
    try {
      await runCronJob(name, { trigger: 'scheduler', dueKey }) // skipped when the slot is already taken
    } catch (err) {
      // runCronJob only throws if the claim itself failed (e.g. DB down).
      logger.error({ err, job: name, dueKey }, 'cron scheduler could not claim run')
    } finally {
      inFlight.delete(name)
    }
  }
}

let timer: NodeJS.Timeout | null = null

export function startCronScheduler(): boolean {
  if (!schedulerEnabled()) {
    logger.info('cron scheduler disabled (set CRON_SCHEDULER=on to enable outside production)')
    return false
  }
  if (timer) return true
  const schedule = CRON_JOB_NAMES.map((n) => `${n}@${pad(CRON_JOBS[n].hourEt)}:00 ET`).join(', ')
  logger.info({ tickMs: CRON_TICK_MS, schedule }, 'cron scheduler started')
  // First tick shortly after boot so a slot missed overnight runs promptly.
  setTimeout(() => void tick(), 15_000).unref()
  timer = setInterval(() => void tick(), CRON_TICK_MS)
  timer.unref()
  return true
}

export function stopCronScheduler(): void {
  if (timer) clearInterval(timer)
  timer = null
}
