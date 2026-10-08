import { randomUUID } from 'node:crypto'
import { pool, type PoolClient } from '@workspace/db'
import { planOutreach, DAY, ROTATION_DAYS, type OutreachPatient, type CallContext, type Service } from './outreach-policy'

/** All claims, outcomes, reopenings and imports lock the same patient row. */
export async function patientTransaction<T>(ownerId: string, contactId: string, fn: (client: PoolClient, patient: any) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query('SELECT * FROM contacts WHERE id = $1 AND owner_id = $2 FOR UPDATE', [contactId, ownerId])
    if (!rows[0]) throw new Error('Patient not found.')
    const result = await fn(client, rows[0])
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
}

/** Covers manually added contacts and demo fixtures created after migration. */
export async function ensurePrimaryServices(ownerId: string, client: Pick<PoolClient, 'query'> = pool, contactId?: string) {
  await client.query(`INSERT INTO contact_services(owner_id, contact_id, service_key, niche_id, service_label, original_complaint)
    SELECT owner_id, id, CASE WHEN niche_id IS NOT NULL THEN 'niche:' || niche_id::text
      WHEN NULLIF(btrim(service_label), '') IS NOT NULL THEN 'service:' || lower(regexp_replace(btrim(service_label), '\\s+', ' ', 'g'))
      ELSE 'unclassified' END, niche_id, service_label, original_complaint
    FROM contacts c WHERE owner_id = $1 ${contactId ? 'AND c.id = $2' : ''} AND NOT EXISTS
      (SELECT 1 FROM contact_services s WHERE s.contact_id = c.id AND s.niche_id IS NOT DISTINCT FROM c.niche_id)
    ON CONFLICT (contact_id, service_key) DO NOTHING`, contactId ? [ownerId, contactId] : [ownerId])
}

export async function loadOutreachPatient(client: Pick<PoolClient, 'query'>, patient: any): Promise<Omit<OutreachPatient, 'services'> & { services: Service[] }> {
  const services = await client.query(`SELECT s.*, s.last_visit::text, n.name AS niche_name
    FROM contact_services s LEFT JOIN niches n ON n.id = s.niche_id WHERE s.contact_id = $1 ORDER BY s.created_at, s.id`, [patient.id])
  const followUps = await client.query(`SELECT * FROM follow_ups WHERE contact_id = $1 AND completed_call_id IS NULL
    ORDER BY CASE WHEN call_context = 'confirmation' OR reason = 'manual' THEN 0 WHEN reason = 'retry' THEN 1 ELSE 2 END, due_at, id LIMIT 1`, [patient.id])
  const calls = await client.query('SELECT * FROM reactivation_calls WHERE contact_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1', [patient.id])
  return { ...patient, services: services.rows, next_follow_up: followUps.rows[0] ?? null, last_call: calls.rows[0] ?? null }
}

export async function claimPatient(ownerId: string, callerId: string, contactId: string, enabled: Set<string>) {
  return patientTransaction(ownerId, contactId, async (client, patient) => {
    await ensurePrimaryServices(ownerId, client, contactId)
    const state = await loadOutreachPatient(client, patient)
    const plan = planOutreach(state, enabled)
    if (plan.blocked || !plan.service) throw new Error(plan.blocked ?? 'No service is available.')
    // Never waive the quiet gap or a promised callback's not-before instant.
    if (!plan.dueAt || new Date(plan.dueAt).getTime() > Date.now()) throw new Error(`This patient is not due until ${plan.dueAt}.`)
    const token = randomUUID()
    const result = await client.query(`INSERT INTO patient_call_leases(contact_id, owner_id, caller_id, token, service_id, follow_up_id, context, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, now() + interval '2 minutes')
      ON CONFLICT (contact_id) DO UPDATE SET caller_id = EXCLUDED.caller_id, token = EXCLUDED.token,
        service_id = EXCLUDED.service_id, follow_up_id = EXCLUDED.follow_up_id, context = EXCLUDED.context, expires_at = EXCLUDED.expires_at
      WHERE patient_call_leases.expires_at <= now() RETURNING token`,
      [contactId, ownerId, callerId, token, plan.service.id, state.next_follow_up?.id ?? null, plan.context])
    if (!result.rowCount) throw new Error('Another caller already has this patient open. Try again after they finish.')
    const service = state.services.find(s => s.id === plan.service!.id)!
    const niche = service.niche_id ? (await client.query('SELECT * FROM niches WHERE id = $1', [service.niche_id])).rows[0] : null
    return { token, service, context: plan.context, contact: {
      ...patient, services: state.services, niche_id: service.niche_id, niche,
      original_complaint: service.original_complaint, service_label: service.service_label,
    } }
  })
}

