import { describe, it, expect } from 'vitest'
import { canReattribute, clawbackCents, earnedCents, periodAt, validateRules } from './rules'

describe('affiliate integer money and elapsed-time rules', () => {
  it('rounds deterministically, excluding zero or uncollected payments', () => {
    expect(earnedCents(10005, { kind: 'percent', value: 1000 })).toBe(1001)
    expect(earnedCents(10000, { kind: 'flat', value: 1234 })).toBe(1234)
    expect(earnedCents(0, { kind: 'flat', value: 1234 })).toBe(0)
    expect(clawbackCents(1001, 10005, 5000)).toBe(500)
    expect(clawbackCents(1234, 10000, 5000)).toBe(617)
    expect(clawbackCents(1234, 10000, 20000)).toBe(1234)
  })
  it('bounds commission input in cents/basis points', () => {
    expect(() => validateRules({ monthly: { kind: 'percent', value: 10001 }, one_time: { kind: 'flat', value: 0 } })).toThrow()
    expect(() => validateRules({ monthly: { kind: 'flat', value: 2.5 }, one_time: { kind: 'flat', value: 0 } })).toThrow()
  })
  it('uses New York months across DST, not UTC month boundaries', () => {
    expect(periodAt(new Date('2026-03-01T04:59:59Z'))).toBe('2026-02')
    expect(periodAt(new Date('2026-03-01T05:00:00Z'))).toBe('2026-03')
    expect(periodAt(new Date('2026-07-01T03:59:59Z'))).toBe('2026-06')
    expect(periodAt(new Date('2026-07-01T04:00:00Z'))).toBe('2026-07')
  })
  it('changes only on a new eligible submission after five FULL elapsed days and never after conversion', () => {
    const end = new Date('2026-03-11T10:00:00Z')
    expect(canReattribute(end, false, new Date('2026-03-11T09:59:59Z'))).toBe(false)
    expect(canReattribute(end, false, end)).toBe(true)
    expect(canReattribute(end, true, new Date('2026-04-01T00:00:00Z'))).toBe(false)
  })
})
