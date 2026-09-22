import { describe, expect, it } from 'vitest'

import { computeBillingDashboard, parseDateRange } from '@/lib/billing/dashboard'

const now = new Date('2026-09-18T12:00:00.000Z')
const d = (s: string) => new Date(s)

function customer(id: string, billingStatus: string, extra: Record<string, unknown> = {}) {
  return {
    id, fullName: `Customer ${id}`, businessName: `${id} LLC`, businessAddress: '', phone: '', ownerName: '', ownerPhone: '',
    email: `${id}@example.com`, stripeCustomerId: `cus_${id}`, billingStatus, participantId: null, billingBlockedAt: null,
    billingIssue: null, createdById: null, createdByName: null, createdAt: d('2026-01-01T00:00:00Z'), updatedAt: now, ...extra,
  } as any
}
function terms(linkId: string, customerId: string, extra: Record<string, unknown> = {}) {
  return {
    linkId, token: linkId, customerId, type: 'subscription', repId: null, repName: null, setupFeeCents: 50000, monthlyCents: 29900,
    stripeCustomerId: `cus_${customerId}`, primaryIntentId: null, secondaryIntentId: null, setupPaidAt: d('2026-08-01T00:00:00Z'),
    stripeSubscriptionId: `sub_${linkId}`, subscriptionStatus: 'active', nextPaymentAt: d('2026-10-01T00:00:00Z'),
    agreementStart: null, agreementEnd: null, completedAt: d('2026-08-01T00:00:00Z'), cancelAt: null, canceledAt: null,
    createdAt: d('2026-08-01T00:00:00Z'), ...extra,
  } as any
}
function card(customerId: string, rank: 'primary' | 'secondary', last4: string, active = true) {
  return {
    id: `card_${customerId}_${rank}`, customerId, linkId: null, stripePaymentMethodId: `pm_${last4}`, fingerprint: last4,
    brand: 'visa', last4, expMonth: 12, expYear: 2030, rank, active, createdAt: now,
  } as any
}
let seq = 0
function history(customerId: string, status: string, amountCents: number, occurredAt: string, extra: Record<string, unknown> = {}) {
  return {
    id: `ph_${++seq}`, customerId, linkId: null, kind: status === 'failed' ? 'invoice_failed' : status === 'refunded' ? 'refund' : 'invoice_paid',
    status, amountCents, currency: 'usd', description: '', failureMessage: null, cardRank: null, cardBrand: null, cardLast4: null,
    stripePaymentMethodId: null, stripeEventId: null, stripeInvoiceId: null, stripePaymentIntentId: null, stripeChargeId: null,
    stripeRefundId: null, stripeSubscriptionId: null, source: 'webhook', actorAdminId: null, actorAdminName: null,
    occurredAt: d(occurredAt), createdAt: d(occurredAt), ...extra,
  } as any
}

const range = { from: d('2026-09-01T00:00:00Z'), to: d('2026-10-01T00:00:00Z') }

describe('parseDateRange', () => {
  it('defaults to the last 30 days and swaps a reversed range', () => {
    const r = parseDateRange({}, now)
    expect(r.fromDay).toBe('2026-08-20')
    expect(r.toDay).toBe('2026-09-18')
    expect(r.to.toISOString()).toBe('2026-09-19T00:00:00.000Z')
    const swapped = parseDateRange({ from: '2026-09-10', to: '2026-09-01' }, now)
    expect(swapped.fromDay).toBe('2026-09-01')
    expect(swapped.toDay).toBe('2026-09-10')
  })
  it('ignores malformed dates', () => {
    expect(parseDateRange({ from: 'nope', to: '2026-13-45' }, now).fromDay).toBe('2026-08-20')
  })
})

