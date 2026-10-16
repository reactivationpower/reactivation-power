import { createHmac, timingSafeEqual } from 'node:crypto'
import { and, eq, isNotNull, lt, or } from 'drizzle-orm'
import {
  customersTable,
  db,
  onboardingBookingsTable,
  paymentLinkTermsTable,
  salesLeadsTable,
  type OnboardingBooking,
} from '@workspace/db'
import { US_TIMEZONES, timezoneLabel } from '@workspace/shared/us-timezones'
import { bookingWindow, isWithinBookingWindow } from '@workspace/shared/booking-window'
import {
  addGhlContactNote,
  bookGhlAppointment,
  getGhlAppointment,
  getGhlFreeSlots,
  listGhlContactAppointments,
} from '@/lib/ghl'
import { safeSalesUpsert } from '@/lib/sales-leads/provider'
import { getAdminClient } from '@/lib/supabase/admin'
import { appOrigin } from '@/lib/app-origin'
import { logger } from '@/lib/logger'

/**
 * Onboarding meetings: a second GoHighLevel calendar in the same sub-account
 * as the strategy-call calendar. Not a secret, so it lives in code; set the
 * env var only to override it (e.g. a test calendar).
 */
const ONBOARDING_CALENDAR_ID = ''
export const onboardingCalendarId = (): string | null =>
  process.env.GHL_ONBOARDING_CALENDAR_ID?.trim() || ONBOARDING_CALENDAR_ID || null

export function onboardingConfigured(): boolean {
  return Boolean(process.env.GHL_API_TOKEN && process.env.GHL_LOCATION_ID && onboardingCalendarId())
}

const VALID_TZ = new Set<string>(US_TIMEZONES.map((z) => z.value))
const safeTz = (tz: unknown) => (typeof tz === 'string' && VALID_TZ.has(tz) ? tz : 'America/New_York')
const LEASE_MS = 2 * 60_000

// ── Link token (the credential in the emailed scheduling link) ───────────

function signature(linkId: string): string {
  const key = process.env.SESSION_SECRET
  if (!key) throw new Error('SESSION_SECRET is not set')
  return createHmac('sha256', key).update(`onboarding:${linkId}`).digest('base64url').slice(0, 32)
}

export function onboardingRef(linkId: string): string {
  return `${linkId}.${signature(linkId)}`
}

export function onboardingUrl(linkId: string): string {
  return `${appOrigin()}/onboarding?ref=${encodeURIComponent(onboardingRef(linkId))}`
}

export function readOnboardingRef(ref: unknown): string | null {
  if (typeof ref !== 'string' || ref.length > 200) return null
  const dot = ref.lastIndexOf('.')
  if (dot <= 0) return null
  const linkId = ref.slice(0, dot)
  const given = Buffer.from(ref.slice(dot + 1))
  const expected = Buffer.from(signature(linkId))
  return given.length === expected.length && timingSafeEqual(given, expected) ? linkId : null
}

// ── Context ──────────────────────────────────────────────────────────────

interface Context {
  linkId: string
  customerId: string
  firstName: string
  lastName: string
  email: string
  phone: string
  businessName: string
}

async function loadContext(linkId: string): Promise<Context | null> {
  const [terms] = await db.select().from(paymentLinkTermsTable).where(eq(paymentLinkTermsTable.linkId, linkId))
  if (!terms?.completedAt) return null
  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, terms.customerId))
  if (!customer) return null
  const { data: link } = await getAdminClient().from('payment_links').select('name, email, phone').eq('id', linkId).maybeSingle()
  const name = String(link?.name || customer.fullName || '').trim()
  const parts = name.split(/\s+/).filter((w) => !/^(dr|mr|mrs|ms|miss|prof)\.?$/i.test(w))
  return {
    linkId,
    customerId: customer.id,
    firstName: parts[0] ?? '',
    lastName: parts.slice(1).join(' '),
    email: String(link?.email || customer.email).trim().toLowerCase(),
    phone: String(link?.phone || customer.phone || '').trim(),
    businessName: customer.businessName?.trim() || customer.fullName,
  }
}

async function bookingRow(ctx: Context): Promise<OnboardingBooking> {
  await db.insert(onboardingBookingsTable).values({ linkId: ctx.linkId, customerId: ctx.customerId }).onConflictDoNothing()
  const [row] = await db.select().from(onboardingBookingsTable).where(eq(onboardingBookingsTable.linkId, ctx.linkId))
  return row
}

