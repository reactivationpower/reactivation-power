import {
  addGhlContactNote,
  bookGhlAppointment,
  getGhlContactName,
  getGhlFreeSlots,
  ghlConfigured,
  setGhlContactCustomField,
} from '@/lib/ghl'
import { US_TIMEZONES } from '@workspace/shared/us-timezones'
import { isProductInterest, PRODUCT_INTEREST_LABELS } from '@workspace/shared/lead-validation'
import { validatedBookingFunnel } from '@workspace/shared/booking-funnel'
import { assertBookingConfirmationConfigured, createBookingConfirmation } from '@/lib/booking-confirmation'
import { activity, stop, transaction } from '@/lib/sales-leads/store'
import { bookingOutcome } from '@/lib/marketing/outcomes'
const BOOKING_WINDOW_DAYS = 45

export interface AvailabilityResult {
  /** "YYYY-MM-DD" (in the requested timezone) -> ISO slot strings */
  slots: Record<string, string[]>
  configured: boolean
  error?: string
}

const VALID_TZ = new Set<string>(US_TIMEZONES.map((z) => z.value))

/**
 * Rolling 45-day availability for the strategy-call calendar,
 * localized to the requested US timezone.
 */
export async function getAvailability(
  timezone: string,
): Promise<AvailabilityResult> {
  if (!VALID_TZ.has(timezone)) timezone = 'America/New_York'
  if (!ghlConfigured()) {
    return { slots: {}, configured: false }
  }
  const now = Date.now()
  const end = now + BOOKING_WINDOW_DAYS * 24 * 60 * 60 * 1000
  try {
    const slots = await getGhlFreeSlots({
      startMs: now,
      endMs: end,
      timezone,
    })
    return { slots, configured: true }
  } catch (err) {
    console.error('GoHighLevel availability unavailable; check calendar read permission')
    return {
      slots: {},
      configured: true,
      error: 'Could not load availability. Please try again.',
    }
  }
}

export interface BookResult {
  ok: boolean
  error?: string
  confirmationToken?: string
}

const TZ_ABBREV: Record<string, string> = {
  'America/New_York': 'ET',
  'America/Chicago': 'CT',
  'America/Denver': 'MT',
  'America/Phoenix': 'AZ',
  'America/Los_Angeles': 'PT',
  'America/Anchorage': 'AKT',
  'Pacific/Honolulu': 'HT',
}

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'
  return `${n}${suffix}`
}

/**
 * Format a slot for the GHL "Appointment Date And Time" custom field:
 * "Wednesday, Aug. 21st, 2026 at 11:00 AM ET"
 */
function formatAppointmentField(slot: string, timezone: string): string {
  const date = new Date(slot)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(date)
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? ''
  const month = get('month').replace(/\.$/, '')
  // Abbreviated months get a period; "May" (never abbreviated) does not
  const dot = month === 'May' ? '' : '.'
  const day = ordinal(Number(get('day')))
  const time = `${get('hour')}:${get('minute')} ${get('dayPeriod')}`
  const tz = TZ_ABBREV[timezone] ?? ''
  return `${get('weekday')}, ${month}${dot} ${day}, ${get('year')} at ${time}${tz ? ` ${tz}` : ''}`
}

/**
 * Book the chosen slot for the GHL contact, confirmed by default,
 * and drop a submission note on the contact.
 */
