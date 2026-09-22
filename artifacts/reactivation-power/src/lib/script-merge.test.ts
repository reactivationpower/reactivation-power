import { describe, expect, it } from 'vitest'
import {
  COMPLAINT_FALLBACK,
  HOME_SERVICES_COMPLAINT_FALLBACK,
  complaintFallbackFor,
  isComplaintFallback,
  spokenComplaint,
  stripComplaintClause,
} from './script-merge'

describe('complaintFallbackFor', () => {
  it('uses the house-call phrasing for home services', () => {
    expect(complaintFallbackFor('home_services')).toBe(
      'what we originally came out for',
    )
    expect(complaintFallbackFor('home_services')).toBe(
      HOME_SERVICES_COMPLAINT_FALLBACK,
    )
  })

  it('keeps the healthcare phrasing for healthcare and unknown sectors', () => {
    expect(complaintFallbackFor('healthcare')).toBe(
      'what you originally came in for',
    )
    expect(complaintFallbackFor(undefined)).toBe(COMPLAINT_FALLBACK)
    expect(complaintFallbackFor(null)).toBe(COMPLAINT_FALLBACK)
  })
})

describe('isComplaintFallback', () => {
  it('recognises both generic phrases', () => {
    expect(isComplaintFallback(COMPLAINT_FALLBACK)).toBe(true)
    expect(isComplaintFallback(HOME_SERVICES_COMPLAINT_FALLBACK)).toBe(true)
  })

  it('treats real complaints and empty values as not-a-fallback', () => {
    expect(isComplaintFallback('the lower back pain')).toBe(false)
    expect(isComplaintFallback('')).toBe(false)
    expect(isComplaintFallback(undefined)).toBe(false)
    expect(isComplaintFallback(null)).toBe(false)
  })
})

describe('spokenComplaint', () => {
  it('lowercases and prepends "the" when there is no lead-in', () => {
    expect(spokenComplaint('Lower Back Pain')).toBe('the lower back pain')
    expect(spokenComplaint('  Sciatica ')).toBe('the sciatica')
  })

  it('keeps an existing article or pronoun', () => {
    expect(spokenComplaint('Their knee pain')).toBe('their knee pain')
    expect(spokenComplaint('a leaking faucet')).toBe('a leaking faucet')
    expect(spokenComplaint('the noisy furnace')).toBe('the noisy furnace')
  })

  it('preserves acronyms', () => {
    expect(spokenComplaint('TMJ')).toBe('the TMJ')
    expect(spokenComplaint('HVAC')).toBe('the HVAC')
  })

  it('returns an empty string for blank input', () => {
    expect(spokenComplaint('   ')).toBe('')
  })
})

describe('stripComplaintClause', () => {
  it('drops an "especially with" clause and its separator', () => {
    expect(
      stripComplaintClause(
        'How have you been feeling, especially with {{complaint_reference}}?',
      ),
    ).toBe('How have you been feeling?')
    expect(
      stripComplaintClause(
        'How is the house holding up — especially with {{ complaint_reference }}?',
      ),
    ).toBe('How is the house holding up?')
  })

  it('leaves bare complaint tokens and unrelated text alone', () => {
    const body = 'Last time we helped with {{complaint_reference}}. Still good?'
    expect(stripComplaintClause(body)).toBe(body)
  })
})
