import { pool, type PoolClient } from '@workspace/db'
import { createHash } from 'node:crypto'
import { scheduleMessages, type MessageKind } from './schedule'
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
export async function reconcileAppointment(c: PoolClient, row: any, event: any, smsZone: string | null, now = new Date()) {
  const status = eventState(event)
  const start = new Date(event.startTime)
  if (!Number.isFinite(+start)) throw new Error('Appointment time could not be verified')
  const snapshot = { start: start.toISOString(), hostId: event.assignedUserId, meetingUrl: meetLink(event.address), status, smsZone }
  const fingerprint = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')
  if (fingerprint === row.fingerprint) return
  const version = row.version + 1
  const previous = row.snapshot
  // A link becoming available or a zone correction should not generate a second confirmation.
  const substantialChange = previous?.start !== snapshot.start || previous?.hostId !== snapshot.hostId || previous?.status !== snapshot.status
  const sentInitial = (await c.query(`SELECT 1 FROM appointment_deliveries WHERE appointment_id=$1 AND kind IN ('confirmation','rescheduled')
    AND state IN ('sent','uncertain','sending') LIMIT 1`, [row.appointment_id])).rowCount
  const kind: MessageKind = status === 'cancelled' ? 'cancelled' : sentInitial && substantialChange ? 'rescheduled' : 'confirmation'
  await c.query('BEGIN')
  try {
    await c.query("UPDATE appointment_deliveries SET state='cancelled',last_error='Appointment changed' WHERE appointment_id=$1 AND state IN ('pending','blocked')", [row.appointment_id])
    await c.query(`UPDATE appointment_messages SET starts_at=$2,version=$3,fingerprint=$4,snapshot=$5,last_error=NULL WHERE appointment_id=$1`,
      [row.appointment_id, start, version, fingerprint, JSON.stringify(snapshot)])
    if (status !== 'hold' && (start > now || status === 'cancelled')) {
      let slots = scheduleMessages(now, start, smsZone, kind)
      if (sentInitial && !substantialChange) slots = slots.filter(s => s.kind !== 'confirmation')
      // Reconciliation must not re-send a reminder just because a link/host changed.
      for (const slot of slots) {
        if (slot.kind === 'day_before' || slot.kind === 'final') {
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
