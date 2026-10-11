import { pool, type PoolClient } from '@workspace/db'
import { createHash } from 'node:crypto'
import { REMINDER_KINDS, scheduleMessages, type MessageKind } from './schedule'
export const APPOINTMENT_LOCK = 'appointment-message-worker'
export async function appointmentSettings(c: Pick<PoolClient, 'query'> = pool) {
  await c.query("INSERT INTO appointment_message_settings(id) VALUES('strategy') ON CONFLICT DO NOTHING")
  return (await c.query("SELECT * FROM appointment_message_settings WHERE id='strategy'")).rows[0]
}
/** Called inside booking's existing transaction. No network or sending here. */
export async function registerAppointment(c: PoolClient, appointmentId: string, leadId: string, start: string, timezone: string) {
  const cfg = await appointmentSettings(c)
  if (!cfg.enabled) return // No retroactive confirmations or historical backfill.
  await c.query(`INSERT INTO appointment_messages(appointment_id,lead_id,starts_at,timezone) VALUES($1,$2,$3,$4)
    ON CONFLICT(appointment_id) DO NOTHING`, [appointmentId, leadId, start, timezone])
}
export function meetLink(value: unknown): string {
  if (typeof value !== 'string') return ''
  const match = value.match(/https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}(?=$|[?\s<])/i)
  return match?.[0] ?? ''
}
export function eventState(event: any) {
  const status = String(event?.appointmentStatus ?? '').toLowerCase()
  if (['cancelled', 'canceled', 'invalid'].includes(status) || event?.deleted === true) return 'cancelled'
  if (status === 'confirmed' || status === 'new') return 'scheduled'
  return 'hold' // No reminders for no-show, showed, unknown or unrecognized states.
}
export async function reconcileAppointment(c: PoolClient, row: any, event: any, smsZone: string | null, now = new Date(), smsEnabled = false) {
  const status = eventState(event)
  const start = new Date(event.startTime ?? (status === 'cancelled' ? row.starts_at : ''))
  if (!Number.isFinite(+start)) throw new Error('Appointment time could not be verified')
  const snapshot = { start: start.toISOString(), hostId: event.assignedUserId ?? (status === 'cancelled' ? row.snapshot?.hostId : undefined), meetingUrl: meetLink(event.address), status, smsZone, smsEnabled }
  const fingerprint = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')
  if (fingerprint === row.fingerprint) return
  const version = row.version + 1
  const previous = row.snapshot
  // A link becoming available or a zone correction should not generate a second confirmation.
  const attempted = (await c.query(`SELECT channel,kind,snapshot FROM appointment_deliveries WHERE appointment_id=$1
    AND state IN ('sent','uncertain','sending')`, [row.appointment_id])).rows
  const sentInitial = attempted.some(d => ['confirmation','rescheduled'].includes(d.kind))
  const kind: MessageKind = status === 'cancelled' ? 'cancelled' : sentInitial ? 'rescheduled' : 'confirmation'
  // A "time changed" notice is only true when the time or host differs from a
  // notice already attempted. Turning on reminder texts, a new link or a zone
  // fix must never send an "updated call time" message for an unchanged call.
  const timeChanged = attempted.some(d => ['confirmation','rescheduled'].includes(d.kind) &&
    (d.snapshot?.copy?.start !== snapshot.start || (d.snapshot?.copy?.hostId ?? previous?.hostId) !== snapshot.hostId))
  await c.query('BEGIN')
  try {
    const pending = (await c.query(`SELECT kind,channel,due_at,expires_at FROM appointment_deliveries
      WHERE appointment_id=$1 AND state IN ('pending','blocked') AND kind = ANY($2)`,
      [row.appointment_id, [...REMINDER_KINDS, 'confirmation', 'rescheduled']])).rows
    await c.query("UPDATE appointment_deliveries SET state='cancelled',last_error='Appointment changed' WHERE appointment_id=$1 AND state IN ('pending','blocked')", [row.appointment_id])
    await c.query(`UPDATE appointment_messages SET starts_at=$2,version=$3,fingerprint=$4,snapshot=$5,last_error=NULL WHERE appointment_id=$1`,
      [row.appointment_id, start, version, fingerprint, JSON.stringify(snapshot)])
    if (status !== 'hold' && (start > now || status === 'cancelled')) {
       let slots = scheduleMessages(now, start, smsZone, kind).filter(s => (smsEnabled || s.channel === 'email') &&
         !(s.kind === 'rescheduled' && !timeChanged))
       // Metadata-only refreshes must not erase an already scheduled reminder
       // simply because its original booking is now less than an hour away,
       // nor a booking text still waiting for 8 AM (only queued ones are kept,
       // so turning texts on later never creates a retroactive confirmation).
       const initial = (k: string) => k === 'confirmation' || k === 'rescheduled'
       if (previous?.start === snapshot.start && previous?.hostId === snapshot.hostId &&
           previous?.status === 'scheduled' && status === 'scheduled') {
         for (const p of pending) if ((smsEnabled || p.channel === 'email') && new Date(p.expires_at) > now &&
           !slots.some(s => s.channel === p.channel && (s.kind === p.kind || initial(s.kind) && initial(p.kind)))) {
           slots.push({ kind: p.kind, channel: p.channel, dueAt: new Date(p.due_at), expiresAt: new Date(p.expires_at) })
         }
       }
       // Deduplicate per channel and actual sent snapshot, not the last reconciled
       // version: a second reschedule can arrive while the first is still queued.
       slots = slots.filter(slot => {
         if (!['confirmation','rescheduled','cancelled'].includes(slot.kind)) return true
         return !attempted.some(d => d.channel === slot.channel &&
           (slot.kind === 'cancelled' ? d.kind === 'cancelled' && previous?.status === 'cancelled' :
             ['confirmation','rescheduled'].includes(d.kind) &&
             d.snapshot?.copy?.start === snapshot.start &&
             (d.snapshot?.copy?.hostId ?? previous?.hostId) === snapshot.hostId))
       })
      // Reconciliation must not re-send a reminder just because a link/host changed.
      for (const slot of slots) {
        if (REMINDER_KINDS.includes(slot.kind)) {
          const prior = (await c.query(`SELECT 1 FROM appointment_deliveries WHERE appointment_id=$1 AND kind=$2 AND channel=$3
            AND state IN ('sent','uncertain','sending') AND snapshot->'copy'->>'start'=$4 LIMIT 1`,
            [row.appointment_id, slot.kind, slot.channel, snapshot.start])).rowCount
          if (prior) continue
        }
        await c.query(`INSERT INTO appointment_deliveries(id,appointment_id,version,kind,channel,due_at,expires_at)
          VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
          [`${row.appointment_id}:${version}:${slot.kind}:${slot.channel}`, row.appointment_id, version, slot.kind, slot.channel, slot.dueAt, slot.expiresAt])
      }
    }
    await c.query('COMMIT')
    Object.assign(row, { version, fingerprint, snapshot, starts_at: start })
  } catch (e) { await c.query('ROLLBACK'); throw e }
}
