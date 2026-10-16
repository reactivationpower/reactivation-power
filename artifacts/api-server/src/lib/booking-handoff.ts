import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { pool } from '@workspace/db'
import { appointments } from './sales-leads/provider'
import { nudgeSalesSync } from './sales-leads/dispatch'
import { getGhlFreeSlots } from './ghl'
import { bookingWindow } from '@workspace/shared/booking-window'
import { activity, stop, intake, transaction } from './sales-leads/store'
import { bookingOutcome } from './marketing/outcomes'
import { runAfterResponse } from './after-response'
import { AFTER_RESPONSE_BUDGET_MS } from './cron/budget'

const TTL = 7 * 24 * 60 * 60 * 1000
export const handoffHash = (ref: string) => createHash('sha256').update(ref).digest('hex')
export function newBookingHandoff(carried: Record<string, string>) {
  const ref = randomBytes(24).toString('base64url')
  return { ref, context: { hash: handoffHash(ref), expires: Date.now() + TTL, carried } }
}

/** Only a random bearer reference grants access; never look up by a name or record ID.
 * Context lives in the same durable submission/review as the inquiry, so issuance
 * cannot fail after saving it and requires no additional configuration or migration. */
export async function readBookingHandoff(ref: string) {
  if (!/^[A-Za-z0-9_-]{32}$/.test(ref)) return null
  const hash = handoffHash(ref)
  const saved = (await pool.query(`SELECT id, lead_id, context, false AS review FROM sales_submissions
    WHERE context->'bookingHandoff'->>'hash'=$1
    UNION ALL
    SELECT id, NULL AS lead_id, submission->'context' AS context, true AS review
    FROM sales_merge_reviews WHERE state='pending' AND submission->'context'->'bookingHandoff'->>'hash'=$1 LIMIT 1`, [hash])).rows[0]
  if (!saved || !(saved.context.bookingHandoff.expires > Date.now())) return null
  return saved
}

export const SAVED_HELP = 'Your inquiry is saved. Our team needs to verify the contact details before booking. Please contact us through the website for help; you do not need to submit the form again.'
export const INVALID_HANDOFF = 'This scheduling link is invalid or has expired. If you already submitted an inquiry, it remains saved. Please contact us through the website for a new scheduling link.'
export async function checkSavedBooking(ref: string) {
  const saved = await readBookingHandoff(ref)
  if (!saved) return { ok: false, error: INVALID_HANDOFF }
  if (saved.review) return { ok: false, error: SAVED_HELP }
  const handoff = saved.context.bookingHandoff
  if (!handoff.pending && !handoff.result?.ok)
    return { ok: false, error: 'No appointment has been confirmed for this inquiry yet. Choose a time below, or request scheduling help.' }
  // Deliberately bypass availability and future-slot validation: a previously
  // accepted appointment may have disappeared from availability or be in the past.
  return withBookingHandoff(ref, handoff.slot, handoff.timezone, async () => {
    throw new Error('Status checks must never create an appointment')
  })
}
type BookingOperation = (contactId: string, carried: Record<string, string>) =>
  Promise<{ ok: boolean; error?: string; confirmationToken?: string; retrySafe?: boolean; appointmentId?: string }>

/** Session lock shares the worker's lock namespace, but lets us durably record
 * an attempt BEFORE the external write. A process crash cannot erase that marker. */
export async function withBookingHandoff(
  ref: string, slot: string, timezone: string,
  book: BookingOperation,
) {
  const saved = await readBookingHandoff(ref)
  if (!saved) return { ok: false, error: INVALID_HANDOFF }
  if (saved.review) return { ok: false, error: SAVED_HELP }
  return withSavedBooking(saved, slot, timezone, book)
}

/** Older cid links remain usable, but only against a saved, unambiguous local
 * inquiry. No contact details are returned to the caller of this action. */
export async function withLegacyBooking(contactId: string, slot: string, timezone: string, carried: Record<string, string>, book: BookingOperation) {
  const lookup = async () => (await pool.query(`SELECT s.* FROM sales_submissions s JOIN sales_leads l ON l.id=s.lead_id
    WHERE l.ghl_contact_id=$1 ORDER BY s.submitted_at DESC LIMIT 1`, [contactId])).rows[0]
  let saved = await lookup()
  if (!saved) {
    // Pre-CRM links can still be tied to their original saved landing inquiry.
    // POST only; neither a GET nor a first name can create/recover a contact.
    const old = (await pool.query('SELECT * FROM landing_leads WHERE ghl_contact_id=$1 ORDER BY created_at DESC LIMIT 1', [contactId])).rows[0]
    if (old) {
      const recovered = await intake({
        firstName: old.first_name, lastName: old.last_name, email: old.email, phone: old.phone,
        practiceName: old.practice_name ?? '', source: 'website', sourcePath: old.source_path ?? '/healthcare',
        historical: true, providerId: contactId, dedupeKey: `legacy-booking:${old.id}`,
        context: { legacySourcePath: old.source_path, services: old.services, bookingRecovery: true },
      })
      if (recovered.review) return { ok: false, error: SAVED_HELP }
      saved = await lookup()
    }
  }
  if (!saved) return { ok: false, error: 'This older scheduling link needs assistance. Your inquiry may already be saved. Please contact us through the website to schedule without submitting again.' }
  return withSavedBooking(saved, slot, timezone, book, carried)
}

