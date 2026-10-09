import { describe, expect, it } from 'vitest'
import { CALENDAR_AGREEMENT_BODY, DEFAULT_ONE_TIME_AGREEMENT_BODY, mergeValues, renderDocument } from '../template'

const customer = {
  fullName: 'Test Signer', businessName: 'Test Office', businessAddress: 'Test Address',
  phone: '000-000-0000', ownerName: 'Test Signer', ownerPhone: '000-000-0000',
  email: 'fixture@example.test',
} as any

describe('offer-specific enrollment agreement text', () => {
  it('merges negotiated full-payment price without a recurring obligation', () => {
    const doc = renderDocument(DEFAULT_ONE_TIME_AGREEMENT_BODY, {
      customer, offerType: 'one_time', termMonths: 0, monthlyCents: 0,
      setupFeeCents: 490000, noticeDays: 0,
    })
    const body = doc.sections.flatMap(s => s.paragraphs).join(' ')
    expect(doc.title).toContain('Full-Payment')
    expect(body).toContain('$4,900.00')
    expect(body).not.toContain('$6,500')
    expect(body).not.toContain('recurring monthly fee of')
    expect(body).not.toContain('month-to-month renewal')
    expect(body).toContain('without waiving any right')
  })

  it('shows the agreed setup and monthly numbers and calendar-month timing', () => {
    const doc = renderDocument(CALENDAR_AGREEMENT_BODY, {
      customer, offerType: 'subscription', termMonths: 12, monthlyCents: 33000,
      setupFeeCents: 49900, noticeDays: 0, billingAnchor: 'calendar_month',
      asOf: new Date('2026-09-18T12:00:00Z'),
    })
    const body = doc.sections.flatMap(s => s.paragraphs).join(' ')
    expect(body).toContain('$330.00')
    expect(body).toContain('$499.00')
    expect(body).toContain('initial setup payment covers the first month')
    expect(body).toContain('October 18, 2026')
  })

  it('expressly shows a waived setup payment as zero rather than the purchase price', () => {
    const fields = mergeValues({ customer, termMonths: 12, monthlyCents: 33000,
      setupFeeCents: 0, noticeDays: 0, billingAnchor: 'calendar_month' })
    expect(fields.setup_fee).toBe('$0.00 (waived)')
    expect(fields.monthly_amount).toBe('$330.00')
  })
})
