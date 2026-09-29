import { describe, expect, it } from 'vitest'
import { AESTHETICS_DEMO, CHIRO_DEMO } from '../config'
import { demoLeadAnalyticsPlan } from '../lead-analytics-history'
import { aggregateLeadCallers } from '../../lead-followup/analytics'

describe('historical lead analytics demo fixtures', () => {
  it.each([CHIRO_DEMO, AESTHETICS_DEMO])('provides five credited callers and varied real outcome rates for $key', practice => {
    const ownerId = `${practice.key}-owner`
    const callerIds = new Map(practice.callers.map(c => [c.key, `${practice.key}-${c.key}`]))
    const now = new Date('2026-10-19T16:00:00Z')
    const first = demoLeadAnalyticsPlan(practice, ownerId, callerIds, now)
    expect(demoLeadAnalyticsPlan(practice, ownerId, callerIds, now)).toEqual(first)
    expect(first).toHaveLength(69)
    expect(new Set(first.map(p => p.lead.id)).size).toBe(first.length)
    expect(first.every(p => p.lead.firstName === 'Demo' &&
      p.call.notes.includes('Fictional') && p.lead.submittedAt < p.call.createdAt &&
      p.call.createdAt < now && p.lead.status !== 'new')).toBe(true)
    expect(first.filter(p => ['confirmed', 'rescheduled'].includes(p.call.disposition))
      .every(p => p.lead.requestedAt && p.call.bookedAt && p.priorCall &&
        p.lead.submittedAt < p.priorCall.createdAt && p.priorCall.createdAt < p.call.createdAt)).toBe(true)
    const members = [
      { id: ownerId, first_name: practice.owner.first, last_name: practice.owner.last, role: 'owner' as const, is_active: true },
      ...practice.callers.map(c => ({ id: callerIds.get(c.key)!, first_name: c.first, last_name: c.last, role: 'staff' as const, is_active: true })),
    ]
    const stats = aggregateLeadCallers(members, first.flatMap(p => p.priorCall ? [p.priorCall, p.call] : [p.call]))
    expect(stats).toHaveLength(5)
    expect(stats.every(r => r.calls >= 8 && r.qualified)).toBe(true)
    expect(new Set(stats.map(r => r.answerRate)).size).toBeGreaterThan(2)
    expect(new Set(stats.map(r => r.closeRate)).size).toBeGreaterThan(2)
    const total = (key: 'booked' | 'confirmed' | 'rescheduled') => stats.reduce((n, r) => n + r[key], 0)
    expect(total('booked')).toBeGreaterThan(5)
    expect(total('confirmed')).toBeGreaterThan(0)
    expect(total('rescheduled')).toBeGreaterThan(0)
  })
})