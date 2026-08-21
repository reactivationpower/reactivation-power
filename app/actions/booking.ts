'use server'

import {
  addGhlContactNote,
  bookGhlAppointment,
  getGhlContactName,
  getGhlFreeSlots,
  ghlConfigured,
  setGhlContactCustomField,
} from '@/lib/ghl'

const BOOKING_WINDOW_DAYS = 45

export interface AvailabilityResult {
  /** "YYYY-MM-DD" (in the requested timezone) -> ISO slot strings */
  slots: Record<string, string[]>
  configured: boolean
  error?: string
}

const VALID_TZ = new Set([
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
])

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
    console.error('[v0] GHL availability fetch failed:', err)
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
}): Promise<BookResult> {
  const contactId = params.contactId?.trim().slice(0, 64)
  const slot = params.slot?.trim()
  const timezone = VALID_TZ.has(params.timezone)
    ? params.timezone
    : 'America/New_York'

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
    // Pull the contact's real name from GHL so the calendar event reads
    // "Reactivation Power Strategy Call w/ First Last". If the lookup
    // fails, fall back to the plain title — never block the booking.
    const contactName = await getGhlContactName(contactId).catch(() => null)
    const title = contactName
      ? `Reactivation Power Strategy Call w/ ${contactName}`
      : 'Reactivation Power Strategy Call'

    await bookGhlAppointment({
      contactId,
      startTime: slot,
      title,
    })

    // Fill the "Appointment Date And Time" custom field on the contact,
    // e.g. "Wednesday, Aug. 21st, 2026 at 11:00 AM ET" — used in GHL
    // automations via {{contact.appointment_date_and_time}}.
    await setGhlContactCustomField(
      contactId,
      'contact.appointment_date_and_time',
      formatAppointmentField(slot, timezone),
    ).catch((err) => {
      // The appointment is booked — a failed field write should not fail the flow
      console.error('[v0] GHL custom field update failed:', err)
    })

    const pretty = new Intl.DateTimeFormat('en-US', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: timezone,
    }).format(new Date(slot))

    await addGhlContactNote(
      contactId,
      [
        'STRATEGY CALL BOOKED — Reactivation Power',
        '',
        `Time: ${pretty} (${timezone.replace('_', ' ')})`,
        `Booked from: /healthcare/book-a-call`,
        `Status: Confirmed`,
        `Booked at: ${new Date().toISOString()}`,
      ].join('\n'),
    ).catch((err) => {
      // The appointment is booked — a failed note should not fail the flow
      console.error('[v0] GHL booking note failed:', err)
    })

    return { ok: true }
  } catch (err) {
    console.error('[v0] GHL booking failed:', err)
    return {
      ok: false,
      error:
        'That time may have just been taken. Pick another time and try again.',
    }
  }
}
