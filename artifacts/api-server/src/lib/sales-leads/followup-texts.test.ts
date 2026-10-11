import { describe, expect, it } from 'vitest'
import { DEFAULT_FOLLOWUP_TEXTS } from '@workspace/db/schema'
import { assignTextNumbers, followupTexts, renderFollowupText, validateFollowupTexts } from './followup-texts'
import { cadence } from './cadence'

describe('follow-up texts', () => {
  it('ships six different texts, each with opt-out language', () => {
    expect(DEFAULT_FOLLOWUP_TEXTS).toHaveLength(6)
    expect(new Set(DEFAULT_FOLLOWUP_TEXTS).size).toBe(6)
    for (const t of DEFAULT_FOLLOWUP_TEXTS) expect(t).toContain('STOP')
  })

  it('numbers SMS touches in order and always ends on the last text', () => {
    const full = assignTextNumbers([{ kind: 'call_task' }, { kind: 'sms' }, { kind: 'sms' }, { kind: 'call_task' }, { kind: 'sms' }, { kind: 'sms' }, { kind: 'sms' }, { kind: 'sms' }])
    expect(full.filter(s => s.kind === 'sms').map(s => s.textNumber)).toEqual([1, 2, 3, 4, 5, 6])
    expect(full[0]).not.toHaveProperty('textNumber')
    const short = assignTextNumbers([{ kind: 'sms' }, { kind: 'sms' }, { kind: 'sms' }])
    expect(short.map(s => s.textNumber)).toEqual([1, 2, 6])
  })

  it('gives a real cadence six texts with the final one last', () => {
    const slots = assignTextNumbers(cadence(new Date('2026-10-12T14:00:00Z'), 'America/New_York', 'lead-1'))
    const numbers = slots.filter(s => s.kind === 'sms').map(s => s.textNumber)
    expect(numbers.at(-1)).toBe(6)
    expect(numbers).toEqual([...numbers].sort((a, b) => a! - b!))
  })

  it('fills in the lead name and practice, with safe fallbacks', () => {
    expect(renderFollowupText(DEFAULT_FOLLOWUP_TEXTS, 2, { first_name: 'Shannon', practice_name: 'Smile Co' }))
      .toBe("Hi Shannon, quick question: when someone fills out a form on your website, how fast does someone at Smile Co call them back? Reply with your best guess. Text STOP to opt out.")
    expect(renderFollowupText(DEFAULT_FOLLOWUP_TEXTS, 4, { first_name: 'Sam', practice_name: '' })).toContain('hiding at your practice.')
    expect(renderFollowupText(DEFAULT_FOLLOWUP_TEXTS, undefined, { first_name: 'Sam' })).toBe(renderFollowupText(DEFAULT_FOLLOWUP_TEXTS, 1, { first_name: 'Sam' }))
  })

  it('falls back to the defaults for a malformed saved value and validates edits', () => {
    expect(followupTexts({ followup_texts: ['only one'] })).toBe(DEFAULT_FOLLOWUP_TEXTS)
    expect(() => validateFollowupTexts(DEFAULT_FOLLOWUP_TEXTS.slice(0, 5))).toThrow(/all 6/)
    expect(() => validateFollowupTexts([...DEFAULT_FOLLOWUP_TEXTS.slice(0, 5), 'Hi {firstName}, no opt out here at all'])).toThrow(/Text 6/)
    expect(validateFollowupTexts(DEFAULT_FOLLOWUP_TEXTS)).toEqual(DEFAULT_FOLLOWUP_TEXTS)
  })
})