export async function bookStrategyCall(params: {
  contactId: string
  slot: string
  timezone: string
  productInterest?: string
  funnelSource?: string
}): Promise<BookResult> {
  const contactId = params.contactId?.trim().slice(0, 64)
  const slot = params.slot?.trim()
  const timezone = VALID_TZ.has(params.timezone)
    ? params.timezone
    : 'America/New_York'
  const productInterest = params.productInterest
  const validatedInterest = productInterest && isProductInterest(productInterest)
    ? productInterest
    : undefined
  if (productInterest && !validatedInterest) {
    return { ok: false, error: 'Select a valid product interest.' }
  }

  if (!contactId) {
    return {
      ok: false,
      error:
        'We could not find your info. Please go back and fill out the form again.',
    }
  }
  // Slot must be an ISO datetime with offset, in the future
  if (!slot || Number.isNaN(Date.parse(slot)) || Date.parse(slot) < Date.now()) {
    return { ok: false, error: 'That time is no longer available. Pick another.' }
  }
  if (!ghlConfigured()) {
    return { ok: false, error: 'Scheduling is not available right now.' }
  }

  try {
    const funnelSource = validatedBookingFunnel(params.funnelSource)
    if (funnelSource) assertBookingConfirmationConfigured()
    // Pull the contact's real name from GHL so the calendar event reads
    // "Patient Pipeline Strategy Call w/ First Last". If the lookup
    // fails, fall back to the plain title — never block the booking.
    const contactName = await getGhlContactName(contactId).catch(() => null)
    const title = contactName
      ? `Patient Pipeline Strategy Call w/ ${contactName}`
      : 'Patient Pipeline Strategy Call'

    const appointmentId = await bookGhlAppointment({
      contactId,
      startTime: slot,
      title,
    })
    await transaction(async c => {
      const lead = (await c.query('SELECT id FROM sales_leads WHERE ghl_contact_id=$1', [contactId])).rows[0]
      if (!lead) return
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`sales-send:${lead.id}`])
      await c.query("UPDATE sales_leads SET stage='Strategy Call Booked',appointment_status='confirmed',revision=revision+1 WHERE id=$1", [lead.id])
      await stop(c, lead.id, 'appointment_received')
      await activity(c, lead.id, { kind: 'appointment', body: `${title} — ${slot}`, status: 'confirmed', providerId: appointmentId || undefined, dedupeKey: `booking:${appointmentId || contactId + slot}` })
    }).catch(() => console.error('Appointment saved in GoHighLevel; local timeline awaits reconciliation'))
    const marketingLead = (await import('@workspace/db')).pool
    void marketingLead.query('SELECT id FROM sales_leads WHERE ghl_contact_id=$1', [contactId])
      .then(result => result.rows.length === 1 ? bookingOutcome(result.rows[0].id, appointmentId || contactId + slot) : undefined)
      .catch(() => {})

    // Fill the "Appointment Date And Time" custom field on the contact,
    // e.g. "Wednesday, Aug. 21st, 2026 at 11:00 AM ET" — used in GHL
    // automations via {{contact.appointment_date_and_time}}.
    await setGhlContactCustomField(
      contactId,
      'contact.appointment_date_and_time',
      formatAppointmentField(slot, timezone),
    ).catch((err) => {
      // The appointment is booked — a failed field write should not fail the flow
      console.error('GoHighLevel booking context update unavailable; provider appointment remains saved')
    })

    const pretty = new Intl.DateTimeFormat('en-US', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: timezone,
    }).format(new Date(slot))

    await addGhlContactNote(
      contactId,
      [
        'STRATEGY CALL BOOKED — Patient Pipeline',
        '',
        `Time: ${pretty} (${timezone.replace('_', ' ')})`,
        `Booked from: /healthcare/book-a-call`,
        `Status: Confirmed`,
        ...(validatedInterest ? [`Interested in: ${PRODUCT_INTEREST_LABELS[validatedInterest]}`] : []),
        `Booked at: ${new Date().toISOString()}`,
      ].join('\n'),
    ).catch((err) => {
      // The appointment is booked — a failed note should not fail the flow
      console.error('GoHighLevel booking note unavailable; provider appointment remains saved')
    })

    return {
      ok: true,
      ...(funnelSource ? { confirmationToken: createBookingConfirmation(slot, timezone) } : {}),
    }
  } catch (err) {
    console.error('GoHighLevel booking unavailable; check calendar event permission and provider availability')
    return {
      ok: false,
      error:
        'That time may have just been taken. Pick another time and try again.',
    }
  }
}
