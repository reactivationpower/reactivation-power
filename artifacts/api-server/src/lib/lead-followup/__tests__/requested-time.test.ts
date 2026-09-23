import { describe, expect, it } from 'vitest'
import {
  LEAD_CONFIRM_STEP_KEY,
  applyLeadDisposition,
  campaignConversion,
  leadDispositionFieldError,
  leadEntryStepKey,
  planLeadImport,
} from '@workspace/shared/lead-followup'
import { campaignTokens, REQUESTED_TIME_PLACEHOLDER } from '@workspace/shared/campaign-tokens'
import {
  formatRequestedAt,
  isRequestedSoon,
  officeClock,
  officeWallClockOf,
  parseRequestedTime,
  requestedAtLocalDate,
  spokenRequestedTime,
  wallClockOf,
} from '@workspace/shared/lead-requested-time'

/**
 * Leads who picked a day and time on the ad form: how the text becomes a
 * slot, which screen the call opens on, and how confirmed / rescheduled
 * count. Wall clocks throughout — the slot has no zone.
 */

// Wednesday 23 Sep 2026, 10:00 local.
const NOW = new Date(2026, 8, 23, 10, 0)

describe('parseRequestedTime', () => {
  it.each([
    ['Tuesday at 2', '2026-09-29T14:00'],
    ['Tuesday 2pm', '2026-09-29T14:00'],
    ['Tues 2:30 PM', '2026-09-29T14:30'],
    ['weds at 2 o\u2019clock'.replace('\u2019', "'"), '2026-09-23T14:00'],
    ['tomorrow 3pm', '2026-09-24T15:00'],
    ['tomorrow at 9', '2026-09-24T09:00'],
    ['Thursday 10am', '2026-09-24T10:00'],
    ['next monday noon', '2026-10-05T12:00'],
    ['10/6 2pm', '2026-10-06T14:00'],
    ['10/6/2026 2:00 PM', '2026-10-06T14:00'],
    ['Oct 6 2pm', '2026-10-06T14:00'],
    ['October 6th, 2026 at 2 PM', '2026-10-06T14:00'],
    ['6 October 2pm', '2026-10-06T14:00'],
    ['2026-10-06T14:00:00-04:00', '2026-10-06T14:00'],
    ['2026-10-06 14:00', '2026-10-06T14:00'],
    ['14:00 friday', '2026-09-25T14:00'],
  ])('%s -> %s', (text, expected) => {
    expect(parseRequestedTime(text, NOW)).toBe(expected)
  })

  it('needs both a day and a time; ranges and vague answers stay free text', () => {
    for (const text of ['Saturday', 'Any morning this week', 'Tuesday after 3pm', 'Friday morning', 'around 3', '2pm', '', null, undefined]) {
      expect(parseRequestedTime(text, NOW)).toBeNull()
    }
  })

  it('rolls a year-less date that already passed into next year', () => {
    expect(parseRequestedTime('1/5 9am', NOW)).toBe('2027-01-05T09:00')
  })

  it('refuses impossible dates and times', () => {
    expect(parseRequestedTime('2/30 9am', NOW)).toBeNull()
    expect(parseRequestedTime('2026-10-06T25:00', NOW)).toBeNull()
  })
})

