import { PUBLIC_APP_ORIGIN } from '@/lib/app-origin'

// App-owned links only. Stripe receipt URLs must keep their external origin.
const APP_LINK_FIELDS = new Set([
  'loginUrl', 'inviteUrl', 'portalUrl', 'billingUrl', 'updatePaymentUrl',
  'reactivateUrl', 'signUrl', 'agreementUrl', 'dashboardUrl', 'adminUrl', 'setupUrl',
])

/**
 * Enforce the public email domain at render time, including old outbox payloads.
 * Preserve the route, token, query and fragment; never rewrite customer emails,
 * historical agreement wording or third-party payment receipts.
 */
export function canonicalEmailLinks<T extends object>(data: T): T {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => {
    if (!APP_LINK_FIELDS.has(key) || typeof value !== 'string') return [key, value]
    const url = new URL(value, PUBLIC_APP_ORIGIN)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error(`Invalid email link: ${key}`)
    }
    return [key, `${PUBLIC_APP_ORIGIN}${url.pathname}${url.search}${url.hash}`]
  })) as T
}