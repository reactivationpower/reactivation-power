/** Coalesce post-commit wakes without coupling saves to provider availability. */
let running = false
let requested = false
export function nudgeSalesSync() {
  requested = true
  if (running) return
  running = true
  setImmediate(async () => {
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
      if (requested) nudgeSalesSync()
    }
  })
}
