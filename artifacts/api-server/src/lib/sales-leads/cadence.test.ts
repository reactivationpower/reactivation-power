import { describe, expect, it } from 'vitest'
import { allowed, cadence, canAutomate, elapsedDays, parts, validTimezone } from './cadence'
describe('internal sales calendar plan', () => {
  it.each(['America/New_York','America/Los_Angeles','Pacific/Honolulu','Europe/London','Asia/Tokyo'])('all SMS slots intersect local quiet hours and Eastern business hours: %s', zone => {
    for (const start of ['2026-03-06T14:00:00Z','2026-10-30T13:00:00Z','2026-12-31T18:00:00Z']) {
      const plan = cadence(new Date(start), zone, 'fixture')
      const counts: Record<string, number> = {}
      for (const slot of plan) {
        const date = new Date(slot.dueAt), p = parts(date, 'America/New_York')
        expect(date >= new Date(start)).toBe(true)
        expect(slot.day).toBeLessThan(30)
        expect(allowed(date)).toBe(true)
        if (slot.kind === 'sms') expect(allowed(date, zone)).toBe(true)
        counts[p.date] = (counts[p.date] || 0) + 1
        expect(counts[p.date]).toBeLessThanOrEqual(2)
      }
    }
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
