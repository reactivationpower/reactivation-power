import { logger } from '@/lib/logger'
import { CRON_JOBS, CRON_JOB_NAMES } from './jobs'
import { runScheduledTick } from './tick'
import { isVercel, isVercelPreview } from '@/lib/deployment-safety'

export { dueKeyFor } from './slots'

/**
 * In-process scheduler (Replit only).
 *
 * The Replit API server is an autoscale deployment, so there is no always-on
 * box to hang a classic cron on and instances may come and go. Instead every
 * instance ticks every few minutes and runs one shared pass
 * (lib/cron/tick.ts): the five-minute workers, then "which daily slot is
 * the most recent one that has already passed?" per job. It then tries to
 * claim that slot in cron_runs; the unique (job, due_key) index means
 * exactly one instance wins and the others do nothing. A slot missed while
 * no instance was awake is picked up on the next tick after boot, so a
 * quiet night delays a run rather than skipping it.
 *
 * Autoscale scales to zero when idle, so a tick can only fire while some
 * instance is awake. An external trigger hitting GET /api/cron/<job> at the
 * slot time (see replit.md → Scheduled jobs) wakes an instance and claims
 * the very same slot, so the two mechanisms never double-run a day.
 *
 * On Vercel there is no long-lived process: Vercel Cron calls the same
 * routes instead (vercel.json `crons`), and this scheduler is never started.
 *
 * Enabled when NODE_ENV=production; force with CRON_SCHEDULER=on (or off).
 */

export const CRON_TICK_MS = 5 * 60_000

const pad = (n: number) => String(n).padStart(2, '0')

export function schedulerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  // Vercel: functions are frozen between requests, so a timer cannot keep
  // time; Vercel Cron drives the same tick through the HTTP route. Preview
  // additionally shares the production database and must never run jobs.
  if (isVercel(env) || isVercelPreview(env)) return false
  const flag = env.CRON_SCHEDULER?.trim().toLowerCase()
  if (flag === 'on' || flag === 'true' || flag === '1') return true
  if (flag === 'off' || flag === 'false' || flag === '0') return false
  return env.NODE_ENV === 'production'
}

/** One pass over every worker and job. Exported for tests and the boot-time first tick. */
export async function tick(now: Date = new Date()): Promise<void> {
  await runScheduledTick({ trigger: 'scheduler', now })
}

let timer: NodeJS.Timeout | null = null
let startupTimer: NodeJS.Timeout | null = null
let running: Promise<void> | null = null
function runTick() {
  if (running) return
  running = tick().catch(err => logger.error({ err }, 'cron tick failed')).finally(() => { running = null })
}

export function startCronScheduler(): boolean {
  if (!schedulerEnabled()) {
    logger.info('cron scheduler disabled (set CRON_SCHEDULER=on to enable outside production; never on Vercel)')
    return false
  }
  if (timer) return true
  const schedule = CRON_JOB_NAMES.map((n) => `${n}@${pad(CRON_JOBS[n].hourEt)}:00 ET`).join(', ')
  logger.info({ tickMs: CRON_TICK_MS, schedule }, 'cron scheduler started')
  // First tick shortly after boot so a slot missed overnight runs promptly.
  startupTimer = setTimeout(runTick, 15_000)
  startupTimer.unref()
  timer = setInterval(runTick, CRON_TICK_MS)
  timer.unref()
  return true
}

export async function stopCronScheduler(): Promise<void> {
  if (timer) clearInterval(timer)
  if (startupTimer) clearTimeout(startupTimer)
  timer = null
  startupTimer = null
  await running
}
