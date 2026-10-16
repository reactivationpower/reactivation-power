import { pool, type PoolClient } from '@workspace/db'
import { planOutreach, type OutreachPatient, type OutreachPlan } from './outreach-policy'

export interface QueuePatient extends OutreachPatient {
  id: string
  created_at: string
  plan: OutreachPlan
}

/**
 * A read-only, tenant-scoped policy snapshot. No contact/script notes, full
 * calls, call counts, or primary-service backfill on the polling path.
 * Correlated lookups use contact indexes and read only the latest call and
 * highest-priority outstanding follow-up.
 */
export async function readQueuePatients(
  ownerId: string, enabled: Set<string>, now = Date.now(),
  client: Pick<PoolClient, 'query'> = pool,
): Promise<QueuePatient[]> {
  const { rows } = await client.query(`
    SELECT c.id, c.niche_id, c.first_call_at, c.created_at, false AS do_not_call,
      (SELECT json_build_object('created_at', r.created_at, 'disposition', r.disposition,
        'appointment_at', r.appointment_at) FROM reactivation_calls r
        WHERE r.contact_id = c.id ORDER BY r.created_at DESC, r.id DESC LIMIT 1) AS last_call,
      (SELECT row_to_json(f) FROM follow_ups f
        WHERE f.contact_id = c.id AND f.completed_call_id IS NULL
        ORDER BY CASE WHEN f.call_context = 'confirmation' OR f.reason = 'manual' THEN 0
          WHEN f.reason = 'retry' THEN 1 ELSE 2 END, f.due_at, f.id LIMIT 1) AS next_follow_up,
      COALESCE((SELECT json_agg(json_build_object(
        'id', s.id, 'niche_id', s.niche_id, 'last_visit', s.last_visit::text,
        'outreach_status', s.outreach_status, 'created_at', s.created_at,
        'cycle_started_at', s.cycle_started_at, 'last_attempt_at', s.last_attempt_at)
        ORDER BY s.created_at, s.id) FROM contact_services s WHERE s.contact_id = c.id), '[]'::json) AS services
    FROM contacts c WHERE c.owner_id = $1 AND NOT c.do_not_call
      AND NOT EXISTS (SELECT 1 FROM patient_call_leases l WHERE l.contact_id = c.id AND l.expires_at > $2)
    ORDER BY c.created_at DESC, c.id DESC`, [ownerId, new Date(now)])
  return rows.map(row => {
    const patient = {
      ...row,
      created_at: new Date(row.created_at).toISOString(),
      first_call_at: row.first_call_at ? new Date(row.first_call_at).toISOString() : null,
    } as QueuePatient
    // Legacy/manual/demo contacts may lack a primary service until claimed.
    // Mirror the old backfill's ready primary without writing on refresh.
    if (!patient.services!.some(s => s.niche_id === patient.niche_id)) {
      patient.services!.push({
        id: patient.id, niche_id: patient.niche_id, last_visit: null,
        outreach_status: 'ready', created_at: new Date(now).toISOString(),
      })
    }
    patient.plan = planOutreach(patient, enabled, now)
    return patient
  })
}

export function isQueueReserve(patient: QueuePatient, now = Date.now()): boolean {
  return !patient.plan.blocked && !patient.next_follow_up && !patient.first_call_at &&
    (!patient.plan.dueAt || new Date(patient.plan.dueAt).getTime() <= now)
}
