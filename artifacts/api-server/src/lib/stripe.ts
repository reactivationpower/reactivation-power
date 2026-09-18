import Stripe from 'stripe'

/**
 * Stripe mode switch.
 *
 * Two sources of keys:
 *   live: STRIPE_SECRET_KEY + NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY (or VITE_STRIPE_PUBLISHABLE_KEY)
 *   test: the Replit Stripe integration (a Stripe Sandbox) — or, as a manual
 *         fallback, STRIPE_TEST_SECRET_KEY + STRIPE_TEST_PUBLISHABLE_KEY.
 *
 * `STRIPE_MODE=test|live` picks the source explicitly. When it is unset, the
 * development workspace runs in test mode whenever sandbox keys are available
 * (test cards work, nothing real is charged) and the published app runs live.
 * To force live everywhere, set STRIPE_MODE=live.
 *
 * `initStripe()` must be awaited once at startup before any request handler
 * touches `stripe`.
 */
export type StripeMode = 'test' | 'live'

const isProduction = process.env.NODE_ENV === 'production'

let resolved: {
  mode: StripeMode
  secretKey: string
  publishableKey: string | null
  client: Stripe
} | null = null

async function fetchSandboxKeys(): Promise<{ secretKey: string; publishableKey: string | null } | null> {
  // Preferred: the Replit Stripe integration (sandbox in the workspace).
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME
  const token = process.env.REPL_IDENTITY
    ? `repl ${process.env.REPL_IDENTITY}`
    : process.env.WEB_REPL_RENEWAL
      ? `depl ${process.env.WEB_REPL_RENEWAL}`
      : null
  if (hostname && token) {
    try {
      const res = await fetch(
        `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`,
        { headers: { Accept: 'application/json', X_REPLIT_TOKEN: token }, signal: AbortSignal.timeout(10_000) },
      )
      if (res.ok) {
        const data = (await res.json()) as { items?: { settings?: Record<string, string> }[] }
        const settings = data.items?.[0]?.settings
        if (settings?.secret) return { secretKey: settings.secret, publishableKey: settings.publishable ?? null }
      }
    } catch {
      // fall through to the manual keys
    }
  }
  // Fallback: manually supplied sandbox keys.
  if (process.env.STRIPE_TEST_SECRET_KEY) {
    return {
      secretKey: process.env.STRIPE_TEST_SECRET_KEY,
      publishableKey: process.env.STRIPE_TEST_PUBLISHABLE_KEY ?? null,
    }
  }
  return null
}

function liveKeys(): { secretKey: string; publishableKey: string | null } {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY is not configured')
  return {
    secretKey,
    publishableKey:
      process.env.VITE_STRIPE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || null,
  }
}

/** Resolve keys for the active mode and build the client. Idempotent. */
export async function initStripe(): Promise<StripeMode> {
  if (resolved) return resolved.mode
  const explicit = (process.env.STRIPE_MODE ?? '').trim().toLowerCase()
  let mode: StripeMode
  let keys: { secretKey: string; publishableKey: string | null }

  if (explicit === 'live') {
    mode = 'live'
    keys = liveKeys()
  } else if (explicit === 'test') {
    const sandbox = await fetchSandboxKeys()
    if (!sandbox) throw new Error('STRIPE_MODE=test but no Stripe sandbox keys are available (connect the Stripe integration)')
    mode = 'test'
    keys = sandbox
  } else if (isProduction) {
    mode = 'live'
    keys = liveKeys()
  } else {
    const sandbox = await fetchSandboxKeys()
    if (sandbox) {
      mode = 'test'
      keys = sandbox
    } else {
      mode = 'live'
      keys = liveKeys()
    }
  }

  if (mode === 'test' && !keys.secretKey.startsWith('sk_test')) {
    throw new Error('Stripe test mode selected but the sandbox secret key is not a test key')
  }
  resolved = { mode, ...keys, client: new Stripe(keys.secretKey) }
  return mode
}

function current() {
  if (!resolved) throw new Error('Stripe is not initialised — await initStripe() at startup')
  return resolved
}

export function getStripeMode(): StripeMode {
  return current().mode
}
export function getStripePublishableKey(): string | null {
  return current().publishableKey
}

/**
 * Signing secret for the webhook endpoint of the active mode. Test and live
 * endpoints are registered separately in Stripe, so they carry separate
 * secrets: STRIPE_TEST_WEBHOOK_SECRET (sandbox) / STRIPE_WEBHOOK_SECRET (live).
 */
export function getStripeWebhookSecret(): string | null {
  const key = current().mode === 'test' ? 'STRIPE_TEST_WEBHOOK_SECRET' : 'STRIPE_WEBHOOK_SECRET'
  return process.env[key]?.trim() || null
}

/** The Stripe client for the active mode. */
export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    const client = current().client as unknown as Record<PropertyKey, unknown>
    const value = client[prop]
    return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(client) : value
  },
})
