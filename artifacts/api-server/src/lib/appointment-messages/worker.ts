import { pool, type PoolClient } from '@workspace/db'
import { provider, contact, SalesProviderError, textContactFor, textsBlocked } from '../sales-leads/provider'
import { settings } from '../sales-leads/store'
import { schedulerHealthy } from '../sales-leads/wake'
import { getAdminUserById } from '../data/admin-users'
import { sendEmail, fromAddress } from '../mail/send'
import { PUBLIC_APP_ORIGIN } from '../app-origin'
import { logger } from '../logger'
import { APPOINTMENT_LOCK, AppointmentCheckError, appointmentSettings, reconcileAppointment } from './store'
import { MINUTE, SMS_GAP, nextSmsWindow, smsAllowed } from './schedule'
import { renderAppointmentMessage, type AppointmentCopy } from './content'
import { SALES_REPLY_TO } from '../sales-inbox/store'
import { randomUUID } from 'node:crypto'
import { isVercelPreview } from '../deployment-safety'

function channelBlocked(remote: any, channel: string) {
  return remote?.dnd === true || remote?.dndSettings?.[channel]?.status === 'active'
}
const safeZone = (lead: any) => ['browser','staff'].includes(lead.timezone_origin) ? lead.timezone : null
async function defer(c: PoolClient, id: string, reason: string, due = new Date(Date.now() + 5 * MINUTE)) {
  await c.query("UPDATE appointment_deliveries SET state='blocked',last_error=$2,due_at=$3 WHERE id=$1", [id, reason, due])
}
async function dispatch(c: PoolClient, job: any, row: any, lead: any, smsEnabled: boolean) {
  const cfg = await appointmentSettings(c)
  if (!cfg.enabled) return
  if (job.channel === 'sms' && !smsEnabled) {
    await c.query("UPDATE appointment_deliveries SET state='cancelled',last_error='Automatic appointment texts disabled' WHERE id=$1", [job.id]); return
  }
  const now = new Date()
  if (+new Date(job.expires_at) <= +now) {
    await c.query("UPDATE appointment_deliveries SET state='skipped',last_error='Send window expired' WHERE id=$1", [job.id]); return
  }
  const snap = row.snapshot
  const host = (await c.query('SELECT * FROM appointment_hosts WHERE ghl_user_id=$1 AND active=true', [snap.hostId ?? ''])).rows[0]
  if (!host) return defer(c, job.id, 'Meeting host needs an active messaging profile')
  const user = await getAdminUserById(host.admin_id)
  if (!user?.active || !user.confirmedAt) return defer(c, job.id, 'Host staff account is inactive or unverified')
  if (!snap.meetingUrl && job.kind !== 'cancelled') return defer(c, job.id, 'Waiting for the verified Google Meet link')
  const remote = await contact(lead.ghl_contact_id)
  if (!remote || remote.id !== lead.ghl_contact_id || remote.locationId !== process.env.GHL_LOCATION_ID) throw new AppointmentCheckError('contact could not be verified')
  const sms = job.channel === 'sms'
  // Texts go to the phone the person entered, through whichever GoHighLevel
  // contact holds it (an older contact may already own that phone).
  const textContact = sms ? await textContactFor(lead.phone, lead.ghl_contact_id) : null
  if (sms && !textContact) return defer(c, job.id, 'No GoHighLevel contact could receive texts for this phone')
  if (lead.dnd || lead.stage === 'Lost/Do Not Contact' || (sms ? textsBlocked(textContact) : channelBlocked(remote, 'Email')) || sms && !lead.consent) {
    await c.query("UPDATE appointment_deliveries SET state='skipped',last_error='Consent or do-not-contact restriction' WHERE id=$1", [job.id]); return
  }
  if (sms) {
    const zone = safeZone(lead)
    if (!smsAllowed(now, zone)) {
      const next = nextSmsWindow(now, zone)
      return defer(c, job.id, next ? 'Waiting for 8 AM–8 PM recipient-local window' : 'Verified recipient timezone required', next ?? undefined)
    }
    const last = job.kind === 'starting' ? null : (await c.query(`SELECT sent_at FROM appointment_deliveries d JOIN appointment_messages a USING(appointment_id)
      WHERE a.lead_id=$1 AND d.channel='sms' AND d.state IN ('sent','uncertain')
      AND d.sent_at > now()-make_interval(mins => $2) ORDER BY d.sent_at DESC LIMIT 1`, [lead.id, SMS_GAP])).rows[0]
    if (last) {
      const next = new Date(+new Date(last.sent_at) + SMS_GAP * MINUTE)
      return defer(c, job.id, 'Spacing texts apart', next)
    }
    if (!/^\+[1-9]\d{9,14}$/.test(lead.phone)) return defer(c, job.id, 'Phone number is not valid for texting')
    await c.query('UPDATE sales_leads SET assignee_id=$2,revision=revision+1 WHERE id=$1 AND assignee_id IS DISTINCT FROM $2', [lead.id, host.admin_id])
  } else if (!lead.email || String(remote.email ?? '').toLowerCase() !== lead.email.toLowerCase()) {
    return defer(c, job.id, 'Email identity needs review')
  }
  const accepted = (await c.query(`SELECT 1 FROM appointment_deliveries d LEFT JOIN email_log e ON e.id=d.email_log_id
    WHERE d.appointment_id=$1 AND d.version=$2 AND d.kind='confirmation' AND d.channel='email' AND d.state='sent'
    AND e.status IN ('sent','delivered','opened','clicked') LIMIT 1`, [row.appointment_id, row.version])).rowCount
  const copy: AppointmentCopy = { firstName: lead.first_name, host: host.name, hostId: snap.hostId, start: snap.start, timezone: safeZone(lead) ?? row.timezone,
    meetingUrl: snap.meetingUrl, walkthroughUrl: `${PUBLIC_APP_ORIGIN}/walkthrough`, kind: job.kind, emailAccepted: !!accepted }
  // Freeze all provider inputs before dispatch. A crash after this point is
  // uncertain, never automatically replayed (SMS has no reliable dedupe key).
  const data = job.snapshot ?? { copy, rendered: renderAppointmentMessage(copy), recipient: sms ? lead.phone : lead.email.trim().toLowerCase(),
    from: `${host.name} | Patient Pipeline <${fromAddress().match(/<?([^<>\s]+@patientpipeline\.app)>?$/i)?.[1]}>`, replyTo: SALES_REPLY_TO }
  const emailLogId = sms ? null : randomUUID()
  await c.query("UPDATE appointment_deliveries SET state='sending',claimed_at=now(),attempts=attempts+1,snapshot=$2,email_log_id=$3 WHERE id=$1", [job.id, JSON.stringify(data), emailLogId])
  try {
    let providerId: string | undefined, logId: string | undefined
    if (sms) {
      const result = await provider('/conversations/messages', 'POST', { type: 'SMS', contactId: textContact!.id, message: data.rendered.sms })
      if (!result.messageId) throw new SalesProviderError(0, true)
      providerId = result.messageId
    } else {
      const result = await sendEmail('strategy_appointment', data.recipient, data.copy, {
        deliverySnapshot: { ...data.rendered, from: data.from }, replyTo: SALES_REPLY_TO, idempotencyKey: job.id,
        metadata: { appointmentId: row.appointment_id, deliveryId: job.id },
        logId: emailLogId!, logClient: c,
      })
      logId = result.logId
      if (!result.ok) {
        await c.query("UPDATE appointment_deliveries SET state=$2,email_log_id=$3,last_error=$4,sent_at=CASE WHEN $2='uncertain' THEN now() ELSE NULL END WHERE id=$1",
          [job.id, result.uncertain ? 'uncertain' : 'failed', logId, 'Email was not confirmed accepted; review delivery log'])
        return
      }
      providerId = result.providerId
    }
    await c.query("UPDATE appointment_deliveries SET state='sent',sent_at=now(),provider_id=$2,email_log_id=$3,last_error=NULL WHERE id=$1", [job.id, providerId, logId ?? null])
  } catch (error) {
    const uncertain = !(error instanceof SalesProviderError) || error.uncertain
    await c.query("UPDATE appointment_deliveries SET state=$2,last_error=$3,sent_at=CASE WHEN $2='uncertain' THEN now() ELSE NULL END WHERE id=$1",
      [job.id, uncertain ? 'uncertain' : 'failed', uncertain ? 'Provider acceptance uncertain; do not resend without checking' : 'Provider rejected message; check SMS readiness'])
  }
}

