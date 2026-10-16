import { waitUntil } from '@vercel/functions'
import { logger } from './logger'

/**
 * Work that should continue after the HTTP response has been sent (a sales
 * sync nudge after a save, confirmation messages right after a booking).
 *
 * On Replit the process stays alive, so the promise simply runs on. On Vercel
 * a function is frozen as soon as the response ends unless the work is
 * registered with `waitUntil`, which keeps the invocation alive until the
 * promise settles (still bounded by the function's maxDuration). Callers
 * must therefore pass bounded work — give it a deadline — and must never
 * rely on it: the five-minute cron picks up anything it did not finish.
 *
 * Off Vercel `waitUntil` is a no-op. Errors are logged, never thrown, so a
 * nudge can never fail the request that triggered it.
 */
export function runAfterResponse(label: string, work: () => Promise<unknown>): Promise<void> {
  let promise: Promise<void>
  try {
    promise = Promise.resolve(work()).then(
      () => undefined,
      (err: unknown) => { logger.warn({ err, label }, 'after-response work failed; the scheduled worker will retry') },
    )
  } catch (err) {
    logger.warn({ err, label }, 'after-response work could not start; the scheduled worker will retry')
    return Promise.resolve()
  }
  try {
    waitUntil(promise)
  } catch (err) {
    logger.warn({ err, label }, 'waitUntil unavailable; after-response work left to the process lifetime')
  }
  return promise
}