export const CONTACT_PENDING = 'Your inquiry is saved. Contact synchronization is still pending. Retry Confirm shortly, or contact us through the website for help.'
const CONTACT_WAIT_MS = 15000
const CONTACT_PENDING_RESULT = { ok: false, error: CONTACT_PENDING, contactPending: true } as const

/** A visitor can press Confirm moments after submitting the form, before the
 * background contact sync has finished. Wait briefly for that sync, but never
 * while holding the lead lock: the sync worker needs the same lock to save the
 * contact ID. Booking still never writes a contact itself. */
async function withSavedBooking(saved: any, slot: string, timezone: string, book: BookingOperation, legacyCarried?: Record<string, string>) {
  const deadline = Date.now() + CONTACT_WAIT_MS
  for (;;) {
    const result: any = await attemptSavedBooking(saved, slot, timezone, book, legacyCarried)
    if (!result?.contactPending) return result
    if (Date.now() >= deadline || !(await waitForContactSync(saved.lead_id, deadline))) {
      return { ok: false, error: CONTACT_PENDING }
    }
  }
}

/** True once the lead has a contact ID; false if the sync stops being active
 * (failed/uncertain/backed off) or the deadline passes. */
async function waitForContactSync(leadId: string, deadline: number) {
  nudgeSalesSync()
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 400))
    const row = (await pool.query(`SELECT l.ghl_contact_id IS NOT NULL AS ready, EXISTS(SELECT 1 FROM sales_jobs j
      WHERE j.lead_id=l.id AND j.kind='contact_sync' AND (j.state='sending' OR (j.state='pending' AND j.due_at<=now()))) AS active
      FROM sales_leads l WHERE l.id=$1`, [leadId])).rows[0]
    if (!row) return false
    if (row.ready) return true
    if (!row.active) return false
  }
  return false
}

