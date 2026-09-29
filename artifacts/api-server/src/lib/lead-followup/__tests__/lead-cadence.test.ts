import { describe, expect, it } from 'vitest'
import {
  LEAD_DISPOSITIONS,
  applyLeadDisposition,
  campaignConversion,
  formatRate,
  isLeadDisposition,
  isLeadDue,
  isLongTermLeadCheckIn,
  leadCallBlockReason,
  leadQueueBlockReason,
  leadDispositionFieldError,
  nextLeadAttemptAt,
  nextConfirmationAttemptAt,
} from '@workspace/shared/lead-followup'

/** The lead retry cadence and the per-campaign conversion math. */

const NOW = new Date('2026-09-23T15:00:00Z')

describe('nextLeadAttemptAt', () => {
  const submitted = new Date('2026-09-23T13:00:00Z') // 9 AM Eastern
  it('schedules three on day one, days 2, 3, 5, 7, 10, 14, then every two months', () => {
    const expected = [
      '2026-09-23T17:00:00.000Z', '2026-09-23T21:00:00.000Z',
      '2026-09-24T14:00:00.000Z', '2026-09-25T19:00:00.000Z',
      '2026-09-27T14:00:00.000Z', '2026-09-29T19:00:00.000Z',
      '2026-10-02T14:00:00.000Z', '2026-10-06T19:00:00.000Z',
      '2026-11-23T15:00:00.000Z', '2027-01-23T20:00:00.000Z',
    ]
    let attempt = submitted
    expected.forEach((time, index) => {
      const due = nextLeadAttemptAt(index + 1, attempt, submitted)
      expect(due.toISOString()).toBe(time)
      attempt = due
    })
  })
  it('skips expired slots instead of creating a catch-up burst', () => {
    expect(nextLeadAttemptAt(1, new Date('2026-09-28T15:00:00Z'), submitted).toISOString()).toBe('2026-09-29T19:00:00.000Z')
  })
  it('uses the rolling first 24 hours for a lead submitted after office hours', () => {
    const evening = new Date('2026-09-23T23:00:00Z') // 7pm Eastern
    const morning = new Date('2026-09-24T13:00:00Z') // first office call at 9am
    expect(nextLeadAttemptAt(1, morning, evening).toISOString()).toBe('2026-09-24T17:00:00.000Z')
    expect(nextLeadAttemptAt(2, new Date('2026-09-24T17:00:00Z'), evening).toISOString()).toBe('2026-09-24T21:00:00.000Z')
    // Day-two cannot add another call to that same date; the next
    // available named slot is day three.
    expect(nextLeadAttemptAt(3, new Date('2026-09-24T21:00:00Z'), evening).toISOString()).toBe('2026-09-25T19:00:00.000Z')
  })
  it('keeps the second first-day opportunity across midnight without duplicating day two', () => {
    const ten = new Date('2026-09-23T14:00:00Z') // 10am Eastern
    const first = new Date('2026-09-23T18:00:00Z')
    expect(nextLeadAttemptAt(1, ten, ten).toISOString()).toBe('2026-09-23T18:00:00.000Z')
    expect(nextLeadAttemptAt(2, first, ten).toISOString()).toBe('2026-09-24T13:00:00.000Z')
    expect(nextLeadAttemptAt(2, new Date('2026-09-24T13:00:00Z'), ten).toISOString()).toBe('2026-09-24T16:00:00.000Z')
  })
  it('bounds appointment confirmation to before the requested time', () => {
    expect(nextConfirmationAttemptAt(NOW, '2026-09-24T09:00')?.toISOString()).toBe('2026-09-23T19:00:00.000Z')
    expect(nextConfirmationAttemptAt(NOW, '2026-09-23T12:00')).toBeNull()
  })
  it('switches to the check-in script on the same two-month calendar date', () => {
    expect(isLongTermLeadCheckIn(submitted, new Date('2026-11-23T14:59:00Z'))).toBe(false)
    expect(isLongTermLeadCheckIn(submitted, new Date('2026-11-23T15:00:00Z'))).toBe(true)
  })
})

