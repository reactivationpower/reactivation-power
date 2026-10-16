import { describe, expect, it } from 'vitest'

import {
  billingStatusAfterPayment,
  cardToRetry,
  isAccessBlocked,
  reconcileAccess,
  subscriptionNextPaymentAt,
  validateBillingDate,
  validateRefundAmount,
} from '@/lib/billing/rules'

const primary = { rank: 'primary' as const, stripePaymentMethodId: 'pm_primary' }
const secondary = { rank: 'secondary' as const, stripePaymentMethodId: 'pm_secondary' }

describe('cardToRetry — one attempt per card per invoice', () => {
  it('retries the secondary after the primary declines', () => {
    expect(cardToRetry([primary, secondary], ['pm_primary'])).toBe(secondary)
  })
  it('never goes back to the primary once the secondary has declined', () => {
    expect(cardToRetry([primary, secondary], ['pm_primary', 'pm_secondary'])).toBeNull()
    expect(cardToRetry([primary, secondary], ['pm_secondary'])).toBeNull()
  })
  it('treats an unknown or missing failed card as the primary having been tried', () => {
    expect(cardToRetry([primary, secondary], [])).toBe(secondary)
    expect(cardToRetry([primary, secondary], [null, ''])).toBe(secondary)
    expect(cardToRetry([primary, secondary], ['pm_other'])).toBe(secondary)
    expect(cardToRetry([primary, secondary], ['pm_other', 'pm_secondary'])).toBeNull()
  })
  it('gives up when there is no other card', () => {
    expect(cardToRetry([primary], ['pm_primary'])).toBeNull()
    expect(cardToRetry([], ['pm_primary'])).toBeNull()
    expect(cardToRetry([primary], [])).toBeNull()
  })
  it('terminates for the webhook sequence produced by our own retries', () => {
    // Each failed attempt makes Stripe emit another invoice.payment_failed;
    // simulate the handler feeding every decline back in.
    const declined: string[] = ['pm_primary']
    let attempts = 0
    for (;;) {
      const next = cardToRetry([primary, secondary], declined)
      if (!next) break
      attempts += 1
      declined.push(next.stripePaymentMethodId) // the retry declines too
      if (attempts > 5) throw new Error('retry loop did not terminate')
    }
    expect(attempts).toBe(1)
    expect(declined).toEqual(['pm_primary', 'pm_secondary'])
  })
})

describe('reconcileAccess — subscription events against fresh Stripe state', () => {
  it('does not re-lock a customer whose invoice the backup card already paid (stale past_due event)', () => {
    // The event said past_due, but the live subscription is active and nothing is open.
    expect(reconcileAccess({ subscriptionStatus: 'active', openInvoices: 0, billingStatus: 'active' })).toBe('none')
  })
  it('blocks only when Stripe still reports past_due and an invoice is open', () => {
    expect(reconcileAccess({ subscriptionStatus: 'past_due', openInvoices: 1, billingStatus: 'active' })).toBe('block')
    expect(reconcileAccess({ subscriptionStatus: 'past_due', openInvoices: 0, billingStatus: 'active' })).toBe('none')
    expect(reconcileAccess({ subscriptionStatus: 'unpaid', openInvoices: 1, billingStatus: 'past_due' })).toBe('none')
  })
  it('restores a blocked customer once nothing is owed', () => {
    expect(reconcileAccess({ subscriptionStatus: 'active', openInvoices: 0, billingStatus: 'past_due' })).toBe('restore')
    expect(reconcileAccess({ subscriptionStatus: 'trialing', openInvoices: 0, billingStatus: 'none' })).toBe('restore')
    expect(reconcileAccess({ subscriptionStatus: 'active', openInvoices: 1, billingStatus: 'past_due' })).toBe('none')
  })
  it('ignores statuses it does not own', () => {
    expect(reconcileAccess({ subscriptionStatus: 'canceled', openInvoices: 0, billingStatus: 'active' })).toBe('none')
    expect(reconcileAccess({ subscriptionStatus: 'incomplete', openInvoices: 1, billingStatus: 'active' })).toBe('none')
  })
})

describe('access gate', () => {
  it('blocks past_due and canceled only', () => {
    expect(isAccessBlocked('past_due')).toBe(true)
    expect(isAccessBlocked('canceled')).toBe(true)
    for (const s of ['none', 'setup_paid', 'trialing', 'active', 'paid']) expect(isAccessBlocked(s)).toBe(false)
  })
  it('restores to trialing or active from the subscription status', () => {
    expect(billingStatusAfterPayment('trialing')).toBe('trialing')
    expect(billingStatusAfterPayment('active')).toBe('active')
    expect(billingStatusAfterPayment('past_due')).toBe('active')
    expect(billingStatusAfterPayment(null)).toBe('active')
  })
})

describe('subscriptionNextPaymentAt', () => {
  const item = (end: number) => ({ items: { data: [{ current_period_end: end }] } })
  it('uses trial_end while trialing', () => {
    expect(subscriptionNextPaymentAt({ status: 'trialing', trial_end: 1_800_000_000, ...item(1_700_000_000) })).toEqual(
      new Date(1_800_000_000 * 1000),
    )
  })
  it('uses the period end otherwise and null once canceled', () => {
    expect(subscriptionNextPaymentAt({ status: 'active', trial_end: null, ...item(1_700_000_000) })).toEqual(
      new Date(1_700_000_000 * 1000),
    )
    expect(subscriptionNextPaymentAt({ status: 'canceled', trial_end: null, ...item(1_700_000_000) })).toBeNull()
  })
})

describe('admin action validation', () => {
  const now = new Date('2026-09-18T12:00:00Z')
  it('requires a future billing date within a year', () => {
    expect(validateBillingDate(new Date('2026-09-18T12:30:00Z'), now)).toMatch(/hour/)
    expect(validateBillingDate(new Date('2026-09-01T00:00:00Z'), now)).toMatch(/hour/)
    expect(validateBillingDate(new Date('2027-10-01T00:00:00Z'), now)).toMatch(/year/)
    expect(validateBillingDate(new Date('2026-10-18T12:00:00Z'), now)).toBeNull()
    expect(validateBillingDate(new Date('nope'), now)).toMatch(/valid/)
  })
  it('caps refunds at the refundable remainder', () => {
    expect(validateRefundAmount(null, 5000)).toBeNull()
    expect(validateRefundAmount(2500, 5000)).toBeNull()
    expect(validateRefundAmount(5001, 5000)).toMatch(/at most 50.00/)
    expect(validateRefundAmount(0, 5000)).toMatch(/greater/)
    expect(validateRefundAmount(12.5, 5000)).toMatch(/greater/)
    expect(validateRefundAmount(null, 0)).toMatch(/already/)
  })
})