async function attemptSavedBooking(saved: any, slot: string, timezone: string, book: BookingOperation, legacyCarried?: Record<string, string>) {
  const c = await pool.connect()
  const key = `sales-send:${saved.lead_id}`
  let outcomeId: string | undefined
  try {
    await c.query('SELECT pg_advisory_lock(hashtextextended($1,0))', [key])
    const row = (await c.query('SELECT context FROM sales_submissions WHERE id=$1', [saved.id])).rows[0]
    const lead = (await c.query('SELECT * FROM sales_leads WHERE id=$1', [saved.lead_id])).rows[0]
    if (!lead) return { ok: false, error: SAVED_HELP }
    const contextKey = legacyCarried ? 'legacyBooking' : 'bookingHandoff'
    const handoff = row.context[contextKey] ?? {
      expires: Date.now() + TTL, carried: legacyCarried,
    }
    if (!(handoff.expires > Date.now())) return { ok: false, error: INVALID_HANDOFF }
    if (handoff.result?.ok) return { ...handoff.result, bookedSlot: handoff.slot, bookedTimezone: handoff.timezone }
    const otherPending = (await c.query(`SELECT id FROM sales_submissions WHERE lead_id=$1 AND
      ((id<>$2 AND context->'bookingHandoff'->>'pending'='true' AND context->'bookingHandoff'->'result'->>'ok' IS DISTINCT FROM 'true')
       OR (id<>$2 AND context->'legacyBooking'->>'pending'='true' AND context->'legacyBooking'->'result'->>'ok' IS DISTINCT FROM 'true')
       OR (id=$2 AND context->$3->>'pending'='true' AND context->$3->'result'->>'ok' IS DISTINCT FROM 'true')) LIMIT 1`,
      [saved.lead_id, saved.id, legacyCarried ? 'bookingHandoff' : 'legacyBooking'])).rows[0]
    if (otherPending) return { ok: false, error: 'Another scheduling attempt for your inquiry is still being checked. Please use the original scheduling link or contact us through the website before booking again.' }
    let contactId = lead.ghl_contact_id
    if (!contactId) {
      const uncertain = (await c.query("SELECT id FROM sales_jobs WHERE lead_id=$1 AND kind='contact_sync' AND state='uncertain' LIMIT 1", [lead.id])).rows[0]
      if (uncertain) return { ok: false, error: SAVED_HELP }
      // Booking never owns a separate contact write. Reuse intake's durable job;
      // only legacy inquiries without outstanding work need a new job.
      // The shared lead lock is held, and these queries autocommit.
      await c.query(`INSERT INTO sales_jobs(id,lead_id,kind,dedupe_key)
        SELECT $1,$2,'contact_sync',$3 WHERE NOT EXISTS
          (SELECT 1 FROM sales_jobs WHERE lead_id=$2 AND kind='contact_sync'
            AND state IN ('pending','sending','failed','uncertain'))
        ON CONFLICT(dedupe_key) DO NOTHING`, [randomUUID(), lead.id, `booking-contact:${lead.id}`])
      return CONTACT_PENDING_RESULT
    }
    const persist = async () => {
      await c.query(`UPDATE sales_submissions SET context=jsonb_set(context,$3::text[],$2::jsonb) WHERE id=$1`,
        [saved.id, JSON.stringify(handoff), [contextKey]])
    }
    const complete = async (result: Awaited<ReturnType<BookingOperation>>, appointmentId: string) => {
      await c.query('BEGIN')
      try {
        await c.query("UPDATE sales_leads SET stage='Strategy Call Booked',appointment_status='confirmed',revision=revision+1 WHERE id=$1", [lead.id])
        await stop(c, lead.id, 'appointment_received')
        const { registerAppointment } = await import('./appointment-messages/store')
        await registerAppointment(c, appointmentId, lead.id, handoff.slot, handoff.timezone)
        await activity(c, lead.id, { kind: 'appointment', status: 'confirmed', providerId: appointmentId, dedupeKey: `booking:${appointmentId}` })
        handoff.result = result
        await persist()
        await c.query('COMMIT')
        outcomeId = appointmentId
      } catch (error) {
        await c.query('ROLLBACK')
        throw error // Keep the durable pending marker for explicit reconciliation.
      }
    }
    if (handoff.pending) {
      // Never blindly repeat an uncertain write, even if the provider's list is
      // eventually consistent. Only an exact confirmed event can resolve it.
      const events = await appointments(contactId)
      const match = events.find((event: any) =>
        event.calendarId === process.env.GHL_CALENDAR_ID &&
        Date.parse(event.startTime) === Date.parse(handoff.slot) &&
        event.appointmentStatus === 'confirmed' && event.id)
      if (!match) return { ok: false, error: 'Your inquiry is saved. A previous booking may still be processing. Retry shortly to check its status, or contact us through the website. We will not create a duplicate appointment.' }
      const { createBookingConfirmation } = await import('./booking-confirmation')
      const { validatedBookingFunnel } = await import('@workspace/shared/booking-funnel')
      const result = { ok: true, ...(validatedBookingFunnel(handoff.carried.funnelSource)
        ? { confirmationToken: createBookingConfirmation(handoff.slot, handoff.timezone) } : {}) }
      await complete(result, match.id)
      return { ...handoff.result, bookedSlot: handoff.slot, bookedTimezone: handoff.timezone }
    }
    const { assertBookingConfirmationConfigured } = await import('./booking-confirmation')
    const { validatedBookingFunnel } = await import('@workspace/shared/booking-funnel')
    if (validatedBookingFunnel(handoff.carried.funnelSource)) assertBookingConfirmationConfigured()
    const slots = await getGhlFreeSlots({ startMs: Date.now(), endMs: bookingWindow(Date.now(), timezone).endMs, timezone })
    if (!Object.values(slots).flat().some(value => Date.parse(value) === Date.parse(slot)))
      return { ok: false, error: 'That time is no longer available. Pick another time.' }
    handoff.slot = slot
    handoff.timezone = timezone
    handoff.pending = true
    await persist()
    const result = await book(contactId, handoff.carried)
    // A failure may be a lost provider response. Retain the marker and reconcile
    // rather than offering another write. Preflight failures happen before here.
    if (result.ok) await complete(result, result.appointmentId || contactId + slot)
    else if (result.retrySafe) { handoff.pending = false; await persist() }
    return result
  } catch {
    return { ok: false, error: 'Your inquiry is saved. Scheduling is temporarily unavailable. Retry shortly to check your booking, or contact us through the website for help.' }
  } finally {
    try { await c.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [key]); c.release() }
    catch { c.release(true) } // Never return a possibly locked session to the pool.
    if (outcomeId) {
      await bookingOutcome(saved.lead_id, outcomeId)
      // Confirmation messages right after the booking; bounded, and the
      // five-minute worker reconciles anything this does not finish.
      const { runAppointmentMessages } = await import('./appointment-messages/worker')
      void runAfterResponse('post-booking appointment messages', () => runAppointmentMessages(Date.now() + AFTER_RESPONSE_BUDGET_MS))
    }
  }
}

/** No messages are sent: the existing internal sales timeline/review queue is
 * the durable help inbox. Duplicate clicks create only one activity. */
export async function requestSavedInquiryHelp(ref: string) {
  const saved = await readBookingHandoff(ref)
  if (!saved) return { ok: false, error: INVALID_HANDOFF }
  if (saved.review) return { ok: true, message: 'Your saved inquiry is already in our contact-review queue. No new form is needed.' }
  await transaction(async c => {
    await activity(c, saved.lead_id, { kind: 'note', body: 'Visitor requested help scheduling their saved inquiry. Please follow up.', dedupeKey: `booking-help:${saved.id}` })
  })
  return { ok: true, message: 'Your scheduling help request is saved for our team. No new form is needed.' }
}
