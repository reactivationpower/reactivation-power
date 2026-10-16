import { describe, expect, it } from 'vitest'

import { commissionFor, isCommissionable, saleTypeFor } from '@/lib/billing/commission-rules'

describe('commissionFor', () => {
  it('applies a percentage rate to cents', () => {
    expect(commissionFor(100_000, 10)).toBe(10_000)
    expect(commissionFor(49_700, 12.5)).toBe(6_213) // 6212.5 rounds up
  })
  it('mirrors the sale for a refund of the same amount', () => {
    expect(commissionFor(-49_700, 12.5)).toBe(-6_213)
    expect(commissionFor(49_700, 12.5) + commissionFor(-49_700, 12.5)).toBe(0)
  })
  it('is zero at a zero rate or zero amount', () => {
    expect(commissionFor(100_000, 0)).toBe(0)
    expect(commissionFor(0, 20)).toBe(0)
  })
})

describe('isCommissionable', () => {
  it('accepts collected payments and refunds only', () => {
    expect(isCommissionable({ kind: 'invoice_paid', status: 'succeeded' })).toBe(true)
    expect(isCommissionable({ kind: 'refund', status: 'refunded' })).toBe(true)
    expect(isCommissionable({ kind: 'invoice_failed', status: 'failed' })).toBe(false)
    expect(isCommissionable({ kind: 'subscription_canceled', status: 'info' })).toBe(false)
    expect(isCommissionable({ kind: 'cancellation_scheduled', status: 'info' })).toBe(false)
  })
})

describe('saleTypeFor', () => {
  it('treats one-time links (and links without terms) as full price', () => {
    expect(saleTypeFor({ stripeInvoiceId: null }, { type: 'one_time' })).toBe('full_price')
    expect(saleTypeFor({ stripeInvoiceId: 'in_1' }, { type: 'one_time' })).toBe('full_price')
    expect(saleTypeFor({ stripeInvoiceId: null }, null)).toBe('full_price')
  })
  it('splits subscription links into setup fee and monthly by invoice presence', () => {
    expect(saleTypeFor({ stripeInvoiceId: null }, { type: 'subscription' })).toBe('setup_fee')
    expect(saleTypeFor({ stripeInvoiceId: 'in_1' }, { type: 'subscription' })).toBe('monthly')
  })
})