describe('computeBillingDashboard', () => {
  it('nets refunds out of cash collected and only counts the selected range', () => {
    const out = computeBillingDashboard({
      customers: [customer('a', 'active')],
      terms: [terms('l1', 'a')],
      cards: [],
      history: [
        history('a', 'succeeded', 50000, '2026-08-15T00:00:00Z'), // outside range
        history('a', 'succeeded', 29900, '2026-09-05T00:00:00Z'),
        history('a', 'refunded', 10000, '2026-09-06T00:00:00Z'),
        history('a', 'info', 0, '2026-09-07T00:00:00Z', { kind: 'billing_date_changed' }),
      ],
      range, now,
    })
    expect(out.metrics.gross_cents).toBe(29900)
    expect(out.metrics.refunded_cents).toBe(10000)
    expect(out.metrics.collected_cents).toBe(19900)
    expect(out.metrics.collected_count).toBe(1)
    expect(out.metrics.refund_count).toBe(1)
    expect(out.customers[0]!.collected_cents).toBe(69900)
  })

  it('computes MRR from live subscriptions only', () => {
    const out = computeBillingDashboard({
      customers: [customer('a', 'active'), customer('b', 'canceled'), customer('c', 'past_due'), customer('d', 'setup_paid')],
      terms: [
        terms('l1', 'a'),
        terms('l2', 'b', { subscriptionStatus: 'canceled', canceledAt: now }),
        terms('l3', 'c', { subscriptionStatus: 'past_due', monthlyCents: 19900 }),
        terms('l4', 'd', { stripeSubscriptionId: null, subscriptionStatus: null, completedAt: null }),
        terms('l5', 'a', { type: 'one_time', monthlyCents: 0, stripeSubscriptionId: null, subscriptionStatus: null }),
      ],
      cards: [], history: [], range, now,
    })
    expect(out.metrics.mrr_cents).toBe(29900 + 19900)
    expect(out.metrics.mrr_subscriptions).toBe(2)
  })

  it('treats an invoice as outstanding until a succeeded row for it exists', () => {
    const out = computeBillingDashboard({
      customers: [customer('a', 'past_due'), customer('b', 'active'), customer('c', 'canceled')],
      terms: [terms('l1', 'a', { subscriptionStatus: 'past_due' }), terms('l2', 'b'), terms('l3', 'c', { subscriptionStatus: 'canceled', canceledAt: now })],
      cards: [],
      history: [
        // a: primary and backup both declined on the same invoice → owed once
        history('a', 'failed', 29900, '2026-09-10T00:00:00Z', { stripeInvoiceId: 'in_a1', failureMessage: 'Card declined' }),
        history('a', 'failed', 29900, '2026-09-10T00:05:00Z', { stripeInvoiceId: 'in_a1', failureMessage: 'Insufficient funds' }),
        // b: primary declined, backup paid → recovered, nothing owed
        history('b', 'failed', 29900, '2026-09-11T00:00:00Z', { stripeInvoiceId: 'in_b1' }),
        history('b', 'succeeded', 29900, '2026-09-11T00:01:00Z', { stripeInvoiceId: 'in_b1' }),
        // c: failed then canceled → invoice voided, not collectable
        history('c', 'failed', 29900, '2026-09-12T00:00:00Z', { stripeInvoiceId: 'in_c1' }),
      ],
      range, now,
    })
    expect(out.metrics.outstanding_cents).toBe(29900)
    expect(out.metrics.outstanding_customers).toBe(1)
    expect(out.metrics.failed_count).toBe(4)
    expect(out.metrics.failed_cents).toBe(4 * 29900)
    expect(out.metrics.failed_customers).toBe(3)
    expect(out.metrics.past_due_customers).toBe(1)
    expect(out.pastDue.map((c) => c.id)).toEqual(['a'])
    expect(out.pastDue[0]!.last_failure_message).toBe('Insufficient funds')
    expect(out.failed.find((f) => f.customer_id === 'b')!.recovered).toBe(true)
    expect(out.failed.find((f) => f.customer_id === 'a')!.recovered).toBe(false)
    // newest first
    expect(out.failed[0]!.customer_id).toBe('c')
  })

  it('lists renewals due in the next 30 days, skipping canceled or scheduled-to-cancel subscriptions', () => {
    const out = computeBillingDashboard({
      customers: [customer('a', 'active'), customer('b', 'active'), customer('c', 'active'), customer('d', 'active'), customer('e', 'active')],
      terms: [
        terms('l1', 'a', { nextPaymentAt: d('2026-09-25T00:00:00Z') }),
        terms('l2', 'b', { nextPaymentAt: d('2026-10-20T00:00:00Z') }), // beyond 30 days
        terms('l3', 'c', { nextPaymentAt: d('2026-09-20T00:00:00Z'), cancelAt: d('2026-09-19T00:00:00Z') }), // cancels first
        terms('l4', 'd', { nextPaymentAt: d('2026-09-22T00:00:00Z'), cancelAt: d('2026-10-22T00:00:00Z') }), // cancels after → still charges
        terms('l5', 'e', { nextPaymentAt: d('2026-09-10T00:00:00Z') }), // in the past
      ],
      cards: [card('a', 'secondary', '4242'), card('a', 'primary', '1111'), card('a', 'primary', '9999', false)],
      history: [], range, now,
    })
    expect(out.upcoming.map((u) => u.customer_id)).toEqual(['d', 'a'])
    expect(out.metrics.upcoming_cents).toBe(2 * 29900)
    expect(out.upcoming[1]!.card).toMatchObject({ rank: 'primary', last4: '1111' })
    expect(out.customers.find((c) => c.id === 'a')!.cards.map((c) => c.last4)).toEqual(['1111', '4242'])
  })

  it('points each customer at their most recent link when none is live', () => {
    const pending = { stripeSubscriptionId: null, subscriptionStatus: null, setupPaidAt: null, completedAt: null, nextPaymentAt: null }
    const out = computeBillingDashboard({
      customers: [customer('a', 'active')],
      terms: [terms('old', 'a', { ...pending, createdAt: d('2026-01-01T00:00:00Z') }), terms('new', 'a', { ...pending, createdAt: d('2026-08-01T00:00:00Z') })],
      cards: [], history: [history('a', 'failed', 100, '2026-09-10T00:00:00Z')], range, now,
    })
    expect(out.customers[0]!.link_id).toBe('new')
    expect(out.failed[0]!.link_id).toBe('new')
  })

  it('keeps a repeat customer on their live subscription when a newer pending or one-time link exists', () => {
    const live = terms('sub', 'a', { createdAt: d('2026-03-01T00:00:00Z'), nextPaymentAt: d('2026-10-01T00:00:00Z') })
    const pendingSub = terms('pending', 'a', {
      createdAt: d('2026-09-15T00:00:00Z'), stripeSubscriptionId: null, subscriptionStatus: null, setupPaidAt: null, completedAt: null, nextPaymentAt: null,
    })
    const oneTime = terms('once', 'a', {
      createdAt: d('2026-09-16T00:00:00Z'), type: 'one_time', monthlyCents: 0, stripeSubscriptionId: null, subscriptionStatus: null, nextPaymentAt: null,
    })
    const out = computeBillingDashboard({
      customers: [customer('a', 'active')], terms: [live, pendingSub, oneTime], cards: [], history: [], range, now,
    })
    const row = out.customers[0]!
    expect(row.link_id).toBe('sub')
    expect(row.plan).toBe('subscription')
    expect(row.subscription_status).toBe('active')
    expect(row.next_payment_at).toBe('2026-10-01T00:00:00.000Z')
    expect(row.monthly_cents).toBe(29900)
  })

  it('prefers a delinquent subscription and sends past-due customers to the link that declined', () => {
    const ended = terms('ended', 'a', { createdAt: d('2025-01-01T00:00:00Z'), subscriptionStatus: 'canceled', canceledAt: d('2026-01-01T00:00:00Z') })
    const pastDue = terms('late', 'a', { createdAt: d('2026-02-01T00:00:00Z'), subscriptionStatus: 'past_due', nextPaymentAt: d('2026-09-20T00:00:00Z') })
    const newer = terms('newer', 'a', {
      createdAt: d('2026-09-10T00:00:00Z'), stripeSubscriptionId: null, subscriptionStatus: null, setupPaidAt: null, completedAt: null,
    })
    const out = computeBillingDashboard({
      customers: [customer('a', 'past_due')], terms: [ended, pastDue, newer], cards: [],
      history: [history('a', 'failed', 29900, '2026-09-10T00:00:00Z', { linkId: 'late', stripeInvoiceId: 'in_1' })], range, now,
    })
    expect(out.customers[0]!.link_id).toBe('late')
    expect(out.customers[0]!.subscription_status).toBe('past_due')
    expect(out.pastDue[0]!.link_id).toBe('late')
    expect(out.pastDue[0]!.outstanding_cents).toBe(29900)
    // The failed-payment row carries its own link, not the newest one.
    expect(out.failed[0]!.link_id).toBe('late')
    // A canceled agreement is only the record when nothing better exists.
    const onlyEnded = computeBillingDashboard({ customers: [customer('a', 'canceled')], terms: [ended], cards: [], history: [], range, now })
    expect(onlyEnded.customers[0]!.link_id).toBe('ended')
  })
})
