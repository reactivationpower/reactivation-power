import express from 'express'
import Stripe from 'stripe'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * Route-level behaviour of POST /api/webhooks/stripe: signature checks,
 * unhandled types, idempotent claims and dispatch. Stripe and the database
 * are replaced with in-memory stand-ins; the dunning handlers are spies.
 */

const SECRET = 'whsec_test_secret'
const offline = new Stripe('sk_test_offline', { apiVersion: '2025-08-27.basil' as Stripe.LatestApiVersion })

vi.mock('@/lib/stripe', () => ({
  stripe: offline,
  getStripeWebhookSecret: () => process.env.__TEST_WEBHOOK_SECRET ?? null,
}))

const seen = new Set<string>()
const statuses = new Map<string, string>()
vi.mock('@workspace/db', () => ({
  stripeEventsTable: { id: 'id', status: 'status', receivedAt: 'received' },
  paymentHistoryTable: { stripeEventId: 'event' },
  paymentLinkTermsTable: { stripeSubscriptionId: 'subscription' },
  db: {
    select: () => ({ from: (table: { id?: string }) => ({ where: () => Object.assign(Promise.resolve([]), {
      limit: async () => table.id === 'id' ? [{ status: [...statuses.values()].includes('processing') ? 'processing' : 'processed' }] : [],
    }) }) }),
    insert: () => ({
      values: (row: { id: string }) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            if (seen.has(row.id)) return []
            seen.add(row.id)
            statuses.set(row.id, 'processing')
            return [{ id: row.id }]
          },
        }),
      }),
    }),
    update: () => ({
      set: (patch: { status: string }) => ({
        where: () => Object.assign((async () => {
          for (const id of seen) if (statuses.get(id) === 'processing') statuses.set(id, patch.status)
        })(), { returning: async () => [] }),
      }),
    }),
    delete: () => ({ where: async () => undefined }),
  },
}))

const handlers = {
  handleInvoicePaid: vi.fn(async () => ({ handled: true })),
  handleInvoicePaymentFailed: vi.fn(async () => ({ handled: true, note: 'paid with secondary card' })),
  handleSubscriptionUpdated: vi.fn(async () => ({ handled: false, note: 'unknown subscription' })),
  handleSubscriptionDeleted: vi.fn(async () => ({ handled: true })),
  handleChargeRefunded: vi.fn(async () => ({ handled: true })),
}
vi.mock('@/lib/billing/dunning', () => handlers)
const affiliateHandlers = {
  processAffiliateDispute: vi.fn(async () => undefined),
  processAffiliateHistory: vi.fn(async () => undefined),
  recordAffiliateEligibility: vi.fn(async () => undefined),
}
vi.mock('@/lib/affiliates/ledger', () => affiliateHandlers)
vi.mock('@/lib/resellers/ledger', () => ({
  processResellerDispute: vi.fn(async () => undefined),
  processResellerRefundedCharge: vi.fn(async () => undefined),
  recordResellerEligibility: vi.fn(async () => undefined),
  queueResellerHistory: vi.fn(async () => undefined),
}))

const { default: router } = await import('@/routes/webhooks-stripe')

let baseUrl = ''
let server: ReturnType<express.Express['listen']>
beforeAll(async () => {
  const app = express()
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        ;(req as unknown as { rawBody?: Buffer }).rawBody = buf
      },
    }),
  )
  app.use('/api', router)
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve())
  })
  const address = server.address()
  baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
})
afterAll(() => server?.close())

function event(id: string, type: string, object: Record<string, unknown> = {}) {
  return JSON.stringify({
    id,
    object: 'event',
    type,
    livemode: false,
    created: Math.floor(Date.now() / 1000),
    data: { object: { id: 'obj_1', object: type.split('.')[0], ...object } },
  })
}

