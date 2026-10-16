import { waitUntil } from '@vercel/functions'

/**
 * Work that deliberately outlives the response: worker wakes after a save or a
 * booking. On Vercel the function instance can be suspended the moment the
 * response ends. A suspended instance keeps every pool client it borrowed,
 * including open transactions and session advisory locks, until it is resumed
 * or destroyed, so other instances would wait on (or skip) that lock for
 * minutes. waitUntil keeps the instance awake until the work settles. Off
 * Vercel there is no request context and waitUntil is a no-op, so Replit keeps
 * its fire-and-forget behavior unchanged.
 *
 * Must be called inside the request that triggers the work (that is where the
 * Vercel request context lives). Rejections are swallowed: the callers already
 * rely on durable queue rows, not on this wake, for recovery.
 */
export function continueAfterResponse(work: Promise<unknown> | void): void {
  waitUntil(Promise.resolve(work).then(() => undefined, () => undefined))
}
