import { isVercelPreview } from '../deployment-safety'
import { runAfterResponse } from '../after-response'
import { AFTER_RESPONSE_BUDGET_MS } from '../cron/budget'

/**
 * Coalesce post-commit wakes without coupling saves to provider availability.
 *
 * The drain runs after the response through runAfterResponse (Vercel
 * `waitUntil`; plain background work on Replit) and is bounded: it stops at
 * AFTER_RESPONSE_BUDGET_MS and leaves the rest to the five-minute worker,
 * whose durable claims make a cut-off drain harmless. Nothing here assumes
 * the process outlives the request.
 */
let running = false
let requested = false
export function nudgeSalesSync() {
  // Vercel Preview shares the production queue; leave it to production.
  if (isVercelPreview()) return
  requested = true
  if (running || workerState.busy) return
  running = true
  void runAfterResponse('sales sync nudge', async () => {
    const deadline = Date.now() + AFTER_RESPONSE_BUDGET_MS
    try {
      do {
        requested = false
        const { drainSalesSync } = await import('./worker')
        if (await drainSalesSync(deadline)) requested = true
        if (Date.now() >= deadline) { requested = false; break }
        if (requested) await new Promise(resolve => setTimeout(resolve, 25))
      } while (requested)
    } catch {
      requested = false
      console.warn('sales_sync_wake_failed; durable scheduled recovery retained')
    } finally {
      running = false
      if (requested) nudgeSalesSync()
    }
  })
}

/** Set by runSalesWorker while a pass is in flight: it drains sync itself, so a nudge then is redundant. */
export const workerState = { busy: false }
