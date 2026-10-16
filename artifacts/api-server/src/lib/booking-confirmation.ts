import { createHmac, timingSafeEqual } from 'node:crypto'
import { isUsTimezone, timezoneLabel } from '@workspace/shared/us-timezones'
import { WEBSITE_BOOKING_FUNNEL } from '@workspace/shared/booking-funnel'

interface BookingContext {
  source: typeof WEBSITE_BOOKING_FUNNEL
  slot: string
  timezone: string
  expires: number
}

function signature(payload: string): string {
  const key = process.env.SESSION_SECRET || process.env.SUPABASE_JWT_SECRET
  if (!key) throw new Error('SESSION_SECRET is not set')
  return createHmac('sha256', key).update(`website-booking:${payload}`).digest('base64url')
}

/** Run before booking so configuration errors cannot invite a duplicate retry. */
export function assertBookingConfirmationConfigured(): void {
  signature('configuration-check')
}

/** Issued only once GHL reports a successful appointment. No identity in the URL. */
export function createBookingConfirmation(slot: string, timezone: string): string {
  const context: BookingContext = {
    source: WEBSITE_BOOKING_FUNNEL, slot, timezone,
    expires: Date.parse(slot) + 24 * 60 * 60 * 1000,
  }
  const payload = Buffer.from(JSON.stringify(context)).toString('base64url')
  return `${payload}.${signature(payload)}`
}

export function readBookingConfirmation(token: unknown): {
  confirmed: boolean
  bookedFor: string | null
  timezoneLabel: string | null
} {
  const invalid = { confirmed: false, bookedFor: null, timezoneLabel: null }
  if (typeof token !== 'string' || token.length > 1200) return invalid
  try {
    const parts = token.split('.')
    if (parts.length !== 2) return invalid
    const [payload, signed] = parts
    const expected = Buffer.from(signature(payload))
    const actual = Buffer.from(signed)
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return invalid
    const context = JSON.parse(Buffer.from(payload, 'base64url').toString()) as BookingContext
    if (context.source !== WEBSITE_BOOKING_FUNNEL ||
      typeof context.slot !== 'string' ||
      !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(context.slot) ||
      !Number.isFinite(Date.parse(context.slot)) ||
      !isUsTimezone(context.timezone) ||
      !Number.isFinite(context.expires) || context.expires <= Date.now()) return invalid
    return {
      confirmed: true,
      bookedFor: new Intl.DateTimeFormat('en-US', {
        timeZone: context.timezone, dateStyle: 'full', timeStyle: 'short',
      }).format(new Date(context.slot)),
      timezoneLabel: timezoneLabel(context.timezone),
    }
  } catch {
    return invalid
  }
}
