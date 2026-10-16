/**
 * Time budgets for scheduled work.
 *
 * On Vercel a cron run is one function invocation with a hard duration limit
 * (vercel.json `functions.maxDuration`, see VERCEL_FUNCTION_MAX_SECONDS). A
 * job that is still writing when that limit hits is killed mid-way, so every
 * job and five-minute worker gets a deadline below the limit, checks it
 * *between* items, and leaves whatever is left for the next run. Progress is
 * always in the database (claimed rows, per-practice seed stamps, outbox
 * statuses), never only in memory.
 *
 * The same budgets apply on Replit; there they are simply generous.
 */

/** What vercel.json sets for the API function. Keep the two in sync. */
export const VERCEL_FUNCTION_MAX_SECONDS = 300

/** Default wall-clock budget for one cron run; margin for the claim, the final update and the failure email. */
export const CRON_RUN_BUDGET_MS = 240_000

/** How long the five-minute tick may spend on each worker before moving on. */
export const TICK_STEP_BUDGET_MS = {
  leadEmails: 30_000,
  enrollmentInvitations: 20_000,
  onboardingInvitations: 20_000,
  salesWorker: 120_000,
  marketing: 20_000,
} as const

/** A daily job is only started from the tick if at least this much budget is left. */
export const DAILY_JOB_MIN_BUDGET_MS = 60_000

/** After-response work (sales sync nudge, post-booking confirmations) may run this long. */
export const AFTER_RESPONSE_BUDGET_MS = 45_000

export function cronRunBudgetMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.CRON_RUN_BUDGET_MS)
  if (Number.isFinite(raw) && raw >= 10_000 && raw < VERCEL_FUNCTION_MAX_SECONDS * 1000) return raw
  return CRON_RUN_BUDGET_MS
}

export class RunBudget {
  constructor(readonly deadline: number) {}

  static of(ms: number, now: number = Date.now()): RunBudget {
    return new RunBudget(now + ms)
  }

  /** Milliseconds left, never negative. */
  remaining(now: number = Date.now()): number {
    return Math.max(0, this.deadline - now)
  }

  /** True when less than `reserveMs` is left — stop before the next item. */
  exhausted(reserveMs = 0, now: number = Date.now()): boolean {
    return this.remaining(now) <= reserveMs
  }

  /** A budget of at most `ms` that never outlives this one. */
  slice(ms: number, now: number = Date.now()): RunBudget {
    return new RunBudget(Math.min(this.deadline, now + ms))
  }
}

/** Milliseconds left before `deadline`; `Infinity` when no deadline was given. */
export function timeLeft(deadline: number | undefined, now: number = Date.now()): number {
  return deadline === undefined ? Number.POSITIVE_INFINITY : deadline - now
}

/** True when a loop should stop before its next item. */
export function pastDeadline(deadline: number | undefined, reserveMs = 0, now: number = Date.now()): boolean {
  return timeLeft(deadline, now) <= reserveMs
}
