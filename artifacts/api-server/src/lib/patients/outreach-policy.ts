import type { PatientService } from '@workspace/shared/csv-patients'
import type { FollowUp, OutreachCallContext } from '@workspace/shared/types'

export const DAY = 86_400_000
export const ROTATION_DAYS = 90
export type CallContext = OutreachCallContext
export type Service = PatientService & { outreach_status: 'ready' | 'active' | 'cooling' | 'declined' }
export type PendingFollowUp = FollowUp & { service_id?: string | null; call_context?: CallContext | null }
export interface OutreachPatient {
  niche_id: string | null
  do_not_call: boolean
  first_call_at: string | null
  last_call: { created_at: string; disposition: string; appointment_at?: string | null } | null
  next_follow_up: PendingFollowUp | null
  services?: PatientService[]
}
export interface OutreachPlan {
  service: Service | null
  context: CallContext
  dueAt: string | null
  blocked: string | null
}

/** Calendar months, clamped at month-end. Eligibility is strictly > 3 months. */
export function treatmentEligibleAt(date: string): number {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`)
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 4, 0))
  target.setUTCDate(Math.min(d.getUTCDate(), target.getUTCDate()))
  // Treat date-only histories conservatively: eligible the next calendar day.
  return target.getTime() + DAY
}

export function planOutreach(patient: OutreachPatient, enabled: Set<string>, now = Date.now()): OutreachPlan {
  const services = (patient.services ?? []) as Service[]
  const f = patient.next_follow_up
  const primary = services.find(s => s.niche_id === patient.niche_id) ?? services[0] ?? null
  const base = { service: primary, context: 'initial' as CallContext, dueAt: f?.due_at ?? null, blocked: null as string | null }
  if (patient.do_not_call) return { ...base, blocked: 'This patient has opted out of all calls.' }
  const eligible = services.filter(s => s.outreach_status !== 'declined' && (!s.niche_id || enabled.has(s.niche_id)))
  const committedContext = f?.call_context ?? (f?.reason === 'manual' ? 'callback' : f?.reason === 'retry' ? 'retry' : null)
  const active = services.find(s => s.outreach_status === 'active')
  const bound = services.find(s => s.id === f?.service_id) ?? active ?? primary
  // Promised callbacks and confirmations retain their exact service and time.
  if (committedContext === 'callback' || committedContext === 'confirmation') {
    return { ...base, service: bound, context: committedContext, blocked: !bound || bound.outreach_status === 'declined' || (bound.niche_id && !enabled.has(bound.niche_id)) ? 'The promised service is not active on this account.' : null }
  }
  const latestTreatment = services.reduce((latest, s) => s.last_visit && s.last_visit > latest ? s.last_visit : latest, '')
  const treatmentAt = latestTreatment ? treatmentEligibleAt(latestTreatment) : 0
  const lastAttempt = patient.last_call ? new Date(patient.last_call.created_at).getTime() : 0
  const appointmentAt = patient.last_call?.appointment_at && patient.last_call.disposition !== 'appointment_cancelled' ? new Date(patient.last_call.appointment_at).getTime() : 0
  // A retry window is per service/cycle, not the patient's lifetime first call.
  const cycleStart = active?.cycle_started_at ?? patient.first_call_at
  const cycleEnd = cycleStart ? new Date(cycleStart) : null
  if (cycleEnd) cycleEnd.setUTCMonth(cycleEnd.getUTCMonth() + 2)
  const inRetryCycle = (committedContext === 'retry' || Boolean(active)) && cycleEnd && now < cycleEnd.getTime()
  if (inRetryCycle && bound && eligible.some(s => s.id === bound.id)) {
    return { ...base, service: bound, context: 'retry', dueAt: new Date(Math.max(new Date(f?.due_at ?? now).getTime(), treatmentAt)).toISOString() }
  }
  if (!eligible.length) return { ...base, blocked: 'No eligible service is available. Declined services require staff to reopen them.' }
  // Never-attempted newest service first; then least-recently attempted rotation.
  eligible.sort((a, b) => {
    if (!a.last_attempt_at && !b.last_attempt_at) return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime() || a.id.localeCompare(b.id)
    if (!a.last_attempt_at) return -1
    if (!b.last_attempt_at) return 1
    return new Date(a.last_attempt_at).getTime() - new Date(b.last_attempt_at).getTime() || a.id.localeCompare(b.id)
  })
  // Before the first-ever call, retain the existing primary script.
  const service = !lastAttempt && primary && eligible.some(s => s.id === primary.id) ? primary : eligible[0]!
  const due = Math.max(lastAttempt ? lastAttempt + ROTATION_DAYS * DAY : new Date(f?.due_at ?? now).getTime(), treatmentAt, appointmentAt)
  return { service, context: lastAttempt ? 'rotation' : 'initial', dueAt: new Date(due).toISOString(), blocked: null }
}
