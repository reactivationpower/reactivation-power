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
import { bookingWindow, isWithinBookingWindow } from '@workspace/shared/booking-window'
import { assertBookingConfirmationConfigured, createBookingConfirmation } from '@/lib/booking-confirmation'
import { withBookingHandoff, withLegacyBooking } from '@/lib/booking-handoff'
export { requestSavedInquiryHelp, checkSavedBooking } from '@/lib/booking-handoff'

export interface AvailabilityResult {
  /** "YYYY-MM-DD" (in the requested timezone) -> ISO slot strings */
  slots: Record<string, string[]>
  configured: boolean
  error?: string
}

const VALID_TZ = new Set<string>(US_TIMEZONES.map((z) => z.value))

/**
 * Availability for the strategy-call calendar, localized to the requested
 * US timezone: from now through the last Saturday the calendar shows.
 */
export async function getAvailability(
  timezone: string,
): Promise<AvailabilityResult> {
  if (!VALID_TZ.has(timezone)) timezone = 'America/New_York'
  if (!ghlConfigured()) {
    return { slots: {}, configured: false }
  }
  const now = Date.now()
  const end = bookingWindow(now, timezone).endMs
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
  bookedSlot?: string
  bookedTimezone?: string
  retrySafe?: boolean
  appointmentId?: string
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
  contactId?: string
  bookingRef?: string
  slot: string
  timezone: string
  productInterest?: string
  funnelSource?: string
}): Promise<BookResult> {
  // Times after the last day the calendar shows are never bookable.
  if (params.slot && Number.isFinite(Date.parse(params.slot)) &&
    !isWithinBookingWindow(Date.parse(params.slot), Date.now(), VALID_TZ.has(params.timezone) ? params.timezone : 'America/New_York'))
    return { ok: false, error: 'That time is no longer available. Pick another.' }
  if (params.bookingRef) {
    if (!params.slot || !Number.isFinite(Date.parse(params.slot)) || Date.parse(params.slot) < Date.now())
      return { ok: false, error: 'That time is no longer available. Pick another.' }
    if (!ghlConfigured()) return { ok: false, error: 'Your inquiry is saved. Scheduling is temporarily unavailable. Please retry shortly.' }
    return withBookingHandoff(params.bookingRef, params.slot, VALID_TZ.has(params.timezone) ? params.timezone : 'America/New_York',
      async (contactId, carried) => bookResolvedCall({ ...params, contactId, productInterest: carried.interest, funnelSource: carried.funnelSource }))
  }
  if (!params.contactId) return { ok: false, error: 'Open the scheduling link provided with your saved inquiry, or contact us through the website for help.' }
  if (params.productInterest && !isProductInterest(params.productInterest))
    return { ok: false, error: 'Select a valid product interest.' }
  if (!ghlConfigured()) return { ok: false, error: 'Scheduling is temporarily unavailable. Your inquiry remains saved. Please retry shortly.' }
  if (!params.slot || !Number.isFinite(Date.parse(params.slot)) || Date.parse(params.slot) < Date.now())
    return { ok: false, error: 'That time is no longer available. Pick another.' }
  return withLegacyBooking(params.contactId, params.slot, VALID_TZ.has(params.timezone) ? params.timezone : 'America/New_York',
    { interest: params.productInterest ?? '', funnelSource: validatedBookingFunnel(params.funnelSource) ?? '' },
    (contactId, carried) => bookResolvedCall({ ...params, contactId, productInterest: carried.interest || undefined, funnelSource: carried.funnelSource }))
}

async function bookResolvedCall(params: {
  contactId?: string; slot: string; timezone: string; productInterest?: string; funnelSource?: string
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
    // The handoff owner commits the local booking and cancels follow-ups using
    // its existing connection before persisting success.

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
      appointmentId,
      ...(funnelSource ? { confirmationToken: createBookingConfirmation(slot, timezone) } : {}),
    }
  } catch (err) {
    console.error('GoHighLevel booking unavailable; check calendar event permission and provider availability')
    return {
      ok: false,
      ...(err && typeof err === 'object' && 'bookingRejected' in err && err.bookingRejected ? { retrySafe: true } : {}),
      error:
        'We could not confirm that appointment. Your inquiry remains saved. Please retry to check its status, or contact us through the website for help.',
    }
  }
}