const bookedView = (row: OnboardingBooking) =>
  row.status === 'booked' && row.slot
    ? { slot: row.slot, timezone: safeTz(row.timezone), timezoneLabel: timezoneLabel(safeTz(row.timezone)) }
    : null

/**
 * A booking whose provider write may have gone through: look for an
 * appointment on the onboarding calendar created since the attempt began.
 * Returns the row after reconciling (booked, open again, or still uncertain).
 */
async function reconcile(row: OnboardingBooking): Promise<OnboardingBooking> {
  const calendarId = onboardingCalendarId()
  if (row.status !== 'uncertain' || !row.ghlContactId || !calendarId) return row
  try {
    const since = (row.claimedAt?.getTime() ?? 0) - 60_000
    const found = (await listGhlContactAppointments(row.ghlContactId)).find((e) =>
      e.calendarId === calendarId && !e.deleted && !/cancel|invalid/i.test(e.appointmentStatus ?? '') &&
      Date.parse(e.dateAdded) >= since)
    if (found) {
      const appt = await getGhlAppointment(found.id).catch(() => null)
      const [next] = await db.update(onboardingBookingsTable).set({
        status: 'booked', appointmentId: found.id, slot: appt?.startTime ?? row.slot,
        bookedAt: new Date(), updatedAt: new Date(),
      }).where(and(eq(onboardingBookingsTable.linkId, row.linkId), eq(onboardingBookingsTable.status, 'uncertain'))).returning()
      return next ?? row
    }
    // Nothing saved; after a short settle time the customer may pick again.
    if ((row.claimedAt?.getTime() ?? 0) < Date.now() - LEASE_MS) {
      const [next] = await db.update(onboardingBookingsTable).set({ status: 'open', updatedAt: new Date() })
        .where(and(eq(onboardingBookingsTable.linkId, row.linkId), eq(onboardingBookingsTable.status, 'uncertain'))).returning()
      return next ?? row
    }
  } catch (err) {
    logger.warn({ err, linkId: row.linkId }, 'onboarding booking: reconcile unavailable')
  }
  return row
}

// ── Page data ────────────────────────────────────────────────────────────

export const INVALID_ONBOARDING_LINK =
  'Use the "Schedule my onboarding" button in your onboarding email. If you need help, reply to that email and we will schedule it with you.'

export async function onboardingPage(ref: unknown) {
  const linkId = readOnboardingRef(ref)
  const ctx = linkId ? await loadContext(linkId) : null
  if (!ctx) return { valid: false as const, message: INVALID_ONBOARDING_LINK }
  const row = await reconcile(await bookingRow(ctx))
  return {
    valid: true as const,
    configured: onboardingConfigured(),
    firstName: ctx.firstName,
    businessName: ctx.businessName,
    booked: bookedView(row),
    checking: row.status === 'uncertain' || row.status === 'booking',
  }
}

// ── Availability and booking ─────────────────────────────────────────────

export async function onboardingAvailability(ref: unknown, timezone: string) {
  const tz = safeTz(timezone)
  if (!readOnboardingRef(ref)) return { slots: {}, configured: true, error: INVALID_ONBOARDING_LINK }
  const calendarId = onboardingCalendarId()
  if (!onboardingConfigured() || !calendarId) return { slots: {}, configured: false }
  const now = Date.now()
  try {
    const slots = await getGhlFreeSlots({ startMs: now, endMs: bookingWindow(now, tz).endMs, timezone: tz, calendarId })
    return { slots, configured: true }
  } catch {
    logger.error('onboarding availability unavailable; check the onboarding calendar ID and calendar read permission')
    return { slots: {}, configured: true, error: 'Could not load availability. Please try again.' }
  }
}

export interface OnboardingBookResult {
  ok: boolean
  error?: string
  bookedSlot?: string
  bookedTimezone?: string
}

/** The GoHighLevel contact for this customer: their linked sales lead's, else a safe match/create. */
async function resolveContact(ctx: Context): Promise<string> {
  const leads = await db.select({ ghl: salesLeadsTable.ghlContactId, customerId: salesLeadsTable.customerId })
    .from(salesLeadsTable).where(isNotNull(salesLeadsTable.ghlContactId))
  const own = leads.find((l) => l.customerId === ctx.customerId)?.ghl
  if (own) return own
  const elsewhere = leads.filter((l) => l.customerId !== ctx.customerId).map((l) => l.ghl!)
  return safeSalesUpsert({
    firstName: ctx.firstName || ctx.email.split('@')[0],
    lastName: ctx.lastName,
    email: ctx.email,
    phone: ctx.phone,
    companyName: ctx.businessName,
    tags: ['patient pipeline customer'],
    source: 'Patient Pipeline onboarding',
  }, elsewhere)
}

