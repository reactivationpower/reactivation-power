import { describe, expect, it } from 'vitest'
import { allowed, cadence, canAutomate, elapsedDays, parts, textAllowed, validTimezone } from './cadence'
describe('internal sales calendar plan', () => {
  it.each(['America/New_York','America/Chicago','America/Los_Angeles','Pacific/Honolulu','Europe/London','Asia/Tokyo'])('calls use Eastern business hours; texts use 8 AM–8 PM on the lead\'s own clock: %s', zone => {
    for (const start of ['2026-03-06T14:00:00Z','2026-10-30T13:00:00Z','2026-12-31T18:00:00Z']) {
      const plan = cadence(new Date(start), zone, 'fixture')
      const counts: Record<number, number> = {}
      for (const slot of plan) {
        const date = new Date(slot.dueAt)
        expect(date >= new Date(start)).toBe(true)
        expect(slot.day).toBeLessThan(30)
        if (slot.kind === 'sms') {
          expect(textAllowed(date, zone)).toBe(true)
          const local = parts(date, zone).minute
          expect(local >= 480 && local < 1200).toBe(true)
        } else expect(allowed(date)).toBe(true)
        counts[slot.day] = (counts[slot.day] || 0) + 1
        expect(counts[slot.day]).toBeLessThanOrEqual(2)
      }
      // A same-date local morning can fall before a far-east signup, so only US zones are guaranteed all six.
      if (zone.startsWith('America/') || zone.startsWith('Pacific/')) expect(plan.filter(s => s.kind === 'sms')).toHaveLength(6)
    }
  })
  it('a West Coast lead gets texts at West Coast times, not pushed to Eastern afternoon', () => {
    const zone = 'America/Los_Angeles'
    const minutes = cadence(new Date('2026-10-12T13:00:00Z'), zone, 'west').filter(s => s.kind === 'sms').map(s => parts(new Date(s.dueAt), zone).minute)
    // Morning slots before 9 AM Eastern-business-hours would allow (i.e. before noon Eastern) are possible.
    expect(minutes.some(m => m < 540)).toBe(true)
    // Evening slots after 5 PM Eastern (2 PM Pacific) are possible too.
    expect(minutes.some(m => m >= 840)).toBe(true)
  })
  it('text window is weekdays 8 AM–8 PM local only', () => {
    expect(textAllowed(new Date('2026-10-12T15:00:00Z'), 'America/Los_Angeles')).toBe(true) // Mon 8:00 AM PT
    expect(textAllowed(new Date('2026-10-12T14:59:00Z'), 'America/Los_Angeles')).toBe(false) // 7:59 AM PT
    expect(textAllowed(new Date('2026-10-13T02:59:00Z'), 'America/Los_Angeles')).toBe(true) // Mon 7:59 PM PT
    expect(textAllowed(new Date('2026-10-13T03:00:00Z'), 'America/Los_Angeles')).toBe(false) // 8:00 PM PT
    expect(textAllowed(new Date('2026-10-10T18:00:00Z'), 'America/Los_Angeles')).toBe(false) // Saturday
    expect(textAllowed(new Date('2026-10-12T18:00:00Z'), null)).toBe(false)
  })
  it('calendar elapsed days are independent of a 23/25-hour DST day', () => {
    expect(elapsedDays(new Date('2026-03-07T17:00:00Z'),new Date('2026-03-08T16:00:00Z'))).toBe(1)
    expect(elapsedDays(new Date('2026-10-31T16:00:00Z'),new Date('2026-11-01T17:00:00Z'))).toBe(1)
  })
  it('first three business days have up to two touches; later recommended days roll forward to weekdays', () => {
    const plan = cadence(new Date('2026-10-09T12:00:00Z'), 'America/New_York', 'lead')
    expect(plan.filter(s => s.day === 0)).toHaveLength(2)
    expect(plan.filter(s => s.day === 3)).toHaveLength(2)
    expect(plan.filter(s => s.day === 4)).toHaveLength(2)
    expect(plan.filter(s => s.day >= 5)).toHaveLength(6)
    expect(plan.filter(s => s.day >= 5).map(s => s.day)).toEqual([5,7,10,14,21,28])
  })
  it('spreads different leads and never guesses an ambiguous timezone', () => {
    expect(cadence(new Date('2026-10-09T12:00Z'), 'America/New_York', 'a')).not.toEqual(cadence(new Date('2026-10-09T12:00Z'), 'America/New_York', 'b'))
    expect(validTimezone('ET')).toBe(false)
    expect(validTimezone('UTC')).toBe(true)
    expect(allowed(new Date('2026-10-09T15:00Z'), null)).toBe(false)
    expect(cadence(new Date('2026-10-09T12:00Z'), null, 'a').some(s => s.kind === 'sms')).toBe(false)
  })
  it('stops automation for every consent, identity, engagement, or terminal condition', () => {
    const lead = { historical: false, consent: true, dnd: false, timezone: 'America/New_York', stage:'New' }
    expect(canAutomate(lead)).toBe(true)
    for (const patch of [{ historical:true },{ consent:false },{ dnd:true },{ timezone:null },{ last_reply_at: new Date() },{ customer_id:'c' },
      { stage:'Engaged' },{ stage:'Not Now' },{ stage:'Won' },{ stage:'Lost/Do Not Contact' },{ appointment_status:'confirmed' }]) expect(canAutomate({ ...lead, ...patch })).toBe(false)
  })
})
