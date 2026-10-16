import { isVercelPreview } from '../deployment-safety'
import { continueAfterResponse } from '../background-work'

/** Coalesce post-commit wakes without coupling saves to provider availability. */
let running = false
let requested = false
export function nudgeSalesSync() {
  // Vercel Preview shares the production queue; leave it to production.
  if (isVercelPreview()) return
  requested = true
  if (running) return
  running = true
  // One drain loop serves every nudge that arrives while it runs. The request
  // that started it keeps its Vercel instance awake until the loop settles, so
  // a claimed job's transaction/lock is never frozen in a suspended instance.
  continueAfterResponse(new Promise<void>(resolve => setImmediate(async () => {
    try {
      do {
        requested = false
        const { drainSalesSync } = await import('./worker')
        if (await drainSalesSync()) requested = true
        if (requested) await new Promise(resolve => setTimeout(resolve, 25))
      } while (requested)
    } catch {
      requested = false
      console.warn('sales_sync_wake_failed; durable scheduled recovery retained')
    } finally {
      running = false
      resolve()
      if (requested) nudgeSalesSync()
    }
  })))
}
