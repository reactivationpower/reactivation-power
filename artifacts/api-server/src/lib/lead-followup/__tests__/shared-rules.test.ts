import { describe, expect, it } from 'vitest'
import {
  formatPriceLine,
  landingPathFor,
  parseDollarsToCents,
  planLeadImport,
  productForPath,
  timeAgo,
  validateCampaignInput,
} from '@workspace/shared/lead-followup'

/** The domain rules both the form and the server lean on. */

const base = {
  nicheId: 'niche-1',
  name: 'Back Pain Special',
  offerItems: ['Consultation', '', 'Exam'],
  regularPrice: '249',
  offerPrice: '$49.00',
  priceLineStyle: 'normally_now',
  urgencyNote: '  Ends Friday  ',
}

describe('validateCampaignInput', () => {
  it('accepts a full "Normally X, now Y" campaign and normalises it', () => {
    const res = validateCampaignInput(base)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.value).toEqual({
        nicheId: 'niche-1',
        name: 'Back Pain Special',
        offerItems: ['Consultation', 'Exam'],
        regularPriceCents: 24900,
        offerPriceCents: 4900,
        priceLineStyle: 'normally_now',
        urgencyNote: 'Ends Friday',
      })
    }
  })

  it('requires the regular price only for the "Normally X, now Y" style', () => {
    const missing = { ...base, regularPrice: '' }
    const normally = validateCampaignInput(missing)
    expect(normally.ok).toBe(false)
    if (!normally.ok) expect(normally.errors.regularPriceCents).toMatch(/regular price/i)

    const justY = validateCampaignInput({ ...missing, priceLineStyle: 'offer_only' })
    expect(justY.ok).toBe(true)

    const noPrice = validateCampaignInput({ ...missing, offerPrice: '', priceLineStyle: 'no_price' })
    expect(noPrice.ok).toBe(true)
    if (noPrice.ok) expect(noPrice.value.offerPriceCents).toBeNull()
  })

  it('"Just Y" still needs the offer price', () => {
    const res = validateCampaignInput({ ...base, priceLineStyle: 'offer_only', offerPrice: '' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.offerPriceCents).toBeDefined()
  })

  it('rejects an offer price that is not below the regular price for the discount style', () => {
    const res = validateCampaignInput({ ...base, offerPrice: '249' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors.offerPriceCents).toMatch(/lower/)
  })

  it('flags garbage prices, a missing niche, name, style and empty offer', () => {
    const res = validateCampaignInput({ regularPrice: 'abc', offerPrice: '1.234', priceLineStyle: 'nope', offerItems: ['', '  '] })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(Object.keys(res.errors).sort()).toEqual(
        ['name', 'nicheId', 'offerItems', 'offerPriceCents', 'priceLineStyle', 'regularPriceCents'],
      )
    }
  })
})

describe('prices', () => {
  it('parses what an office types', () => {
    expect(parseDollarsToCents('$1,250')).toBe(125000)
    expect(parseDollarsToCents('149.5')).toBe(14950)
    expect(parseDollarsToCents('')).toBeNull()
    expect(parseDollarsToCents('12.345')).toBeNaN()
  })

  it('formats the price line per style and stays quiet when a price is missing', () => {
    expect(formatPriceLine({ priceLineStyle: 'normally_now', regularPriceCents: 24900, offerPriceCents: 4900 })).toBe('Normally $249, now $49')
    expect(formatPriceLine({ priceLineStyle: 'offer_only', regularPriceCents: null, offerPriceCents: 4950 })).toBe('Just $49.50')
    expect(formatPriceLine({ priceLineStyle: 'no_price', regularPriceCents: 24900, offerPriceCents: 4900 })).toBeNull()
    expect(formatPriceLine({ priceLineStyle: 'normally_now', regularPriceCents: null, offerPriceCents: 4900 })).toBeNull()
  })
})

describe('planLeadImport', () => {
  const rows = [
    { firstName: 'Jane', lastName: 'Smith', phone: '(555) 555-0100', email: 'j@x.com', requestedTime: 'Tue 3pm' },
    { name: 'Bob Q. Jones', phone: '1-555-555-0101' },
    { firstName: 'Dup', phone: '555.555.0100' }, // same phone as Jane, later in the file
    { firstName: 'Already', phone: '5555550199' }, // already in this campaign
    { firstName: '', lastName: 'NoFirst', phone: '5555550102' },
    { firstName: 'Short', phone: '123' },
  ]

  it('skips phones already in the campaign or earlier in the file, counts bad rows, splits full names', () => {
    const plan = planLeadImport(rows, ['5555550199'])
    expect(plan.toInsert.map((l) => [l.firstName, l.lastName, l.phoneKey])).toEqual([
      ['Jane', 'Smith', '5555550100'],
      ['Bob Q.', 'Jones', '5555550101'],
    ])
    expect(plan.skippedDuplicate).toBe(2)
    expect(plan.skippedInvalid).toBe(2)
    expect(plan.toInsert[0]).toMatchObject({ email: 'j@x.com', requestedTime: 'Tue 3pm', message: null, submittedAt: null })
  })

  it('dedupe is per campaign: with no existing keys the same person is allowed again', () => {
    const plan = planLeadImport([rows[3]], [])
    expect(plan.toInsert).toHaveLength(1)
    expect(plan.skippedDuplicate).toBe(0)
  })
})

describe('products and paths', () => {
  it('lands accounts with both products on the chooser, single-product accounts in the portal', () => {
    expect(landingPathFor({ reactivation: true, leadFollowUp: true })).toBe('/portal/start')
    expect(landingPathFor({ reactivation: true, leadFollowUp: false })).toBe('/portal')
  })

  it('knows which product a path belongs to', () => {
    expect(productForPath('/portal/campaigns/abc/leads/def')).toBe('lead_followup')
    expect(productForPath('/portal/campaigns')).toBe('lead_followup')
    expect(productForPath('/portal/campaignsx')).toBe('reactivation')
    expect(productForPath('/portal/contacts')).toBe('reactivation')
  })

  it('describes lead age by the hour', () => {
    const now = Date.parse('2026-09-23T12:00:00Z')
    expect(timeAgo('2026-09-23T11:59:30Z', now)).toBe('just now')
    expect(timeAgo('2026-09-23T11:15:00Z', now)).toBe('45 minutes ago')
    expect(timeAgo('2026-09-23T09:00:00Z', now)).toBe('3 hours ago')
    expect(timeAgo('2026-09-21T12:00:00Z', now)).toBe('2 days ago')
  })
})
