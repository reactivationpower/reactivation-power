import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  campaignPriceSentence,
  campaignTokens,
  formatSubmittedDate,
  spokenAgo,
  spokenList,
} from '@workspace/shared/campaign-tokens'
import { mergeScript } from '@workspace/shared/script-merge'

/** What the lead script reads from the campaign, and how it copes with blanks. */

const NOW = new Date('2026-09-23T15:00:00Z')

const campaign = {
  name: 'New Patient Special',
  offerItems: ['Consultation', 'Exam', ' X-rays if needed '],
  regularPriceCents: 37900,
  offerPriceCents: 3700,
  priceLineStyle: 'normally_now',
  urgencyNote: 'Only 20 spots this month.',
}

describe('campaignPriceSentence', () => {
  it('reads "normally / now" with both prices', () => {
    expect(campaignPriceSentence(campaign)).toBe('Normally $379, but through this campaign it\u2019s $37.')
  })
  it('reads the offer price only', () => {
    expect(campaignPriceSentence({ ...campaign, priceLineStyle: 'offer_only' })).toBe('It\u2019s just $37.')
  })
  it('says nothing for no_price', () => {
    expect(campaignPriceSentence({ ...campaign, priceLineStyle: 'no_price' })).toBe('')
  })
  it('says nothing rather than "Normally $0" when a price is missing', () => {
    expect(campaignPriceSentence({ ...campaign, regularPriceCents: null })).toBe('')
    expect(campaignPriceSentence({ ...campaign, offerPriceCents: null })).toBe('')
    expect(campaignPriceSentence({ ...campaign, priceLineStyle: 'offer_only', offerPriceCents: null })).toBe('')
  })
})

describe('campaignTokens', () => {
  it('fills every key from the campaign and the lead', () => {
    const t = campaignTokens(campaign, { submittedAt: '2026-09-22T18:00:00Z' }, NOW)
    expect(t.offer_name).toBe('New Patient Special')
    expect(t.offer_items).toBe('\u2022 Consultation\n\u2022 Exam\n\u2022 X-rays if needed')
    expect(t.offer_items_spoken).toBe('Consultation, Exam and X-rays if needed')
    expect(t.regular_price).toBe('$379')
    expect(t.offer_price).toBe('$37')
    expect(t.price_line).toBe('Normally $379, but through this campaign it\u2019s $37.')
    expect(t.urgency_note).toBe('Only 20 spots this month.')
    expect(t.submitted_ago).toBe('yesterday')
    expect(t.submitted_date).toMatch(/September 22/)
  })
  it('does not make up a submission date when an uploaded file had none', () => {
    const t = campaignTokens(campaign, { submittedAt: null }, NOW)
    expect(t.submitted_date).toBe('')
    expect(t.submitted_ago).toBe('')
  })
  it('renders the real opening with natural timing, including unknown dates', () => {
    const flow = JSON.parse(readFileSync('content/flows/general.lead.json', 'utf8')) as {
      steps: Array<{ step_key: string; content: string }>
    }
    const opening = flow.steps.find(step => step.step_key === 'open')!.content
    const render = (ago: string) => opening.replace('{{submitted_ago}}', ago).replace(/\s+/g, ' ')
    expect(render(spokenAgo(new Date('2026-09-23T13:00:00Z'), NOW))).toContain('You reached out earlier today about')
    expect(render('')).toContain('You reached out about')
    expect(render('earlier today')).not.toContain('earlier today ago')
  })

  it('never leaves a raw bracket when the campaign is sparse', () => {
    const t = campaignTokens(
      { name: '  ', offerItems: [], regularPriceCents: null, offerPriceCents: null, priceLineStyle: 'no_price', urgencyNote: null },
      null,
      NOW,
    )
    for (const [key, value] of Object.entries(t)) {
      expect(typeof value, key).toBe('string')
      expect(value, key).not.toMatch(/[[\]{}]/)
    }
    expect(t.offer_name).toBe('special offer')
    expect(t.submitted_ago).toBe('recently')
    const merged = mergeScript(
      'You reached out {{submitted_ago}} about our {{offer_name}}.\n\n{{price_line}}\n\n{{urgency_note}}\n\n{{offer_items}}',
      [],
      t,
    )
    expect(merged).not.toMatch(/\[[A-Z ]+\]/)
    expect(merged.startsWith('You reached out recently about our special offer.')).toBe(true)
  })
})

describe('spoken helpers', () => {
  it('lists one, two and many items', () => {
    expect(spokenList([])).toBe('')
    expect(spokenList(['Exam'])).toBe('Exam')
    expect(spokenList(['Exam', 'X-rays'])).toBe('Exam and X-rays')
  })
  it('turns a timestamp into how a caller would say it', () => {
    const at = (h: number) => new Date(NOW.getTime() - h * 3_600_000)
    expect(spokenAgo(NOW, NOW)).toBe('earlier today')
    expect(spokenAgo(at(30), NOW)).toBe('yesterday')
    expect(spokenAgo(at(24 * 4), NOW)).toBe('a few days ago')
    expect(spokenAgo(at(24 * 10), NOW)).toBe('last week')
    expect(spokenAgo(at(24 * 14), NOW)).toBe('about two weeks ago')
    expect(spokenAgo(at(24 * 40), NOW)).toBe('a few weeks ago')
    expect(spokenAgo(at(24 * 65), NOW)).toBe('a couple of months ago')
    expect(spokenAgo('not a date', NOW)).toBe('')
    // The office calendar, not UTC, decides whether a late-evening lead
    // submitted today or yesterday.
    expect(spokenAgo('2026-09-23T03:30:00Z', new Date('2026-09-23T14:00:00Z'))).toBe('yesterday')
  })
  it('drops the year for the current year only', () => {
    expect(formatSubmittedDate('2026-03-04T12:00:00Z', NOW)).not.toMatch(/2026/)
    expect(formatSubmittedDate('2025-03-04T12:00:00Z', NOW)).toMatch(/2025/)
    expect(formatSubmittedDate(null, NOW)).toBe('')
  })
})
