import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pool } from '@workspace/db'
import { claimPatient, renewPatient, releasePatient, reopenPatientService, savePatientCall } from './outreach'
import { executePatientImport } from './csv-import'
import { DAY } from './outreach-policy'
import { getPatientServiceHistory } from '@/lib/data/reactivation'

describe.skipIf(!process.env.SUPABASE_DB_URL)('service-aware calling transactions', () => {
  let ownerId: string, callerId: string, contactId: string, a: string, b: string
  const enabled = () => new Set([a, b])
  const upload = (nicheId: string, lastVisit?: string) => executePatientImport(
    { ownerId, participantId: ownerId, source: 'outreach-test', stageId: null, simulated: false },
    [{ nicheId, row: { name: 'Outreach Test', phone: '2125550187', patientId: '0001', service: nicheId, lastVisit } }],
  )
  const log = (token: string, disposition = 'spoke_did_not_schedule', extra = {}) => savePatientCall(ownerId, ownerId, enabled(), {
    contactId, token, disposition, voicemailLeft: false, notes: 'Test outcome',
    callBackAt: null, appointmentAt: null, retryAt: new Date(Date.now() + 5 * DAY).toISOString(), ...extra,
  })
  beforeEach(async () => {
    ownerId = randomUUID(); callerId = randomUUID()
    await pool.query(`INSERT INTO participants(id, first_name, last_name, email, role) VALUES
      ($1,'Outreach','Owner',$2,'owner'),($3,'Outreach','Caller',$4,'staff')`,
      [ownerId, `outreach-${ownerId}@example.invalid`, callerId, `outreach-${callerId}@example.invalid`])
    const niches = (await pool.query('SELECT id FROM niches WHERE is_active = true ORDER BY id LIMIT 2')).rows
    a = niches[0].id; b = niches[1].id
    await upload(a)
    contactId = (await pool.query('SELECT id FROM contacts WHERE owner_id = $1', [ownerId])).rows[0].id
    await pool.query("INSERT INTO follow_ups(contact_id, due_at, reason) VALUES($1, now() - interval '1 hour', 'initial')", [contactId])
  })
  afterEach(async () => {
    await pool.query('DELETE FROM participants WHERE id = ANY($1::uuid[])', [[ownerId, callerId]])
  })
  it('only one caller/tab can claim; tenant, token and expiry are enforced', async () => {
    const results = await Promise.allSettled([claimPatient(ownerId, ownerId, contactId, enabled()), claimPatient(ownerId, callerId, contactId, enabled())])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    const lease = (await pool.query('SELECT * FROM patient_call_leases WHERE contact_id = $1', [contactId])).rows[0]
    await expect(claimPatient(ownerId, lease.caller_id, contactId, enabled())).rejects.toThrow('already')
    expect((await renewPatient(ownerId, lease.caller_id, contactId, lease.token)).renewed).toBe(true)
    expect((await renewPatient(callerId, lease.caller_id, contactId, lease.token)).renewed).toBe(false)
    await releasePatient(ownerId, lease.caller_id, contactId, randomUUID())
    expect((await pool.query('SELECT count(*)::int AS n FROM patient_call_leases WHERE contact_id=$1', [contactId])).rows[0].n).toBe(1)
    await pool.query("UPDATE patient_call_leases SET expires_at = now() - interval '1 second' WHERE contact_id=$1", [contactId])
    const replacement = await claimPatient(ownerId, ownerId, contactId, enabled())
    await expect(log(lease.token)).rejects.toThrow('expired')
    expect(replacement.token).not.toBe(lease.token)
    await expect(claimPatient(callerId, callerId, contactId, enabled())).rejects.toThrow('not found')
  })
  it('logs once atomically, stores service context, and preserves unrelated callbacks', async () => {
    const claim = await claimPatient(ownerId, ownerId, contactId, enabled())
    const other = await pool.query(`INSERT INTO follow_ups(contact_id,due_at,reason,service_id,call_context)
      VALUES($1,now()+interval '10 days','manual',$2,'callback') RETURNING id`, [contactId, claim.service.id])
    // Changed commitment rejects stale screen without partial call data.
    await expect(log(claim.token)).rejects.toThrow('context changed')
    expect((await pool.query('SELECT count(*)::int AS n FROM reactivation_calls WHERE contact_id=$1', [contactId])).rows[0].n).toBe(0)
    await pool.query('DELETE FROM follow_ups WHERE id=$1', [other.rows[0].id])
    const result = await log(claim.token)
    await expect(log(claim.token)).rejects.toThrow('expired')
    const c = (await pool.query('SELECT * FROM reactivation_calls WHERE id=$1', [result.callId])).rows[0]
    expect(c).toMatchObject({ service_id: claim.service.id, call_context: 'initial', disposition: 'spoke_did_not_schedule' })
    expect((await pool.query('SELECT count(*)::int AS n FROM follow_ups WHERE contact_id=$1 AND completed_call_id IS NULL', [contactId])).rows[0].n).toBe(1)
  })
  it('new service waits 90 days and an active retry keeps its original service', async () => {
    const first = await claimPatient(ownerId, ownerId, contactId, enabled())
    await log(first.token, 'no_answer')
    await upload(b)
    await pool.query("UPDATE follow_ups SET due_at=now()-interval '1 minute' WHERE contact_id=$1 AND completed_call_id IS NULL", [contactId])
    const retry = await claimPatient(ownerId, ownerId, contactId, enabled())
    expect(retry.service.niche_id).toBe(a)
    expect(retry.context).toBe('retry')
    await log(retry.token)
    await expect(claimPatient(ownerId, ownerId, contactId, enabled())).rejects.toThrow('not due')
    await pool.query("UPDATE reactivation_calls SET created_at=now()-interval '91 days' WHERE contact_id=$1", [contactId])
    const rotation = await claimPatient(ownerId, ownerId, contactId, enabled())
    expect(rotation.service.niche_id).toBe(b)
    expect(rotation.context).toBe('rotation')
    await log(rotation.token, 'no_answer')
    expect((await pool.query('SELECT outreach_status FROM contact_services WHERE id=$1', [rotation.service.id])).rows[0].outreach_status).toBe('active')
  })
  it('a CSV arriving during a live call does not switch its context or lose its outcome', async () => {
    const first = await claimPatient(ownerId,ownerId,contactId,enabled())
    await log(first.token)
    await pool.query("UPDATE reactivation_calls SET created_at=now()-interval '91 days' WHERE contact_id=$1", [contactId])
    const current = await claimPatient(ownerId,ownerId,contactId,enabled())
    await upload(b,new Date().toISOString().slice(0,10))
    const outcome = await log(current.token)
    expect((await pool.query('SELECT service_id FROM reactivation_calls WHERE id=$1',[outcome.callId])).rows[0].service_id).toBe(current.service.id)
    await expect(claimPatient(ownerId,ownerId,contactId,enabled())).rejects.toThrow('not due')
  })
  it('logging a callback preserves a different service’s promised callback', async () => {
    await upload(b)
    const services = (await pool.query('SELECT id,niche_id FROM contact_services WHERE contact_id=$1', [contactId])).rows
    const primary = services.find(s => s.niche_id === a).id
    const secondary = services.find(s => s.niche_id === b).id
    await pool.query("UPDATE follow_ups SET reason='manual',call_context='callback',service_id=$2 WHERE contact_id=$1", [contactId,primary])
    const other = (await pool.query(`INSERT INTO follow_ups(contact_id,due_at,reason,service_id,call_context)
      VALUES($1,now()+interval '10 days','manual',$2,'callback') RETURNING id`, [contactId,secondary])).rows[0]
    const claim = await claimPatient(ownerId,ownerId,contactId,enabled())
    expect(claim.service.id).toBe(primary)
    await log(claim.token,'spoke_call_back_later',{ callBackAt: new Date(Date.now()+5*DAY).toISOString() })
    expect((await pool.query('SELECT completed_call_id FROM follow_ups WHERE id=$1', [other.id])).rows[0].completed_call_id).toBeNull()
  })
  it('repeat reports and updated treatment dates never reopen declines', async () => {
    const first = await claimPatient(ownerId, ownerId, contactId, enabled())
    await log(first.token, 'service_declined')
    await upload(a, '2020-01-01')
    await upload(a, '2026-01-01')
    expect((await pool.query('SELECT outreach_status FROM contact_services WHERE id=$1', [first.service.id])).rows[0].outreach_status).toBe('declined')
    await expect(claimPatient(ownerId, ownerId, contactId, enabled())).rejects.toThrow('No eligible')
    await reopenPatientService(ownerId, contactId, first.service.id, ownerId, 'Patient asked to discuss the service again')
    await expect(claimPatient(ownerId, ownerId, contactId, enabled())).rejects.toThrow('not due')
    await pool.query("UPDATE reactivation_calls SET created_at=now()-interval '91 days' WHERE contact_id=$1", [contactId])
    const reopened = await claimPatient(ownerId, ownerId, contactId, enabled())
    expect(reopened.service.id).toBe(first.service.id)
  })
  it('office-wide recent treatment blocks new outreach but not a promised callback', async () => {
    await upload(b, new Date().toISOString().slice(0, 10))
    await expect(claimPatient(ownerId, ownerId, contactId, enabled())).rejects.toThrow('not due')
    const service = (await pool.query('SELECT id FROM contact_services WHERE contact_id=$1 AND niche_id=$2', [contactId, a])).rows[0]
    await pool.query("UPDATE follow_ups SET reason='manual',call_context='callback',service_id=$2 WHERE contact_id=$1", [contactId, service.id])
    const callback = await claimPatient(ownerId, ownerId, contactId, enabled())
    expect(callback.context).toBe('callback')
    expect(callback.service.niche_id).toBe(a)
  })
  it('appointment confirmation stays on the booked service and is not a sales cycle', async () => {
    const first = await claimPatient(ownerId, ownerId, contactId, enabled())
    await log(first.token, 'scheduled', { appointmentAt: new Date(Date.now() + 2 * DAY).toISOString() })
    await upload(b)
    await pool.query("UPDATE follow_ups SET due_at=now()-interval '1 minute' WHERE contact_id=$1 AND completed_call_id IS NULL", [contactId])
    const confirm = await claimPatient(ownerId, ownerId, contactId, enabled())
    expect(confirm.service.niche_id).toBe(a)
    expect(confirm.context).toBe('confirmation')
    await expect(log(confirm.token, 'service_declined')).rejects.toThrow('confirmation outcome')
    await pool.query("UPDATE contact_services SET cycle_started_at=now()-interval '100 days' WHERE id=$1", [confirm.service.id])
    await log(confirm.token, 'no_answer')
    expect((await pool.query('SELECT call_context FROM follow_ups WHERE contact_id=$1 AND completed_call_id IS NULL',[contactId])).rows[0].call_context).toBe('confirmation')
    await pool.query("UPDATE follow_ups SET due_at=now()-interval '1 minute' WHERE contact_id=$1 AND completed_call_id IS NULL", [contactId])
    const stillConfirmation = await claimPatient(ownerId,ownerId,contactId,enabled())
    expect(stillConfirmation.service.id).toBe(confirm.service.id)
    await log(stillConfirmation.token, 'appointment_confirmed')
    await expect(claimPatient(ownerId, ownerId, contactId, enabled())).rejects.toThrow('not due')
  })
  it('a shared opt-out blocks every service and cannot be cleared by reopening', async () => {
    const first = await claimPatient(ownerId, ownerId, contactId, enabled())
    await log(first.token, 'do_not_call')
    await upload(b)
    await expect(claimPatient(ownerId, ownerId, contactId, enabled())).rejects.toThrow('opted out')
  })
  it('audits a reopening once with staff and reason, preserving calls, clock, notes and opt-out', async () => {
    await pool.query('UPDATE participants SET parent_id=$2 WHERE id=$1', [callerId, ownerId])
    const first = await claimPatient(ownerId, ownerId, contactId, enabled())
    await log(first.token, 'service_declined')
    await pool.query("UPDATE contacts SET do_not_call=true,notes='Keep staff notes' WHERE id=$1", [contactId])
    const beforeContact = (await pool.query('SELECT * FROM contacts WHERE id=$1', [contactId])).rows[0]
    const beforeService = (await pool.query('SELECT * FROM contact_services WHERE id=$1', [first.service.id])).rows[0]
    const beforeCalls = (await pool.query('SELECT * FROM reactivation_calls WHERE contact_id=$1', [contactId])).rows
    const beforeFollowUps = (await pool.query('SELECT * FROM follow_ups WHERE contact_id=$1 ORDER BY id', [contactId])).rows
    const results = await Promise.allSettled([
      reopenPatientService(ownerId, contactId, first.service.id, callerId, '  Patient requested another discussion  '),
      reopenPatientService(ownerId, contactId, first.service.id, callerId, 'Patient requested another discussion'),
    ])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    const events = await getPatientServiceHistory(ownerId, contactId)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      owner_id: ownerId, contact_id: contactId, service_id: first.service.id, actor_id: callerId,
      actor_name_snapshot: 'Outreach Caller', event_type: 'service_reopened',
      previous_status: 'declined', new_status: 'cooling',
      reason: 'Patient requested another discussion',
    })
    expect(events[0].service_label_snapshot).toBeTruthy()
    expect(events[0].created_at).toBeInstanceOf(Date)
    expect(await getPatientServiceHistory(callerId, contactId)).toEqual([])
    expect((await pool.query('SELECT * FROM contacts WHERE id=$1', [contactId])).rows[0]).toEqual(beforeContact)
    const afterService = (await pool.query('SELECT * FROM contact_services WHERE id=$1', [first.service.id])).rows[0]
    expect(afterService).toMatchObject({
      outreach_status: 'cooling', cycle_started_at: beforeService.cycle_started_at,
      last_attempt_at: beforeService.last_attempt_at, last_outcome: beforeService.last_outcome,
    })
    expect((await pool.query('SELECT * FROM reactivation_calls WHERE contact_id=$1', [contactId])).rows).toEqual(beforeCalls)
    expect((await pool.query('SELECT * FROM follow_ups WHERE contact_id=$1 ORDER BY id', [contactId])).rows).toEqual(beforeFollowUps)
    await expect(claimPatient(ownerId, ownerId, contactId, enabled())).rejects.toThrow('opted out')
    await pool.query("UPDATE participants SET first_name='Renamed' WHERE id=$1", [callerId])
    await pool.query('DELETE FROM participants WHERE id=$1', [callerId])
    expect((await getPatientServiceHistory(ownerId, contactId))[0]).toMatchObject({
      actor_id: null, actor_name_snapshot: 'Outreach Caller',
    })
  })
  it('rejects invalid reasons, cross-practice identities and active calls without audit or status changes', async () => {
    const service = (await pool.query('SELECT id FROM contact_services WHERE contact_id=$1', [contactId])).rows[0]
    const lease = await claimPatient(ownerId, ownerId, contactId, enabled())
    await pool.query("UPDATE contact_services SET outreach_status='declined' WHERE id=$1", [service.id])
    for (const reason of ['', '   ', 'x'.repeat(1001), null]) {
      await expect(reopenPatientService(ownerId, contactId, service.id, ownerId, reason as string)).rejects.toThrow('reason')
    }
    await expect(reopenPatientService(callerId, contactId, service.id, callerId, 'Wrong practice')).rejects.toThrow('not found')
    await expect(reopenPatientService(ownerId, contactId, service.id, callerId, 'Foreign staff')).rejects.toThrow('Staff member')
    await expect(reopenPatientService(ownerId, contactId, service.id, ownerId, 'Live call')).rejects.toThrow('active call')
    expect(await getPatientServiceHistory(ownerId, contactId)).toEqual([])
    expect((await pool.query('SELECT outreach_status FROM contact_services WHERE id=$1', [service.id])).rows[0].outreach_status).toBe('declined')
    await releasePatient(ownerId, ownerId, contactId, lease.token)
    // A failed audit insert must roll the status change back as well.
    await expect(reopenPatientService(ownerId, contactId, service.id, ownerId, 'Invalid\0reason')).rejects.toThrow()
    expect(await getPatientServiceHistory(ownerId, contactId)).toEqual([])
    expect((await pool.query('SELECT outreach_status FROM contact_services WHERE id=$1', [service.id])).rows[0].outreach_status).toBe('declined')
  })
})