describe('applyLeadDisposition', () => {
  const fresh = { status: 'new' as const, unansweredAttempts: 0 }

  it('keeps an unanswered lead scheduled beyond week two', () => {
    const submittedAt = new Date('2026-09-23T13:00:00Z')
    let state = applyLeadDisposition({ ...fresh, submittedAt }, { disposition: 'no_answer', now: submittedAt })
    expect(state.status).toBe('attempted')
    expect(state.unansweredAttempts).toBe(1)
    for (let i = 2; i <= 10; i++) {
      const at = state.nextDueAt!
      state = applyLeadDisposition({ ...state, submittedAt }, { disposition: 'voicemail', now: at })
      expect(state.unansweredAttempts).toBe(i)
      expect(state.nextDueAt?.getTime()).toBeGreaterThan(at.getTime())
    }
    expect(state.status).toBe('attempted')
    expect(state.lastDisposition).toBe('voicemail')
  })

  it('never demotes a reached lead back to attempted on a missed retry', () => {
    const reached = { status: 'reached' as const, unansweredAttempts: 0 }
    const state = applyLeadDisposition(reached, { disposition: 'no_answer', now: NOW })
    expect(state.status).toBe('reached')
    expect(state.unansweredAttempts).toBe(1)
  })

  it('resets the unanswered count once someone actually speaks with them', () => {
    const tried = { status: 'attempted' as const, unansweredAttempts: 2 }
    const state = applyLeadDisposition(tried, { disposition: 'spoke_did_not_book', now: NOW })
    expect(state).toMatchObject({ status: 'reached', unansweredAttempts: 0, nextDueAt: null, bookedAt: null })
  })

  it('puts a callback on the list at the requested time', () => {
    const at = new Date('2026-09-24T18:30:00Z')
    const state = applyLeadDisposition(fresh, { disposition: 'callback_later', now: NOW, callBackAt: at })
    expect(state.status).toBe('reached')
    expect(state.nextDueAt).toEqual(at)
  })

  it('records the appointment on booked and takes the lead off the list', () => {
    const at = new Date('2026-09-25T14:00:00Z')
    const state = applyLeadDisposition(fresh, { disposition: 'booked', now: NOW, bookedAt: at })
    expect(state).toMatchObject({ status: 'booked', nextDueAt: null, bookedAt: at, lastDisposition: 'booked' })
  })

  it('closes booked-elsewhere and do-not-call with the reason kept', () => {
    for (const d of ['booked_elsewhere', 'do_not_call'] as const) {
      const state = applyLeadDisposition(fresh, { disposition: d, now: NOW })
      expect(state).toMatchObject({ status: 'closed', nextDueAt: null, lastDisposition: d })
    }
  })

  it('knows its own vocabulary', () => {
    for (const d of LEAD_DISPOSITIONS) expect(isLeadDisposition(d)).toBe(true)
    expect(isLeadDisposition('scheduled')).toBe(false)
    expect(isLeadDisposition('spoke_did_not_schedule')).toBe(false)
  })
})

describe('campaignConversion', () => {
  it('counts received, reached, booked and the rate', () => {
    const c = campaignConversion([
      { status: 'new' },
      { status: 'attempted', lastDisposition: 'no_answer' },
      { status: 'reached', lastDisposition: 'spoke_did_not_book' },
      { status: 'booked', lastDisposition: 'booked' },
      { status: 'confirmed', lastDisposition: 'booked' },
      { status: 'closed', lastDisposition: 'booked_elsewhere' },
      { status: 'closed', lastDisposition: 'do_not_call' },
      { status: 'closed', lastDisposition: null },
    ])
    expect(c).toEqual({ received: 8, reached: 5, booked: 2, bookedRate: 0.25 })
    expect(formatRate(c.bookedRate)).toBe('25%')
  })

  it('reports a zero rate for an empty campaign instead of NaN', () => {
    expect(campaignConversion([])).toEqual({ received: 0, reached: 0, booked: 0, bookedRate: 0 })
    expect(formatRate(0)).toBe('0%')
  })
})

