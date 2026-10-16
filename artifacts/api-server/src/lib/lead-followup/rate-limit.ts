/**
 * Fixed-window request counter, in memory, keyed by campaign. Enough to stop
 * a misconfigured Zap looping on one URL from filling the events table; it is
 * per process, so two autoscale instances each allow the full quota.
 */

export const WEBHOOK_RATE_LIMIT = 60
export const WEBHOOK_RATE_WINDOW_MS = 60_000

export class RateLimiter {
  private windows = new Map<string, { start: number; count: number }>()

  constructor(
    private limit = WEBHOOK_RATE_LIMIT,
    private windowMs = WEBHOOK_RATE_WINDOW_MS,
  ) {}

  /** True when the request may proceed; `retryAfterSeconds` is set when it may not. */
  check(key: string, now = Date.now()): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
    let win = this.windows.get(key)
    if (!win || now - win.start >= this.windowMs) {
      win = { start: now, count: 0 }
      this.windows.set(key, win)
      if (this.windows.size > 5000) this.sweep(now)
    }
    if (win.count >= this.limit) {
      return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((win.start + this.windowMs - now) / 1000)) }
    }
    win.count++
    return { allowed: true, remaining: this.limit - win.count, retryAfterSeconds: 0 }
  }

  reset(key?: string): void {
    if (key === undefined) this.windows.clear()
    else this.windows.delete(key)
  }

  private sweep(now: number): void {
    for (const [key, win] of this.windows) {
      if (now - win.start >= this.windowMs) this.windows.delete(key)
    }
  }
}

export const webhookRateLimiter = new RateLimiter()
