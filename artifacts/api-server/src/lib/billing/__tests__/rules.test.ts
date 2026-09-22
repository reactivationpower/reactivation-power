import { describe, expect, it } from 'vitest'

import {
  agreementWindow,
  remainingObligation,
  canDeleteLink,
  cleanCustomer,
  isSameCard,
  stageOf,
} from '@/lib/billing/rules'

const fresh = { setupPaidAt: null, completedAt: null }
const setupPaid = { setupPaidAt: new Date('2026-09-18T18:00:00Z'), completedAt: null }
const done = { setupPaidAt: new Date('2026-09-18T18:00:00Z'), completedAt: new Date('2026-09-18T18:05:00Z') }

describe('checkout state machine', () => {
  it('walks primary → secondary → done', () => {
    expect(stageOf(fresh)).toBe('primary')
    expect(stageOf(setupPaid)).toBe('secondary')
    expect(stageOf(done)).toBe('done')
  })

  it('treats a completed link as done even if setupPaidAt was never written', () => {
    expect(stageOf({ setupPaidAt: null, completedAt: new Date() })).toBe('done')
  })
})

describe('link deletion guard', () => {
  it('allows deleting one-time links and untouched subscription links', () => {
    expect(canDeleteLink(null)).toBe(true)
    expect(canDeleteLink(undefined)).toBe(true)
    expect(canDeleteLink(fresh)).toBe(true)
  })

  it('refuses once the setup fee has been charged, even before the backup card is added', () => {
    expect(canDeleteLink(setupPaid)).toBe(false)
    expect(canDeleteLink(done)).toBe(false)
  })
})

describe('duplicate card detection', () => {
  const primary = { stripePaymentMethodId: 'pm_primary', fingerprint: 'fp_visa_4242' }

  it('rejects the same payment method id', () => {
    expect(isSameCard(primary, { stripePaymentMethodId: 'pm_primary', fingerprint: null })).toBe(true)
  })

  it('rejects a different payment method with the same fingerprint (same physical card re-entered)', () => {
    expect(isSameCard(primary, { stripePaymentMethodId: 'pm_other', fingerprint: 'fp_visa_4242' })).toBe(true)
  })

  it('accepts a different card', () => {
    expect(isSameCard(primary, { stripePaymentMethodId: 'pm_other', fingerprint: 'fp_mc_4444' })).toBe(false)
  })

  it('does not treat two missing fingerprints as equal', () => {
    expect(
      isSameCard({ stripePaymentMethodId: 'pm_a', fingerprint: null }, { stripePaymentMethodId: 'pm_b', fingerprint: null }),
    ).toBe(false)
  })
})

describe('agreement window', () => {
  it('starts 30 days after the setup fee and ends 12 months later', () => {
    const { agreementStart, agreementEnd } = agreementWindow(new Date('2026-09-18T18:27:51Z'))
    expect(agreementStart.toISOString()).toBe('2026-10-18T18:27:51.000Z')
    expect(agreementEnd.toISOString()).toBe('2027-10-18T18:27:51.000Z')
  })

  it('rolls the year over correctly across December', () => {
    const { agreementStart, agreementEnd } = agreementWindow(new Date('2026-12-15T00:00:00Z'))
    expect(agreementStart.toISOString()).toBe('2027-01-14T00:00:00.000Z')
    expect(agreementEnd.toISOString()).toBe('2028-01-14T00:00:00.000Z')
  })
})