describe('booked leads survive later calls', () => {
  const appt = new Date('2026-10-01T15:00:00Z')
  const booked = { status: 'booked' as const, unansweredAttempts: 0, bookedAt: appt }

  it('keeps the booking and stays off the retry list after a missed reminder call', () => {
    const state = applyLeadDisposition(booked, { disposition: 'no_answer', now: NOW })
    expect(state).toMatchObject({ status: 'booked', bookedAt: appt, nextDueAt: null, unansweredAttempts: 1 })
  })

  it('keeps the booking when the caller speaks with them again', () => {
    for (const d of ['spoke_did_not_book', 'callback_later'] as const) {
      const state = applyLeadDisposition(booked, { disposition: d, now: NOW, callBackAt: NOW })
      expect(state.status, d).toBe('booked')
      expect(state.bookedAt, d).toEqual(appt)
    }
  })

  it('still lets a rebooking replace the time and a cancellation close it', () => {
    const later = new Date('2026-10-02T15:00:00Z')
    expect(applyLeadDisposition(booked, { disposition: 'booked', now: NOW, bookedAt: later }).bookedAt).toEqual(later)
    expect(applyLeadDisposition(booked, { disposition: 'booked_elsewhere', now: NOW })).toMatchObject({ status: 'closed', bookedAt: null })
  })
})

describe('who may be called', () => {
  it('keeps future callbacks out of the working queue and stops office-hour calling', () => {
    const open = new Date('2026-09-23T15:00:00Z')
    expect(leadQueueBlockReason({ status: 'new', nextDueAt: null }, open)).toBeNull()
    expect(leadQueueBlockReason({ status: 'attempted', nextDueAt: new Date('2026-09-24T14:00:00Z') }, open)).toMatch(/later/)
    expect(leadQueueBlockReason({ status: 'new', nextDueAt: null }, new Date('2026-09-23T01:00:00Z'))).toMatch(/office hours/)
    expect(leadQueueBlockReason({ status: 'booked', nextDueAt: null }, open)).toMatch(/No call is due/)
    expect(leadQueueBlockReason({ status: 'new', nextDueAt: null, requestedAt: '2026-09-23T10:59' }, open)).toMatch(/passed/)
  })
  it('blocks archived campaigns and closed leads with a reason the caller can read', () => {
    expect(leadCallBlockReason({ status: 'archived' }, { status: 'new' })).toMatch(/archived/)
    expect(leadCallBlockReason({ status: 'active' }, { status: 'closed', lastDisposition: 'do_not_call' })).toMatch(/not to be called/)
    expect(leadCallBlockReason({ status: 'active' }, { status: 'closed', lastDisposition: 'booked_elsewhere' })).toMatch(/elsewhere/)
    expect(leadCallBlockReason({ status: 'active' }, { status: 'closed', lastDisposition: null })).toMatch(/closed/)
  })

  it('allows new, attempted, reached and booked leads on active or paused campaigns', () => {
    for (const status of ['new', 'attempted', 'reached', 'booked', 'confirmed'] as const) {
      expect(leadCallBlockReason({ status: 'active' }, { status }), status).toBeNull()
      expect(leadCallBlockReason({ status: 'paused' }, { status }), status).toBeNull()
    }
  })

  it('requires the time a booking or callback is for', () => {
    expect(leadDispositionFieldError({ disposition: 'booked', callBackAt: null, bookedAt: null })).toMatch(/appointment/)
    expect(leadDispositionFieldError({ disposition: 'callback_later', callBackAt: null, bookedAt: null })).toMatch(/called back/)
    expect(leadDispositionFieldError({ disposition: 'booked', callBackAt: null, bookedAt: NOW })).toBeNull()
    expect(leadDispositionFieldError({ disposition: 'no_answer', callBackAt: null, bookedAt: null })).toBeNull()
  })
})

describe('isLeadDue', () => {
  const past = new Date(NOW.getTime() - 1000)
  const future = new Date(NOW.getTime() + 1000)

  it('is true for any open lead whose time has come, including a booked callback', () => {
    for (const status of ['attempted', 'reached', 'booked', 'confirmed'] as const) {
      expect(isLeadDue({ status, nextDueAt: past }, NOW), status).toBe(true)
      expect(isLeadDue({ status, nextDueAt: past.toISOString() }, NOW.getTime()), status).toBe(true)
      expect(isLeadDue({ status, nextDueAt: future }, NOW), status).toBe(false)
    }
  })

  it('is never true for closed or unscheduled leads', () => {
    expect(isLeadDue({ status: 'closed', nextDueAt: past }, NOW)).toBe(false)
    expect(isLeadDue({ status: 'attempted', nextDueAt: null }, NOW)).toBe(false)
  })
})
