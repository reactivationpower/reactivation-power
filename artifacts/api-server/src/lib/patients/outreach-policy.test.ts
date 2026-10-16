import { describe, expect, it } from 'vitest'
import { DAY, planOutreach, treatmentEligibleAt, type OutreachPatient, type Service } from './outreach-policy'

const now = Date.parse('2026-10-07T16:00:00Z')
const enabled = new Set(['a', 'b', 'c'])
const svc = (id: string, extra = {}): Service => ({
  id, contact_id: 'p', niche_id: id, service_label: id, last_visit: null,
  original_complaint: null, source_notes: null, niche_name: id,
  outreach_status: 'ready', created_at: '2026-01-01T00:00:00Z', ...extra,
})
const patient = (extra = {}): OutreachPatient => ({
  niche_id: 'a', do_not_call: false, first_call_at: '2026-01-01T00:00:00Z',
  last_call: { created_at: new Date(now - 89 * DAY).toISOString(), disposition: 'spoke_did_not_schedule' },
  next_follow_up: { id: 'f', contact_id: 'p', due_at: new Date(now + DAY).toISOString(), reason: 'quarterly', completed_call_id: null, created_at: '2026-01-01' },
  services: [svc('a', { outreach_status: 'cooling', last_attempt_at: new Date(now - 89 * DAY).toISOString() }), svc('b', { created_at: new Date(now).toISOString() })],
  ...extra,
})

describe('patient-level service rotation', () => {
  it('new upload one day before due uses the new niche tomorrow, not another 90-day wait', () => {
    const p = planOutreach(patient(), enabled, now)
    expect(p.service?.id).toBe('b')
    expect(p.context).toBe('rotation')
    expect(p.dueAt).toBe(new Date(now + DAY).toISOString())
  })
  it('does not delay the switch based on the old scheduled due date', () => {
    const p = patient()
    p.next_follow_up!.due_at = new Date(now + 80 * DAY).toISOString()
    expect(planOutreach(p, enabled, now).dueAt).toBe(new Date(now + DAY).toISOString())
  })
  it('finishes the active retry cycle before selecting the newer service', () => {
    const p = patient()
    p.services![0] = svc('a', { outreach_status: 'active', cycle_started_at: '2026-09-20T00:00:00Z' })
    p.next_follow_up!.reason = 'retry'
    const plan = planOutreach(p, enabled, now)
    expect(plan.service?.id).toBe('a')
    expect(plan.context).toBe('retry')
  })
  it('rotates once the cycle expires, still anchored to the last actual attempt', () => {
    const p = patient()
    p.services![0] = svc('a', { outreach_status: 'active', cycle_started_at: '2026-01-01', last_attempt_at: '2026-07-10' })
    p.next_follow_up!.reason = 'retry'
    expect(planOutreach(p, enabled, now).service?.id).toBe('b')
    expect(planOutreach(p, enabled, now).dueAt).toBe(new Date(now + DAY).toISOString())
  })
  it.each(['callback', 'confirmation'] as const)('preserves promised %s service/time despite new services and treatment dates', context => {
    const p = patient()
    p.services![1]!.last_visit = '2026-10-01'
    p.next_follow_up = { ...p.next_follow_up!, reason: 'manual', service_id: 'a', call_context: context }
    const plan = planOutreach(p, enabled, now)
    expect(plan.service?.id).toBe('a')
    expect(plan.context).toBe(context)
    expect(plan.dueAt).toBe(p.next_follow_up.due_at)
  })
  it('uses the most recent treatment across all services, even a declined service', () => {
    const p = patient()
    p.services![0]!.last_visit = '2026-10-01'
    p.services![0]!.outreach_status = 'declined'
    expect(planOutreach(p, enabled, now).dueAt).toBe('2027-01-02T00:00:00.000Z')
  })
  it('accepts missing treatment dates and excludes declined or disabled services', () => {
    const p = patient()
    p.services![1]!.outreach_status = 'declined'
    expect(planOutreach(p, enabled, now).service?.id).toBe('a')
    expect(planOutreach(patient(), new Set(['a']), now).service?.id).toBe('a')
    expect(planOutreach(p, new Set(), now).blocked).toBeTruthy()
  })
  it('patient opt-out blocks every service', () => {
    expect(planOutreach(patient({ do_not_call: true }), enabled, now).blocked).toMatch(/opted out/)
  })
  it('selects the newest unattempted service, then the least recently attempted', () => {
    const p = patient()
    p.services!.push(svc('c', { created_at: '2026-10-08T00:00:00Z' }))
    expect(planOutreach(p, enabled, now).service?.id).toBe('c')
    p.services = [svc('a', { last_attempt_at: '2026-08-01' }), svc('b', { last_attempt_at: '2026-05-01' })]
    expect(planOutreach(p, enabled, now).service?.id).toBe('b')
  })
  it('retains the primary niche before the first attempt', () => {
    expect(planOutreach(patient({ first_call_at: null, last_call: null }), enabled, now).service?.id).toBe('a')
  })
  it('clamps treatment month ends without turning three months into 90 days', () => {
    expect(new Date(treatmentEligibleAt('2026-01-31')).toISOString()).toBe('2026-05-01T00:00:00.000Z')
  })
  it('holds rotation while an appointment is pending', () => {
    const p = patient({ last_call: { created_at: '2026-01-01', disposition: 'scheduled', appointment_at: '2026-12-01T12:00:00Z' } })
    expect(planOutreach(p, enabled, now).dueAt).toBe('2026-12-01T12:00:00.000Z')
  })
  it('a cancelled appointment does not hold rotation until the former appointment date', () => {
    const p = patient({ last_call: { created_at: '2026-01-01', disposition: 'appointment_cancelled', appointment_at: '2026-12-01T12:00:00Z' } })
    expect(new Date(planOutreach(p, enabled, now).dueAt!).getTime()).toBeLessThan(now)
  })
})