describe('requested time formatting', () => {
  it('reads back as a badge and as speech', () => {
    expect(formatRequestedAt('2026-10-06T14:00', NOW)).toBe('Tue, Oct 6, 2:00 PM')
    expect(formatRequestedAt('2027-10-06T14:30', NOW)).toContain('2027')
    expect(spokenRequestedTime('2026-09-29T14:00', NOW)).toBe('Tuesday at 2')
    expect(spokenRequestedTime('2026-09-29T14:30', NOW)).toBe('Tuesday at 2:30')
    expect(spokenRequestedTime('2026-09-24T09:00', NOW)).toBe('tomorrow at 9')
    expect(spokenRequestedTime('2026-10-06T14:00', NOW)).toBe('Tuesday, October 6th at 2')
    expect(spokenRequestedTime(null, NOW)).toBe('')
  })

  it('accepts the Postgres spelling and builds a local Date', () => {
    const d = requestedAtLocalDate('2026-10-06 14:00:00')
    expect(d?.getHours()).toBe(14)
    expect(d?.getDate()).toBe(6)
    expect(requestedAtLocalDate('garbage')).toBeNull()
  })

  it('flags a slot in the next two days (or missed within a day) as soon', () => {
    const now = wallClockOf(NOW)
    expect(isRequestedSoon('2026-09-24T15:00', now)).toBe(true)
    expect(isRequestedSoon('2026-09-25T09:59', now)).toBe(true)
    expect(isRequestedSoon('2026-09-25T10:01', now)).toBe(false)
    expect(isRequestedSoon('2026-09-22T11:00', now)).toBe(true)
    expect(isRequestedSoon('2026-09-22T09:00', now)).toBe(false)
    expect(isRequestedSoon(null, now)).toBe(false)
  })
})

describe('leadEntryStepKey', () => {
  it('opens on the confirm screen until the slot is locked in or the lead is closed', () => {
    const requestedAt = '2026-09-29T14:00'
    expect(leadEntryStepKey({ status: 'new', requestedAt })).toBe(LEAD_CONFIRM_STEP_KEY)
    expect(leadEntryStepKey({ status: 'attempted', requestedAt })).toBe(LEAD_CONFIRM_STEP_KEY)
    expect(leadEntryStepKey({ status: 'reached', requestedAt })).toBe(LEAD_CONFIRM_STEP_KEY)
    expect(leadEntryStepKey({ status: 'booked', requestedAt })).toBeNull()
    expect(leadEntryStepKey({ status: 'confirmed', requestedAt })).toBeNull()
    expect(leadEntryStepKey({ status: 'closed', requestedAt })).toBeNull()
  })

  it('uses the normal open for a lead with no slot, even with free text', () => {
    expect(leadEntryStepKey({ status: 'new', requestedAt: null })).toBeNull()
    expect(leadEntryStepKey({ status: 'new' })).toBeNull()
  })
})

describe('confirmed and rescheduled dispositions', () => {
  const fresh = { status: 'new' as const, unansweredAttempts: 2 }
  const appt = new Date(2026, 8, 29, 14, 0)

  it('lock the appointment in as status confirmed with the time', () => {
    for (const disposition of ['confirmed', 'rescheduled'] as const) {
      expect(applyLeadDisposition(fresh, { disposition, now: NOW, bookedAt: appt })).toEqual({
        status: 'confirmed',
        unansweredAttempts: 0,
        nextDueAt: null,
        lastDisposition: disposition,
        bookedAt: appt,
      })
    }
  })

  it('require the appointment time', () => {
    expect(leadDispositionFieldError({ disposition: 'confirmed', callBackAt: null, bookedAt: null })).toMatch(/time/)
    expect(leadDispositionFieldError({ disposition: 'rescheduled', callBackAt: null, bookedAt: null })).toMatch(/time/)
    expect(leadDispositionFieldError({ disposition: 'confirmed', callBackAt: null, bookedAt: appt })).toBeNull()
  })

  it('count as booked in the campaign conversion', () => {
    const c = campaignConversion([
      { status: 'confirmed', lastDisposition: 'confirmed' },
      { status: 'confirmed', lastDisposition: 'rescheduled' },
      { status: 'new' },
      { status: 'attempted', lastDisposition: 'no_answer' },
    ])
    expect(c).toEqual({ received: 4, reached: 2, booked: 2, bookedRate: 0.5 })
  })
})

