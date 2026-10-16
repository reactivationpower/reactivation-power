import { runAfterResponse } from './after-response'

/**
 * Promise-form of `runAfterResponse` for work that is already running: keeps
 * a Vercel instance awake until it settles (so a borrowed pool client or
 * session lock is never frozen) and swallows rejections. Prefer
 * `runAfterResponse` with a deadline for new call sites.
 */
export function continueAfterResponse(work: Promise<unknown> | void): void {
  void runAfterResponse('background work', () => Promise.resolve(work))
}
