import { describe, expect, it } from 'vitest'
import {
  LEAD_DISPOSITIONS,
  applyLeadDisposition,
  campaignConversion,
  formatRate,
  isLeadDisposition,
  isLeadDue,
  leadCallBlockReason,
  leadDispositionFieldError,
  nextLeadAttemptAt,
} from '@workspace/shared/lead-followup'

/** The lead retry cadence and the per-campaign conversion math. */

const NOW = new Date('2026-09-23T15:00:00Z')
const HOUR = 3_600_000

describe('nextLeadAttemptAt', () => {
  it('goes later today, tomorrow, day three, then parks', () => {
    expect(nextLeadAttemptAt(1, NOW)?.getTime()).toBe(NOW.getTime() + 4 * HOUR)
    expect(nextLeadAttemptAt(2, NOW)?.getTime()).toBe(NOW.getTime() + 24 * HOUR)
    expect(nextLeadAttemptAt(3, NOW)?.getTime()).toBe(NOW.getTime() + 24 * HOUR)
    expect(nextLeadAttemptAt(4, NOW)).toBeNull()
    expect(nextLeadAttemptAt(9, NOW)).toBeNull()
  })
})

describe('applyLeadDisposition', () => {
  const fresh = { status: 'new' as const, unansweredAttempts: 0 }

  it('walks a never-answered lead through the cadence and parks it', () => {
    let state = applyLeadDisposition(fresh, { disposition: 'no_answer', now: NOW })
    expect(state.status).toBe('attempted')
    expect(state.unansweredAttempts).toBe(1)
    expect(state.nextDueAt?.getTime()).toBe(NOW.getTime() + 4 * HOUR)

    state = applyLeadDisposition(state, { disposition: 'voicemail', now: NOW })
    expect(state.unansweredAttempts).toBe(2)
    expect(state.nextDueAt?.getTime()).toBe(NOW.getTime() + 24 * HOUR)

    state = applyLeadDisposition(state, { disposition: 'no_answer', now: NOW })
    expect(state.unansweredAttempts).toBe(3)
    expect(state.nextDueAt?.getTime()).toBe(NOW.getTime() + 24 * HOUR)

    state = applyLeadDisposition(state, { disposition: 'no_answer', now: NOW })
    expect(state.unansweredAttempts).toBe(4)
    expect(state.nextDueAt).toBeNull()
    expect(state.status).toBe('attempted')
    expect(state.lastDisposition).toBe('no_answer')
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
