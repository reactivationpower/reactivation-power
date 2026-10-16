import { describe, expect, it } from 'vitest'
import { defaultPolicy, validatePolicy, officeOpen, eligible, isStop, asksHuman, nextOpening } from './policy'

describe('patient texting policy (no network)', () => {
  it('defaults to unchanged human handling without after-hours AI', () => {
    expect(defaultPolicy.handling).toBe('team'); expect(defaultPolicy.afterHours).toBe(false)
  })
  it('validates input without retaining unknown credential fields', () => {
    expect(validatePolicy({ ...defaultPolicy, secret: 'not-a-secret' })).not.toHaveProperty('secret')
    expect(() => validatePolicy({ ...defaultPolicy, hours: [{ day: 1, open: '17:00', close: '09:00' }] })).toThrow()
    expect(() => validatePolicy({ ...defaultPolicy, timezone: 'invalid' })).toThrow()
  })
  it('honors weekends and closures independently of recipient windows', () => {
    const weekend = new Date('2026-10-10T16:00:00Z')
    expect(officeOpen(defaultPolicy, weekend)).toBe(false)
    expect(eligible(true, false, 'America/Denver', weekend)).toBe(true)
    expect(officeOpen({ ...defaultPolicy, closures: ['2026-10-12'] }, new Date('2026-10-12T16:00:00Z'))).toBe(false)
  })
  it('fails closed without consent or timezone, or after STOP', () => {
    const now = new Date('2026-10-10T16:00:00Z')
    for (const [consent, stopped, zone] of [[false, false, 'America/Denver'], [true, true, 'America/Denver'], [true, false, null]] as const) {
      expect(eligible(consent, stopped, zone, now)).toBe(false)
    }
    expect(eligible(true, false, 'America/Denver', new Date('2026-10-11T03:00:00Z'))).toBe(false)
  })
  it('handles daylight saving transition and next opening', () => {
    expect(nextOpening(defaultPolicy, new Date('2026-11-01T07:00:00Z'))).toBe('2026-11-02T16:00:00.000Z')
    expect(officeOpen(defaultPolicy, new Date('2026-03-09T15:00:00Z'))).toBe(true)
  })
  it('recognizes suppression and human requests', () => {
    expect(isStop('STOP!')).toBe(true); expect(isStop('unsubscribe')).toBe(true)
    expect(isStop('I stopped by yesterday')).toBe(false)
    expect(asksHuman('Please have someone call me')).toBe(true)
  })
})