/** GoHighLevel returns `{ appointment: {...} }` (older docs show `event`).
 * Every identity check must pass before anything is planned or sent. */
async function verifiedAppointment(appointmentId: string, contactId: string) {
  const reply = await provider(`/calendars/events/appointments/${encodeURIComponent(appointmentId)}`)
  const event = reply?.appointment ?? reply?.event
  if (!event || typeof event !== 'object') throw new AppointmentCheckError('appointment not found')
  if (event.contactId !== contactId) throw new AppointmentCheckError('contact mismatch')
  if (event.calendarId !== process.env.GHL_CALENDAR_ID) throw new AppointmentCheckError('calendar mismatch')
  if (event.locationId !== undefined && event.locationId !== process.env.GHL_LOCATION_ID) throw new AppointmentCheckError('location mismatch')
  return event
}
/** Short, non-personal reason for the saved error and the server log. */
function pauseReason(error: unknown) {
  if (error instanceof AppointmentCheckError) return error.message
  if (error instanceof SalesProviderError) return error.status === 404 ? 'appointment not found' :
    error.status ? `GoHighLevel request failed (HTTP ${error.status})` : 'GoHighLevel did not respond'
  return 'unexpected error'
}

/** Durable five-minute production wake plus immediate post-booking nudge.
 * Dedicated lock prevents overlap; never sends from preview/dev. */
