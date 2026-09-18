import { loadStripe, type Stripe } from '@stripe/stripe-js'
import { apiUrl } from '@/lib/api'

let promise: Promise<Stripe | null> | null = null

/**
 * Stripe.js loaded with the publishable key served by GET /api/config
 * (the key lives in the server environment; it is public but not baked
 * into the bundle).
 */
export function getStripe(): Promise<Stripe | null> {
  if (!promise) {
    promise = fetch(apiUrl('/config'), { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load app config (${res.status})`)
        const cfg = (await res.json()) as { stripePublishableKey: string | null }
        if (!cfg.stripePublishableKey) {
          throw new Error('Stripe publishable key is not configured on the server.')
        }
        return loadStripe(cfg.stripePublishableKey)
      })
      .catch((err) => {
        promise = null
        throw err
      })
  }
  return promise
}

/** Same promise, for components that construct it at module scope. */
export const stripePromise: Promise<Stripe | null> = new Promise((resolve, reject) => {
  // Deferred so the fetch happens on first use, not at import time.
  queueMicrotask(() => getStripe().then(resolve, reject))
})