async function post(payload: string, opts: { secret?: string; header?: string } = {}) {
  const header =
    opts.header ?? offline.webhooks.generateTestHeaderString({ payload, secret: opts.secret ?? SECRET })
  const res = await fetch(`${baseUrl}/api/webhooks/stripe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': header },
    body: payload,
  })
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

describe('POST /api/webhooks/stripe', () => {
  it('returns 503 when no signing secret is configured', async () => {
    delete process.env.__TEST_WEBHOOK_SECRET
    const res = await post(event('evt_nosecret', 'invoice.paid'))
    expect(res.status).toBe(503)
  })

  it('rejects a bad or missing signature', async () => {
    process.env.__TEST_WEBHOOK_SECRET = SECRET
    const wrongKey = await post(event('evt_bad', 'invoice.paid'), { secret: 'whsec_other' })
    expect(wrongKey.status).toBe(400)
    const missing = await fetch(`${baseUrl}/api/webhooks/stripe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: event('evt_bad2', 'invoice.paid'),
    })
    expect(missing.status).toBe(400)
    expect(handlers.handleInvoicePaid).not.toHaveBeenCalled()
  })

  it('rejects a payload that was altered after signing', async () => {
    process.env.__TEST_WEBHOOK_SECRET = SECRET
    const payload = event('evt_tamper', 'invoice.paid', { amount_paid: 100 })
    const header = offline.webhooks.generateTestHeaderString({ payload, secret: SECRET })
    const res = await post(payload.replace('100', '999'), { header })
    expect(res.status).toBe(400)
  })

  it('acknowledges event types it does not handle without touching the ledger', async () => {
    process.env.__TEST_WEBHOOK_SECRET = SECRET
    const res = await post(event('evt_other', 'payment_intent.created'))
    expect(res.status).toBe(200)
    expect(res.body.ignored).toBe(true)
    expect(seen.has('evt_other')).toBe(false)
  })

  it('dispatches each handled type and records the outcome', async () => {
    process.env.__TEST_WEBHOOK_SECRET = SECRET
    const paid = await post(event('evt_paid', 'invoice.paid'))
    expect(paid.body).toMatchObject({ received: true, handled: true })
    expect(handlers.handleInvoicePaid).toHaveBeenCalledTimes(1)
    expect(statuses.get('evt_paid')).toBe('processed')

    const failed = await post(event('evt_failed', 'invoice.payment_failed'))
    expect(failed.body.note).toBe('paid with secondary card')
    expect(handlers.handleInvoicePaymentFailed).toHaveBeenCalledTimes(1)

    const updated = await post(event('evt_sub', 'customer.subscription.updated'))
    expect(updated.body.handled).toBe(false)
    expect(statuses.get('evt_sub')).toBe('ignored')

    await post(event('evt_del', 'customer.subscription.deleted'))
    await post(event('evt_ref', 'charge.refunded'))
    expect(handlers.handleSubscriptionDeleted).toHaveBeenCalledTimes(1)
    expect(handlers.handleChargeRefunded).toHaveBeenCalledTimes(1)
    await post(event('evt_dispute', 'charge.dispute.closed', { status: 'won' }))
    expect(affiliateHandlers.processAffiliateDispute).toHaveBeenCalledTimes(1)
  })

  it('is idempotent: a redelivered event id is acknowledged but not re-run', async () => {
    process.env.__TEST_WEBHOOK_SECRET = SECRET
    const calls = handlers.handleInvoicePaid.mock.calls.length
    const res = await post(event('evt_paid', 'invoice.paid'))
    expect(res.status).toBe(200)
    expect(res.body.duplicate).toBe(true)
    expect(handlers.handleInvoicePaid).toHaveBeenCalledTimes(calls)
  })
  it('asks Stripe to retry an unfinished receipt instead of permanently acknowledging lost work', async () => {
    seen.add('evt_busy'); statuses.set('evt_busy', 'processing')
    const response = await post(event('evt_busy', 'invoice.paid'))
    expect(response.status).toBe(503)
    statuses.set('evt_busy', 'processed')
  })
})
