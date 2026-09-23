import { describe, expect, it } from 'vitest'
import { applyLeadDisposition, isLeadDue, isParkedLead, reopenParkedLead } from '@workspace/shared/lead-followup'

const now = new Date('2026-09-23T12:00:00Z')
const parked = { status: 'attempted' as const, nextDueAt: null, unansweredAttempts: 3 }

describe('reopening parked leads', () => {
  it('resets attempts and makes the lead immediately due without changing history', () => {
    const lead = { ...parked, lastDisposition: 'voicemail', lastAttemptAt: now }
    const reset = reopenParkedLead(lead, now)
    expect(reset).toEqual({ unansweredAttempts: 0, nextDueAt: now })
    expect(isLeadDue({ ...lead, ...reset }, now)).toBe(true)
    expect(isParkedLead({ ...lead, ...reset })).toBe(false)
    expect(lead).toEqual({ ...parked, lastDisposition: 'voicemail', lastAttemptAt: now })
    const next = applyLeadDisposition({ ...parked, ...reset }, { disposition: 'no_answer', now })
    expect(next.unansweredAttempts).toBe(1)
    expect(next.nextDueAt?.getTime()).toBe(now.getTime() + 4 * 60 * 60 * 1000)
  })

  it('includes leads with more than three missed attempts', () => {
    expect(isParkedLead({ ...parked, unansweredAttempts: 7 })).toBe(true)
  })

  it.each([
    { ...parked, unansweredAttempts: 2 },
    { ...parked, nextDueAt: now },
    ...['new', 'reached', 'booked', 'confirmed', 'closed'].map(status => ({ ...parked, status })),
  ])('does not reopen a non-parked lead: %j', lead => {
    expect(isParkedLead(lead)).toBe(false)
    expect(() => reopenParkedLead(lead, now)).toThrow('no longer parked')
  })
})