describe('customer validation', () => {
  const valid = {
    fullName: 'Dr. Jane Smith',
    businessName: 'Smith Family Dental',
    businessAddress: '123 Main St, Austin, TX',
    phone: '(555) 555-1234',
    ownerName: 'Jane Smith',
    ownerPhone: '(555) 555-9876',
    email: 'Jane@Practice.com ',
  }

  it('accepts a complete record and normalises the email', () => {
    const res = cleanCustomer(valid)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.value.email).toBe('jane@practice.com')
  })

  it.each([
    ['fullName', 'Full name is required.'],
    ['businessName', 'Business name is required.'],
    ['businessAddress', 'Business address is required.'],
    ['phone', 'Business phone is required.'],
    ['ownerName', 'Owner name is required.'],
    ['ownerPhone', 'Owner phone is required.'],
  ] as const)('requires %s', (field, message) => {
    const res = cleanCustomer({ ...valid, [field]: '   ' })
    expect(res).toEqual({ ok: false, error: message })
  })

  it('rejects a malformed email', () => {
    expect(cleanCustomer({ ...valid, email: 'not-an-email' })).toEqual({ ok: false, error: 'A valid email is required.' })
  })

  it('tolerates a missing body', () => {
    expect(cleanCustomer(undefined).ok).toBe(false)
  })
})

describe('remainingObligation', () => {
  const start = new Date('2026-03-01T12:00:00Z')
  const end = new Date('2027-03-01T12:00:00Z')

  it('counts every monthly charge before the agreement end', () => {
    const r = remainingObligation({ nextPaymentAt: new Date('2026-10-01T12:00:00Z'), agreementEnd: end, monthlyCents: 49700, now: new Date('2026-09-18T00:00:00Z') })
    expect(r.payments).toBe(5) // Oct, Nov, Dec, Jan, Feb — March 1 is the end itself
    expect(r.totalCents).toBe(5 * 49700)
    expect(r.dates[0].toISOString()).toBe('2026-10-01T12:00:00.000Z')
    expect(r.dates[4].toISOString()).toBe('2027-02-01T12:00:00.000Z')
  })

  it('a brand-new agreement owes all twelve payments', () => {
    const r = remainingObligation({ nextPaymentAt: start, agreementEnd: end, monthlyCents: 100, now: new Date('2026-02-15T00:00:00Z') })
    expect(r.payments).toBe(12)
  })

  it('owes nothing once the term is over or nothing is scheduled', () => {
    expect(remainingObligation({ nextPaymentAt: start, agreementEnd: end, monthlyCents: 100, now: new Date('2027-04-01T00:00:00Z') }).payments).toBe(0)
    expect(remainingObligation({ nextPaymentAt: null, agreementEnd: end, monthlyCents: 100 }).payments).toBe(0)
    expect(remainingObligation({ nextPaymentAt: start, agreementEnd: null, monthlyCents: 100 }).payments).toBe(0)
  })

  it('is not capped: a 60-month agreement owes every remaining installment', () => {
    const r = remainingObligation({ nextPaymentAt: start, agreementEnd: new Date('2031-03-01T12:00:00Z'), monthlyCents: 100, now: new Date('2026-02-15T00:00:00Z') })
    expect(r.payments).toBe(60)
    expect(r.totalCents).toBe(6000)
    const late = remainingObligation({ nextPaymentAt: new Date('2029-01-01T12:00:00Z'), agreementEnd: new Date('2031-03-01T12:00:00Z'), monthlyCents: 100, now: new Date('2028-12-15T00:00:00Z') })
    expect(late.payments).toBe(26)
  })

  it('keeps a month-end anchor without drifting to the 28th for good', () => {
    const r = remainingObligation({ nextPaymentAt: new Date('2027-01-31T12:00:00Z'), agreementEnd: new Date('2027-05-31T12:00:00Z'), monthlyCents: 100, now: new Date('2027-01-15T00:00:00Z') })
    expect(r.dates.map((d) => d.toISOString().slice(0, 10))).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30'])
    expect(r.payments).toBe(4)
  })

  it('handles short and one-month terms', () => {
    const r = remainingObligation({ nextPaymentAt: start, agreementEnd: new Date('2026-04-01T12:00:00Z'), monthlyCents: 100, now: new Date('2026-02-15T00:00:00Z') })
    expect(r.payments).toBe(1)
  })
})