export async function bookOnboarding(params: { ref: unknown; slot: unknown; timezone: unknown }): Promise<OnboardingBookResult> {
  const timezone = safeTz(params.timezone)
  const slot = typeof params.slot === 'string' ? params.slot.trim() : ''
  const linkId = readOnboardingRef(params.ref)
  const ctx = linkId ? await loadContext(linkId) : null
  if (!ctx) return { ok: false, error: INVALID_ONBOARDING_LINK }
  const calendarId = onboardingCalendarId()
  if (!onboardingConfigured() || !calendarId) return { ok: false, error: 'Onboarding scheduling is not open yet. Please reply to your onboarding email and we will schedule it with you.' }
  const slotMs = Date.parse(slot)
  if (!slot || !Number.isFinite(slotMs) || slotMs < Date.now() || !isWithinBookingWindow(slotMs, Date.now(), timezone))
    return { ok: false, error: 'That time is no longer available. Pick another.' }

  let row = await reconcile(await bookingRow(ctx))
  if (row.status === 'booked') return { ok: true, bookedSlot: row.slot ?? slot, bookedTimezone: safeTz(row.timezone) }
  if (row.status === 'uncertain')
    return { ok: false, error: 'We are still confirming your earlier booking. Please reload this page in a minute.' }

  // Claim: open, or a booking lease left behind by a crashed request.
  const now = new Date()
  const [claimed] = await db.update(onboardingBookingsTable).set({ status: 'booking', claimedAt: now, updatedAt: now })
    .where(and(eq(onboardingBookingsTable.linkId, ctx.linkId), or(eq(onboardingBookingsTable.status, 'open'),
      and(eq(onboardingBookingsTable.status, 'booking'), lt(onboardingBookingsTable.claimedAt, new Date(now.getTime() - LEASE_MS))))))
    .returning()
  if (!claimed) return { ok: false, error: 'Your booking is already being saved. Please reload this page in a minute.' }
  row = claimed

  let contactId = row.ghlContactId
  try {
    if (!contactId) {
      contactId = await resolveContact(ctx)
      await db.update(onboardingBookingsTable).set({ ghlContactId: contactId, updatedAt: new Date() })
        .where(eq(onboardingBookingsTable.linkId, ctx.linkId))
    }
  } catch (err) {
    logger.error({ err, linkId: ctx.linkId }, 'onboarding booking: contact could not be resolved')
    await db.update(onboardingBookingsTable).set({ status: 'open', updatedAt: new Date() }).where(eq(onboardingBookingsTable.linkId, ctx.linkId))
    return { ok: false, error: 'We could not save your booking. Please reply to your onboarding email and we will schedule it with you.' }
  }

  const who = [ctx.firstName, ctx.lastName].filter(Boolean).join(' ')
  let appointmentId: string
  try {
    appointmentId = await bookGhlAppointment({
      contactId, startTime: slot, calendarId,
      title: `Patient Pipeline Onboarding — ${ctx.businessName}${who ? ` (${who})` : ''}`,
    })
  } catch (err) {
    const rejected = Boolean(err && typeof err === 'object' && 'bookingRejected' in err && (err as any).bookingRejected)
    logger.error({ err, linkId: ctx.linkId, rejected }, 'onboarding booking: provider write failed')
    await db.update(onboardingBookingsTable).set({ status: rejected ? 'open' : 'uncertain', slot, timezone, updatedAt: new Date() })
      .where(eq(onboardingBookingsTable.linkId, ctx.linkId))
    return rejected
      ? { ok: false, error: 'That time is no longer available. Pick another.' }
      : { ok: false, error: 'We could not confirm that booking yet. Please reload this page in a minute to check.' }
  }
  await db.update(onboardingBookingsTable).set({
    status: 'booked', appointmentId, slot, timezone, bookedAt: new Date(), updatedAt: new Date(),
  }).where(eq(onboardingBookingsTable.linkId, ctx.linkId))

  const pretty = new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeStyle: 'short', timeZone: timezone }).format(new Date(slot))
  await addGhlContactNote(contactId, [
    'ONBOARDING BOOKED — Patient Pipeline',
    '',
    `Practice: ${ctx.businessName}`,
    `Time: ${pretty} (${timezoneLabel(timezone)})`,
    'Booked from: /onboarding',
  ].join('\n')).catch(() => logger.warn({ linkId: ctx.linkId }, 'onboarding booking: note not saved; appointment remains booked'))

  return { ok: true, bookedSlot: slot, bookedTimezone: timezone }
}