describe('office clock across the UTC date line', () => {
  // Monday 21 Sep 2026, 11:30 pm Eastern is already Tuesday 03:30 in UTC.
  const lateMonday = new Date('2026-09-22T03:30:00Z')

  it('reads an instant as the office wall clock regardless of the process zone', () => {
    const wall = officeClock(lateMonday)
    expect([wall.getFullYear(), wall.getMonth() + 1, wall.getDate(), wall.getHours(), wall.getMinutes()]).toEqual([2026, 9, 21, 23, 30])
    expect(officeWallClockOf(lateMonday)).toBe('2026-09-21T23:30')
    // Midnight Eastern must not come out as hour 24.
    expect(officeWallClockOf(new Date('2026-09-22T04:00:00Z'))).toBe('2026-09-22T00:00')
    // Winter offset (EST) is honoured too.
    expect(officeWallClockOf(new Date('2026-12-15T04:30:00Z'))).toBe('2026-12-14T23:30')
  })

  it('"tomorrow at 3pm" typed late Monday evening means Tuesday, not Wednesday', () => {
    expect(parseRequestedTime('tomorrow at 3pm', officeClock(lateMonday))).toBe('2026-09-22T15:00')
    expect(parseRequestedTime('Tuesday at 2', officeClock(lateMonday))).toBe('2026-09-22T14:00')
    expect(parseRequestedTime('today 11:45pm', officeClock(lateMonday))).toBe('2026-09-21T23:45')
  })

  it('imports and webhook-style rows with offset-bearing timestamps land on the office day', () => {
    const plan = planLeadImport(
      [
        { firstName: 'Late', phone: '3035550201', requestedTime: 'tomorrow 3pm', submittedAt: '2026-09-22T03:30:00Z' },
        { firstName: 'Mountain', phone: '3035550202', requestedTime: 'tomorrow 3pm', submittedAt: '2026-09-21T22:00:00-06:00' },
        { firstName: 'NoStamp', phone: '3035550203', requestedTime: 'tomorrow 3pm' },
      ],
      [],
      lateMonday,
    )
    // 10 pm Mountain on Monday is midnight Tuesday Eastern: the office's "tomorrow" is Wednesday.
    expect(plan.toInsert.map((l) => l.requestedAt)).toEqual(['2026-09-22T15:00', '2026-09-23T15:00', '2026-09-22T15:00'])
  })

  it('speaks the slot relative to the office day, and the call-next window follows it', () => {
    const wall = officeClock(lateMonday)
    expect(spokenRequestedTime('2026-09-22T15:00', wall)).toBe('tomorrow at 3')
    const nowWall = officeWallClockOf(lateMonday)
    // Two days out on the office clock: Wednesday 11:30 pm is in, a minute later is out.
    expect(isRequestedSoon('2026-09-23T23:30', nowWall)).toBe(true)
    expect(isRequestedSoon('2026-09-23T23:31', nowWall)).toBe(false)
  })
})

describe('imports and tokens', () => {
  it('resolves the slot relative to when the lead submitted, not the upload', () => {
    const plan = planLeadImport(
      [
        { firstName: 'A', phone: '3035550101', requestedTime: 'Tuesday at 2', submittedAt: '2026-09-16T16:00:00Z' },
        { firstName: 'B', phone: '3035550102', requestedTime: 'Tuesday at 2' },
        { firstName: 'C', phone: '3035550103', requestedTime: 'Saturday' },
      ],
      [],
      // Wednesday 23 Sep 2026, noon Eastern (an instant; the planner converts it to the office clock).
      new Date('2026-09-23T16:00:00Z'),
    )
    expect(plan.toInsert.map((l) => l.requestedAt)).toEqual(['2026-09-22T14:00', '2026-09-29T14:00', null])
    expect(plan.toInsert[2].requestedTime).toBe('Saturday')
  })

  it('fills {{requested_time}} for the confirm screen, with a practice fallback', () => {
    const campaign = { name: 'Special', offerItems: ['Exam'], regularPriceCents: null, offerPriceCents: null, priceLineStyle: 'no_price', urgencyNote: null }
    expect(campaignTokens(campaign, { submittedAt: NOW, requestedAt: '2026-09-29T14:00' }, NOW).requested_time).toBe('Tuesday at 2')
    expect(campaignTokens(campaign, { submittedAt: NOW }, NOW).requested_time).toBe(REQUESTED_TIME_PLACEHOLDER)
    expect(campaignTokens(campaign, null, NOW).requested_time).toBe(REQUESTED_TIME_PLACEHOLDER)
  })
})