export async function runAppointmentMessages() {
  if (process.env.NODE_ENV !== 'production' || isVercelPreview()) return
  const c = await pool.connect()
  let locked = false
  try {
    locked = (await c.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS ok', [APPOINTMENT_LOCK])).rows[0].ok
    if (!locked) return
    const cfg = await appointmentSettings(c)
    const capabilities = (await settings(c)).capabilities
    if (!cfg.enabled || !schedulerHealthy(capabilities)) return
    const smsEnabled = capabilities?.appointment_sms?.enabled === true
    // A committed email log is positive acceptance evidence even when the
    // process died before updating its outbox. Everything else stays uncertain.
    await c.query(`UPDATE appointment_deliveries d SET state='sent',provider_id=e.provider_id,
      sent_at=e.created_at,last_error=NULL FROM email_log e WHERE d.email_log_id=e.id
      AND d.channel='email' AND d.state IN ('sending','uncertain') AND e.provider_id IS NOT NULL`)
    await c.query("UPDATE appointment_deliveries SET state='uncertain',last_error='Worker interrupted after dispatch began',sent_at=NULL WHERE state='sending'")
    await c.query("UPDATE appointment_deliveries SET state='skipped',last_error='Send window expired' WHERE state IN ('pending','blocked') AND expires_at<=now()")
    const deadline = Date.now() + 45_000
    const rows = (await c.query(`SELECT * FROM appointment_messages WHERE NOT stopped AND reconcile_at<=now()
       ORDER BY reconcile_at,appointment_id LIMIT 8`)).rows
    for (const row of rows) {
      if (Date.now() >= deadline) break
      // Booked lead's stop/edit and our final send checks share the same lock.
      const key = `sales-send:${row.lead_id}`
      await c.query('SELECT pg_advisory_lock(hashtextextended($1,0))', [key])
      try {
        const lead = (await c.query('SELECT * FROM sales_leads WHERE id=$1', [row.lead_id])).rows[0]
        if (!lead?.ghl_contact_id) throw new AppointmentCheckError('lead has no GoHighLevel contact')
        const event = await verifiedAppointment(row.appointment_id, lead.ghl_contact_id)
        await reconcileAppointment(c, row, event, safeZone(lead), new Date(), smsEnabled)
        await c.query("UPDATE appointment_messages SET last_error=NULL,reconcile_at=now()+interval '5 minutes' WHERE appointment_id=$1", [row.appointment_id])
        const jobs = (await c.query(`SELECT * FROM appointment_deliveries WHERE appointment_id=$1 AND version=$2
          AND state IN ('pending','blocked') AND due_at<=now() ORDER BY due_at,channel LIMIT 6`, [row.appointment_id, row.version])).rows
        for (const job of jobs) await dispatch(c, job, row, lead, smsEnabled)
        if (row.snapshot.status === 'cancelled' || +new Date(row.starts_at) < Date.now()) {
          await c.query(`UPDATE appointment_messages SET stopped=true WHERE appointment_id=$1 AND NOT EXISTS
            (SELECT 1 FROM appointment_deliveries WHERE appointment_id=$1 AND state IN ('pending','blocked','sending'))`, [row.appointment_id])
        }
      } catch (error) {
        // Never interpret an API outage/404 as permission to send stale details.
        const reason = pauseReason(error)
        logger.warn({ appointmentId: row.appointment_id, reason }, 'Appointment messages paused')
        await c.query("UPDATE appointment_messages SET last_error=$2,reconcile_at=now()+interval '5 minutes' WHERE appointment_id=$1",
          [row.appointment_id, `Sending paused: ${reason}`])
      } finally { await c.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [key]) }
    }
  } catch { logger.warn('Appointment-message processing unavailable; no blind replay') }
  finally {
    try { if (locked) await c.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [APPOINTMENT_LOCK]); c.release() }
    catch { c.release(true) }
  }
}