export async function renewPatient(ownerId: string, callerId: string, contactId: string, token: string) {
  const result = await pool.query(`UPDATE patient_call_leases SET expires_at = now() + interval '2 minutes'
    WHERE owner_id = $1 AND caller_id = $2 AND contact_id = $3 AND token = $4 AND expires_at > now()
      AND EXISTS (SELECT 1 FROM contacts c WHERE c.id = patient_call_leases.contact_id AND NOT c.do_not_call)
      AND EXISTS (SELECT 1 FROM contact_services s WHERE s.id = patient_call_leases.service_id AND s.outreach_status <> 'declined')
    RETURNING token`,
    [ownerId, callerId, contactId, token])
  return { renewed: Boolean(result.rowCount) }
}
export async function releasePatient(ownerId: string, callerId: string, contactId: string, token: string) {
  await pool.query('DELETE FROM patient_call_leases WHERE owner_id = $1 AND caller_id = $2 AND contact_id = $3 AND token = $4', [ownerId, callerId, contactId, token])
  return {}
}

export interface CallInput {
  contactId: string; token: string; disposition: string; voicemailLeft: boolean; notes: string
  callBackAt: string | null; appointmentAt: string | null; retryAt: string
}
export async function savePatientCall(ownerId: string, callerId: string, enabled: Set<string>, input: CallInput) {
  return patientTransaction(ownerId, input.contactId, async (client, patient) => {
    const lease = (await client.query(`SELECT * FROM patient_call_leases WHERE contact_id = $1 AND owner_id = $2
      AND caller_id = $3 AND token = $4 AND expires_at > now() FOR UPDATE`,
      [input.contactId, ownerId, callerId, input.token])).rows[0]
    if (!lease) throw new Error('Call session expired or already saved. Return to Calls Due Now to reopen it.')
    const state = await loadOutreachPatient(client, patient)
    if (state.do_not_call) throw new Error('This patient has opted out. No additional call can be logged.')
    const service = state.services.find(s => s.id === lease.service_id)!
    if (!service || service.outreach_status === 'declined' || (service.niche_id && !enabled.has(service.niche_id))) throw new Error('This service is no longer available for calling.')
    // The lease freezes the service for a call already underway. A new CSV
    // service or treatment date must not discard the caller's actual outcome.
    // A changed promised follow-up, however, requires reopening the screen.
    if ((state.next_follow_up?.id ?? null) !== lease.follow_up_id) throw new Error('The patient’s calling context changed. Reopen the call before continuing.')
    const confirmation = lease.context === 'confirmation'
    const d = input.disposition
    if (confirmation && !['no_answer', 'voicemail', 'spoke_call_back_later', 'appointment_confirmed', 'appointment_cancelled', 'do_not_call'].includes(d))
      throw new Error('Choose an appointment confirmation outcome.')
    if (!confirmation && ['appointment_confirmed', 'appointment_cancelled'].includes(d)) throw new Error('This is not an appointment confirmation.')
    if (d === 'spoke_call_back_later' && !input.callBackAt) throw new Error('Choose a callback time.')
    if (d === 'scheduled' && !input.appointmentAt) throw new Error('Choose an appointment time.')
    if (input.callBackAt && (!Number.isFinite(new Date(input.callBackAt).getTime()) || new Date(input.callBackAt).getTime() <= Date.now())) throw new Error('Choose a future callback time.')
    if (d === 'scheduled' && input.appointmentAt && new Date(input.appointmentAt).getTime() <= Date.now()) throw new Error('Choose a future appointment time.')
    const now = new Date()
    const appointment = confirmation ? state.last_call?.appointment_at ?? null : d === 'scheduled' ? input.appointmentAt : null
    const callId = randomUUID()
    await client.query(`INSERT INTO reactivation_calls(id, contact_id, caller_id, disposition, voicemail_left, notes,
      appointment_at, service_id, service_label_snapshot, call_context)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [callId, input.contactId, callerId, d, input.voicemailLeft, input.notes || null, appointment,
        service.id, service.service_label ?? service.niche_name, lease.context])
    // Resolve only this sequence; preserve independent promised follow-ups.
    await client.query(`UPDATE follow_ups SET completed_call_id = $2 WHERE contact_id = $1 AND completed_call_id IS NULL
      AND (id = $3 OR (COALESCE(call_context, '') NOT IN ('callback', 'confirmation')
        AND reason <> 'manual' AND (service_id = $4 OR service_id IS NULL)))`,
      [input.contactId, callId, lease.follow_up_id, service.id])
    const cycleStart = service.cycle_started_at ? new Date(service.cycle_started_at) : now
    const newCycle = ['initial', 'rotation'].includes(lease.context)
    const start = newCycle ? now : cycleStart
    const end = new Date(start)
    end.setUTCMonth(end.getUTCMonth() + 2)
    const retry = ['no_answer', 'voicemail'].includes(d) && now < end
    let status = d === 'service_declined' ? 'declined' : (retry || d === 'spoke_call_back_later') && !confirmation ? 'active' : 'cooling'
    if (d === 'do_not_call') status = 'cooling'
    await client.query(`UPDATE contact_services SET outreach_status = $2, cycle_started_at = $3,
      last_attempt_at = $4, last_outcome = $5 WHERE id = $1`, [service.id, status, start, now, d])
    const stageName = d === 'scheduled' ? 'scheduled' : d.startsWith('spoke_') || d === 'service_declined' ? 'spoke to' : retry ? 'contacting' : null
    await client.query(`UPDATE contacts SET first_call_at = COALESCE(first_call_at, $2),
      niche_id = $3, service_label = $4, original_complaint = $5, do_not_call = do_not_call OR $6,
      stage_id = COALESCE((SELECT id FROM pipeline_stages WHERE lower(name) = $7
        AND (owner_id IS NULL OR owner_id = $8) ORDER BY owner_id NULLS LAST LIMIT 1), stage_id)
      WHERE id = $1`, [input.contactId, now, service.niche_id, service.service_label, service.original_complaint, d === 'do_not_call', stageName, ownerId])
    if (d === 'do_not_call') await client.query('UPDATE follow_ups SET completed_call_id = $2 WHERE contact_id = $1 AND completed_call_id IS NULL', [input.contactId, callId])
    else {
      if (d === 'service_declined') await client.query('UPDATE follow_ups SET completed_call_id = $2 WHERE contact_id = $1 AND service_id = $3 AND completed_call_id IS NULL', [input.contactId, callId, service.id])
      let context: CallContext = 'rotation'
      let reason = 'quarterly'
      let due = new Date(now.getTime() + ROTATION_DAYS * DAY)
      if (d === 'spoke_call_back_later') { context = confirmation ? 'confirmation' : 'callback'; reason = 'manual'; due = new Date(input.callBackAt!) }
      else if (d === 'scheduled') { context = 'confirmation'; reason = 'manual'; due = new Date(Math.max(now.getTime(), new Date(input.appointmentAt!).getTime() - DAY)) }
      else if (confirmation && ['no_answer', 'voicemail'].includes(d) && appointment && new Date(appointment) > now) {
        context = 'confirmation'; reason = 'retry'; due = new Date(Math.min(new Date(input.retryAt).getTime(), new Date(appointment).getTime()))
      } else if (!confirmation && retry) { context = 'retry'; reason = 'retry'; due = new Date(input.retryAt) }
      // Appointment-confirmed still holds rotation until the appointment date.
      if (context === 'rotation' && appointment && d !== 'appointment_cancelled') due = new Date(Math.max(due.getTime(), new Date(appointment).getTime()))
      await client.query(`INSERT INTO follow_ups(contact_id, due_at, reason, service_id, call_context) VALUES ($1,$2,$3,$4,$5)`,
        [input.contactId, due, reason, service.id, context])
    }
    await client.query('DELETE FROM patient_call_leases WHERE contact_id = $1 AND token = $2', [input.contactId, input.token])
    return { callId }
  })
}

export async function reopenPatientService(ownerId: string, contactId: string, serviceId: string) {
  return patientTransaction(ownerId, contactId, async client => {
    if ((await client.query('SELECT 1 FROM patient_call_leases WHERE contact_id = $1 AND expires_at > now()', [contactId])).rowCount) throw new Error('Finish the active call before reopening a service.')
    const result = await client.query(`UPDATE contact_services SET outreach_status = 'cooling', cycle_started_at = NULL
      WHERE id = $1 AND contact_id = $2 AND owner_id = $3 AND outreach_status = 'declined' RETURNING id`, [serviceId, contactId, ownerId])
    if (!result.rowCount) throw new Error('This declined service is no longer available.')
    // Reopening never clears the shared opt-out or bypasses the 90-day gap.
    await client.query(`INSERT INTO follow_ups(contact_id, due_at, reason, service_id, call_context)
      SELECT $1, now(), 'quarterly', $2, 'rotation' WHERE NOT EXISTS
      (SELECT 1 FROM follow_ups WHERE contact_id = $1 AND completed_call_id IS NULL)`, [contactId, serviceId])
    return {}
  })
}
