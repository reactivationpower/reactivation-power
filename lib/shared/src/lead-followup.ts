/**
 * Lead Follow-Up: the second product inside the portal login. Everything
 * here hangs off a CAMPAIGN (the ad or offer a lead responded to), not off
 * the practice. This module is the single copy of the domain rules shared
 * by the web app (form validation, price line preview, lead ages) and the
 * api-server (server-side validation, import dedupe).
 */

import { officeClock, officeWallClockOf, parseRequestedTime } from './lead-requested-time.ts'

// ---------- products ----------

/**
 * Products an account can hold. Reactivation is implicit for every account
 * today (the whole existing portal); Lead Follow-Up is granted per owner by
 * an admin and inherited by staff, like course access.
 */
export const PRODUCT_IDS = ['reactivation', 'lead_followup'] as const
export type ProductId = (typeof PRODUCT_IDS)[number]

export const PRODUCT_LABELS: Record<ProductId, string> = {
  reactivation: 'Reactivation',
  lead_followup: 'Lead Follow-Up',
}

export interface ProductAccess {
  /** Every account has the reactivation dialer. */
  reactivation: true
  leadFollowUp: boolean
}

/** Where each product's home page lives in the portal. */
export const PRODUCT_HOME: Record<ProductId, string> = {
  reactivation: '/portal',
  lead_followup: '/portal/leads/start',
}

/** Path prefixes that belong to Lead Follow-Up; everything else is reactivation. */
export const LEAD_FOLLOWUP_PATH_PREFIX = '/portal/leads'

export function productForPath(pathname: string): ProductId {
  return pathname === LEAD_FOLLOWUP_PATH_PREFIX ||
    pathname.startsWith(`${LEAD_FOLLOWUP_PATH_PREFIX}/`) ||
    pathname === '/portal/campaigns' ||
    pathname.startsWith('/portal/campaigns/')
    ? 'lead_followup'
    : 'reactivation'
}

/**
 * Where a freshly signed-in account should land: the chooser when it holds
 * both products, straight into the only product otherwise.
 */
export function landingPathFor(access: ProductAccess): string {
  return access.leadFollowUp ? '/portal/start' : PRODUCT_HOME.reactivation
}

// ---------- campaigns ----------

export const CAMPAIGN_STATUSES = ['active', 'paused', 'archived'] as const
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number]

/** Setup guidance only; receipt evidence is tracked separately from this choice. */
export const CAMPAIGN_LEAD_SOURCES = ['ghl', 'facebook', 'website', 'unsure'] as const
export type CampaignLeadSource = (typeof CAMPAIGN_LEAD_SOURCES)[number]

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  active: 'Active',
  paused: 'Paused',
  archived: 'Archived',
}

/**
 * How the caller states the price on the phone. Chosen per campaign by the
 * office owner; the script reads it back through formatPriceLine().
 */
export const PRICE_LINE_STYLES = ['normally_now', 'offer_only', 'no_price'] as const
export type PriceLineStyle = (typeof PRICE_LINE_STYLES)[number]

export const PRICE_LINE_STYLE_OPTIONS: ReadonlyArray<{
  id: PriceLineStyle
  label: string
  description: string
}> = [
  {
    id: 'normally_now',
    label: '\u201cNormally X, now Y\u201d',
    description: 'Anchor on the regular price, then give the offer price.',
  },
  {
    id: 'offer_only',
    label: '\u201cJust Y\u201d',
    description: 'Only the offer price is mentioned.',
  },
  {
    id: 'no_price',
    label: 'Don\u2019t mention price',
    description: 'The caller books the visit without quoting a number.',
  },
]

export const MAX_OFFER_ITEMS = 12
export const MAX_CAMPAIGN_NAME = 80
export const MAX_URGENCY_NOTE = 160
export const MAX_OFFER_ITEM = 120

/** The shape a campaign form submits and the server validates. */
export interface CampaignInput {
  nicheId: string
  name: string
  /** What's included in the offer, one line per item. Blank lines are dropped. */
  offerItems: string[]
  regularPriceCents: number | null
  offerPriceCents: number | null
  priceLineStyle: PriceLineStyle
  /** Optional "offer ends Friday" / "only 10 spots" line. */
  urgencyNote: string | null
}

export type CampaignField = keyof CampaignInput

export type CampaignValidation =
  | { ok: true; value: CampaignInput }
  | { ok: false; errors: Partial<Record<CampaignField, string>> }

/** Raw, possibly-untrusted form values (strings from inputs are fine). */
export interface CampaignDraft {
  nicheId?: unknown
  name?: unknown
  offerItems?: unknown
  /** Dollars as typed ("149", "$149.00") or cents as a number. */
  regularPrice?: unknown
  offerPrice?: unknown
  priceLineStyle?: unknown
  urgencyNote?: unknown
}

/**
 * Parse a dollar amount as an office types it ("$1,250", "149.5") into
 * whole cents. Returns null for blank input and NaN for garbage, so callers
 * can tell "left empty" from "typed something unusable".
 */
export function parseDollarsToCents(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw >= 0 ? Math.round(raw) : Number.NaN
  }
  const text = String(raw).replace(/[$,\s]/g, '')
  if (text === '') return null
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return Number.NaN
  return Math.round(Number(text) * 100)
}

export function formatDollars(cents: number): string {
  const dollars = cents / 100
  return dollars.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })
}

function cleanText(raw: unknown, max: number): string {
  return typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, max) : ''
}

/**
 * Validate a campaign form. The one rule that trips people up: the regular
 * price is only required for the "Normally X, now Y" style; "Just Y" needs
 * the offer price alone, and "Don't mention price" needs neither (prices may
 * still be recorded for the office's own reference).
 */
export function validateCampaignInput(draft: CampaignDraft): CampaignValidation {
  const errors: Partial<Record<CampaignField, string>> = {}

  const nicheId = typeof draft.nicheId === 'string' ? draft.nicheId.trim() : ''
  if (!nicheId) errors.nicheId = 'Pick the service this campaign is for.'

  const name = cleanText(draft.name, MAX_CAMPAIGN_NAME)
  if (!name) errors.name = 'Give the campaign a name.'

  const offerItems = Array.isArray(draft.offerItems)
    ? draft.offerItems
        .map((item) => cleanText(item, MAX_OFFER_ITEM))
        .filter((item) => item !== '')
        .slice(0, MAX_OFFER_ITEMS)
    : []
  if (offerItems.length === 0) {
    errors.offerItems = 'List at least one thing included in the offer.'
  }

  const styleRaw = draft.priceLineStyle
  const priceLineStyle = (PRICE_LINE_STYLES as readonly unknown[]).includes(styleRaw)
    ? (styleRaw as PriceLineStyle)
    : null
  if (!priceLineStyle) errors.priceLineStyle = 'Choose how the price is mentioned.'

  const regularPriceCents = parseDollarsToCents(draft.regularPrice)
  const offerPriceCents = parseDollarsToCents(draft.offerPrice)
  if (Number.isNaN(regularPriceCents)) {
    errors.regularPriceCents = 'Enter the regular price as a dollar amount.'
  }
  if (Number.isNaN(offerPriceCents)) {
    errors.offerPriceCents = 'Enter the offer price as a dollar amount.'
  }

  if (priceLineStyle === 'normally_now') {
    if (regularPriceCents === null && !errors.regularPriceCents) {
      errors.regularPriceCents = 'The regular price is needed for \u201cNormally X, now Y\u201d.'
    }
    if (offerPriceCents === null && !errors.offerPriceCents) {
      errors.offerPriceCents = 'The offer price is needed for \u201cNormally X, now Y\u201d.'
    }
    if (
      regularPriceCents !== null &&
      offerPriceCents !== null &&
      !Number.isNaN(regularPriceCents) &&
      !Number.isNaN(offerPriceCents) &&
      offerPriceCents >= regularPriceCents
    ) {
      errors.offerPriceCents = 'The offer price should be lower than the regular price.'
    }
  } else if (priceLineStyle === 'offer_only') {
    if (offerPriceCents === null && !errors.offerPriceCents) {
      errors.offerPriceCents = 'The offer price is needed for \u201cJust Y\u201d.'
    }
  }

  const urgencyNote = cleanText(draft.urgencyNote, MAX_URGENCY_NOTE) || null

  if (Object.keys(errors).length > 0 || !priceLineStyle) return { ok: false, errors }
  return {
    ok: true,
    value: {
      nicheId,
      name,
      offerItems,
      regularPriceCents: Number.isNaN(regularPriceCents) ? null : regularPriceCents,
      offerPriceCents: Number.isNaN(offerPriceCents) ? null : offerPriceCents,
      priceLineStyle,
      urgencyNote,
    },
  }
}

/**
 * The sentence the caller says about price, or null when the campaign
 * doesn't mention it. Tolerates a missing price (returns null) so a
 * half-edited campaign never produces "Normally $0".
 */
export function formatPriceLine(campaign: {
  priceLineStyle: PriceLineStyle
  regularPriceCents: number | null
  offerPriceCents: number | null
}): string | null {
  const { priceLineStyle, regularPriceCents, offerPriceCents } = campaign
  if (priceLineStyle === 'no_price') return null
  if (offerPriceCents === null) return null
  if (priceLineStyle === 'offer_only') return `Just ${formatDollars(offerPriceCents)}`
  if (regularPriceCents === null) return null
  return `Normally ${formatDollars(regularPriceCents)}, now ${formatDollars(offerPriceCents)}`
}

// ---------- leads ----------

export const LEAD_STATUSES = ['new', 'attempted', 'reached', 'booked', 'confirmed', 'closed'] as const
export type LeadStatus = (typeof LEAD_STATUSES)[number]

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'New',
  attempted: 'Attempted',
  reached: 'Reached',
  booked: 'Booked',
  confirmed: 'Confirmed',
  closed: 'Closed',
}

export const LEAD_SOURCES = ['upload', 'webhook', 'gohighlevel', 'manual'] as const
export type LeadSource = (typeof LEAD_SOURCES)[number]

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  upload: 'List upload',
  webhook: 'Ad form',
  gohighlevel: 'GoHighLevel',
  manual: 'Added by hand',
}

/** Digits only, minus a leading US country code: the per-campaign dedupe key. */
export function phoneKey(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
}

/**
 * "Submitted 5 minutes ago" — leads decay by the hour, so the list shows
 * age rather than a timestamp. Coarse on purpose: minutes under an hour,
 * hours under a day, days after that.
 */
export function timeAgo(iso: string | Date, now: number = Date.now()): string {
  const then = typeof iso === 'string' ? new Date(iso).getTime() : iso.getTime()
  if (!Number.isFinite(then)) return ''
  const seconds = Math.max(0, Math.round((now - then) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`
  const months = Math.floor(days / 30)
  return `${months} month${months === 1 ? '' : 's'} ago`
}

/** One row as the upload dialog hands it to the server. */
export interface LeadImportRow {
  firstName?: string
  lastName?: string
  /** Used when the file only has a single full-name column. */
  name?: string
  phone: string
  email?: string
  /** Free text exactly as the lead wrote it ("Tuesday afternoon", "9/14 10am"). */
  requestedTime?: string
  /** What the lead wrote on the form. */
  message?: string
  /** ISO time the lead came in, when the source knows it (webhooks, seeds). */
  submittedAt?: string
}

export interface PlannedLead {
  firstName: string
  lastName: string
  phone: string
  phoneKey: string
  email: string | null
  requestedTime: string | null
  /** `requestedTime` resolved to a wall-clock slot (YYYY-MM-DDTHH:mm) when it named a day and a time. */
  requestedAt: string | null
  message: string | null
  submittedAt: Date | null
}

export interface LeadImportPlan {
  toInsert: PlannedLead[]
  skippedDuplicate: number
  skippedInvalid: number
}

export const MAX_LEAD_IMPORT_ROWS = 5000

/** Split a single "Jane Q. Smith" into first/last the way the contacts list does. */
export function splitFullName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: '', lastName: '' }
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] }
}

function parseSubmittedAt(raw: string | undefined): Date | null {
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Decide which uploaded rows become leads in ONE campaign. A phone already
 * in this campaign (or repeated earlier in the file) is skipped; the same
 * person in a different campaign is fine, which is why the caller passes
 * only the current campaign's phone keys. Rows without a usable name or
 * phone are counted as invalid rather than silently dropped.
 */
export function planLeadImport(
  rows: LeadImportRow[],
  existingPhoneKeys: Iterable<string>,
  now: Date = new Date(),
): LeadImportPlan {
  const seen = new Set(existingPhoneKeys)
  const toInsert: PlannedLead[] = []
  let skippedDuplicate = 0
  let skippedInvalid = 0

  for (const row of rows.slice(0, MAX_LEAD_IMPORT_ROWS)) {
    let firstName = (row.firstName ?? '').trim()
    let lastName = (row.lastName ?? '').trim()
    if (!firstName && !lastName && row.name) {
      ;({ firstName, lastName } = splitFullName(row.name))
    }
    const phone = (row.phone ?? '').trim()
    const key = phoneKey(phone)
    if (!firstName || key.length < 7) {
      skippedInvalid++
      continue
    }
    if (seen.has(key)) {
      skippedDuplicate++
      continue
    }
    seen.add(key)
    const submittedAt = parseSubmittedAt(row.submittedAt)
    const requestedTime = (row.requestedTime ?? '').trim().slice(0, 200) || null
    toInsert.push({
      firstName: firstName.slice(0, 80),
      lastName: lastName.slice(0, 80),
      phone,
      phoneKey: key,
      email: (row.email ?? '').trim().slice(0, 200) || null,
      requestedTime,
      // "Tuesday" means the Tuesday after they filled the form in (on the
      // office's calendar), not after the upload.
      requestedAt: parseRequestedTime(requestedTime, officeClock(submittedAt ?? now)),
      message: (row.message ?? '').trim().slice(0, 2000) || null,
      submittedAt,
    })
  }

  return { toInsert, skippedDuplicate, skippedInvalid }
}

/**
 * What happened on a lead call. Deliberately not the reactivation
 * CallDisposition: a lead "booked elsewhere" is a real outcome an owner
 * wants counted, and there is no "scheduled" vs "booked" distinction.
 */
export const LEAD_DISPOSITIONS = [
  'no_answer',
  'voicemail',
  'spoke_did_not_book',
  'callback_later',
  'booked',
  'confirmed',
  'rescheduled',
  'booked_elsewhere',
  'do_not_call',
] as const

export const LEAD_MAX_UNANSWERED_ATTEMPTS = 9

export function isParkedLead(lead: {
  status: string
  nextDueAt: Date | string | null
  unansweredAttempts: number
}): boolean {
  return lead.status === 'attempted' && lead.nextDueAt === null &&
    lead.unansweredAttempts >= LEAD_MAX_UNANSWERED_ATTEMPTS
}

/** Reset only the retry cadence; call history and the last outcome stay intact. */
export function reopenParkedLead(
  lead: { status: string; nextDueAt: Date | string | null; unansweredAttempts: number },
  now: Date,
): { unansweredAttempts: number; nextDueAt: Date } {
  if (!isParkedLead(lead)) throw new Error('This lead is no longer parked.')
  return { unansweredAttempts: 0, nextDueAt: now }
}

export function formatRate(rate: number): string {
  return `${Math.round(rate * 100)}%`
}

/**
 * The lead's next state after a call is logged. Pure so the server and the
 * tests agree; the store copies the result onto the campaign_leads row
 * while holding a row lock, so two callers logging at once both count.
 *
 * - no_answer / voicemail: status "attempted" (never demotes a reached or
 *   booked lead, and keeps an existing booking), unanswered count +1, next
 *   due from the cadence. A booked lead is not put back on the retry list.
 * - spoke_did_not_book: reached, cadence reset, nothing scheduled — the
 *   caller decides in the notes whether to try again.
 * - callback_later: reached (a booked lead stays booked), due at the
 *   requested callback time.
 * - booked: status booked with the appointment time; off the list.
 * - confirmed / rescheduled: the lead had asked for a time on the ad form;
 *   the caller locked it in (or moved it). Status confirmed with the
 *   appointment time; off the list. Counted as booked everywhere.
 * - booked_elsewhere / do_not_call: closed; last_disposition says why.
 */
export function applyLeadDisposition(
  lead: Pick<LeadCadenceState, 'status' | 'unansweredAttempts'> & {
    bookedAt?: Date | null; submittedAt?: Date | string | null; requestedAt?: string | null
  },
  input: LeadDispositionInput,
): LeadCadenceState {
  const { disposition, now } = input
  const holdsBooking = lead.status === 'booked' || lead.status === 'confirmed'
  const keptBooking = holdsBooking ? (lead.bookedAt ?? null) : null
  if (disposition === 'no_answer' || disposition === 'voicemail') {
    const unansweredAttempts = lead.unansweredAttempts + 1
    const confirmation = Boolean(lead.requestedAt) && !holdsBooking
    return {
      status: lead.status === 'new' ? 'attempted' : lead.status,
      unansweredAttempts,
      nextDueAt: holdsBooking ? null : confirmation
        ? nextConfirmationAttemptAt(now, lead.requestedAt!)
        : nextLeadAttemptAt(unansweredAttempts, now, lead.submittedAt),
      lastDisposition: disposition,
      bookedAt: keptBooking,
    }
  }
  if (disposition === 'spoke_did_not_book') {
    return {
      status: holdsBooking ? lead.status : 'reached',
      unansweredAttempts: 0,
      nextDueAt: null,
      lastDisposition: disposition,
      bookedAt: keptBooking,
    }
  }
  if (disposition === 'callback_later') {
    return {
      status: holdsBooking ? lead.status : 'reached',
      unansweredAttempts: 0,
      nextDueAt: input.callBackAt ?? null,
      lastDisposition: disposition,
      bookedAt: keptBooking,
    }
  }
  if (disposition === 'booked' || disposition === 'confirmed' || disposition === 'rescheduled') {
    return {
      status: disposition === 'booked' ? 'booked' : 'confirmed',
      unansweredAttempts: 0,
      nextDueAt: null,
      lastDisposition: disposition,
      bookedAt: input.bookedAt ?? null,
    }
  }
  return { status: 'closed', unansweredAttempts: 0, nextDueAt: null, lastDisposition: disposition, bookedAt: null }
}

export interface LeadCadenceState {
  status: LeadStatus
  unansweredAttempts: number
  nextDueAt: Date | null
  lastDisposition: LeadDisposition | null
  bookedAt: Date | null
}

/** Dispositions where the caller actually spoke with the lead. */
export const REACHED_DISPOSITIONS: readonly LeadDisposition[] = [
  'spoke_did_not_book',
  'callback_later',
  'booked',
  'confirmed',
  'rescheduled',
  'booked_elsewhere',
  'do_not_call',
]

/** Dispositions that record an appointment time (`bookedAt` required). */
export const APPOINTMENT_DISPOSITIONS: readonly LeadDisposition[] = ['booked', 'confirmed', 'rescheduled']
export type LeadDisposition = (typeof LEAD_DISPOSITIONS)[number]

const HOUR = 60 * 60 * 1000

export function isReachedDisposition(d: LeadDisposition): boolean {
  return REACHED_DISPOSITIONS.includes(d)
}

const OFFICE_TZ = 'America/New_York'
const cadenceDays = [0, 0, 0, 1, 2, 4, 6, 9, 13] as const
const officeParts = (instant: Date) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: OFFICE_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(instant)
  const num = (key: string) => Number(parts.find((p) => p.type === key)?.value)
  return { y: num('year'), m: num('month'), d: num('day'), h: num('hour') % 24, min: num('minute') }
}

/** Convert an office wall-clock time to an instant, including DST changes. */
function officeInstant(y: number, m: number, d: number, hour: number, minute = 0): Date {
  const wall = Date.UTC(y, m - 1, d, hour, minute)
  let instant = wall
  for (let i = 0; i < 3; i++) {
    const p = officeParts(new Date(instant))
    const displayed = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min)
    instant += wall - displayed
  }
  return new Date(instant)
}

function officeDay(anchor: Date, offset: number, hour: number): Date {
  const p = officeParts(anchor)
  const date = new Date(Date.UTC(p.y, p.m - 1, p.d + offset))
  return officeInstant(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), hour)
}

function officeMonths(anchor: Date, months: number, hour: number): Date {
  const p = officeParts(anchor)
  const first = new Date(Date.UTC(p.y, p.m - 1 + months, 1))
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  return officeInstant(first.getUTCFullYear(), first.getUTCMonth() + 1, Math.min(p.d, last), hour)
}

/** Nearest eligible office-hour instant, without changing a source timestamp. */
function duringOfficeHours(at: Date): Date {
  const p = officeParts(at)
  if (p.h < 9) return officeInstant(p.y, p.m, p.d, 9)
  if (p.h >= 18) return officeDay(at, 1, 9)
  return at
}

function sameOfficeDay(a: Date, b: Date): boolean {
  const left = officeParts(a)
  const right = officeParts(b)
  return left.y === right.y && left.m === right.m && left.d === right.d
}

/** Start the distinct check-in script at the same two-month calendar anchor as the queue. */
export function isLongTermLeadCheckIn(submittedAt: Date | string, now: Date): boolean {
  const anchor = new Date(submittedAt)
  return Number.isFinite(anchor.getTime()) && now >= officeMonths(anchor, 2, 10)
}

/**
 * Nine attempts: initial call, two spaced calls in the first 24 hours,
 * then days 2, 3, 5, 7, 10 and 14. Later, one check-in every two calendar
 * months. Expired slots are skipped, never stacked into a catch-up burst.
 */
export function nextLeadAttemptAt(unansweredAttempts: number, now: Date, submittedAt?: Date | string | null): Date {
  const parsed = submittedAt ? new Date(submittedAt) : now
  const anchor = Number.isFinite(parsed.getTime()) ? parsed : now
  const earliest = now.getTime() + 3 * HOUR
  // A rolling 24-hour window, not "same calendar date": evening inquiries
  // can receive their remaining spaced attempts during next morning's hours.
  for (let i = Math.max(1, unansweredAttempts); i < 3; i++) {
    const candidate = duringOfficeHours(new Date(Math.max(anchor.getTime() + i * 4 * HOUR, now.getTime() + 4 * HOUR)))
    if (candidate.getTime() < anchor.getTime() + 24 * HOUR) return candidate
  }
  for (let i = Math.max(3, unansweredAttempts); i < cadenceDays.length; i++) {
    const planned = officeDay(anchor, cadenceDays[i], i % 2 === 0 ? 15 : 10)
    const candidate = duringOfficeHours(new Date(Math.max(
      planned.getTime(), earliest, anchor.getTime() + 24 * HOUR,
    )))
    // If the intended day ran out, skip it; never bunch several missed calls.
    if (sameOfficeDay(candidate, planned)) return candidate
  }
  const start = officeParts(anchor)
  const today = officeParts(now)
  let month = Math.max(2, Math.floor(((today.y - start.y) * 12 + today.m - start.m) / 2) * 2)
  for (;;) {
    const target = officeMonths(anchor, month, month % 4 === 0 ? 15 : 10)
    if (target.getTime() > earliest) return target
    month += 2
  }
}

/** Unanswered appointment confirmations never join the sales cadence. */
export function nextConfirmationAttemptAt(now: Date, requestedAt: string): Date | null {
  const parts = requestedAt.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/)
  if (!parts) return null
  const appointment = officeInstant(+parts[1], +parts[2], +parts[3], +parts[4], +parts[5])
  const tomorrow = officeDay(now, 1, 9)
  if (tomorrow < appointment) return tomorrow
  const laterToday = new Date(now.getTime() + 4 * HOUR)
  return officeParts(laterToday).h >= 9 && officeParts(laterToday).h < 18 && laterToday < appointment
    ? laterToday : null
}

export const LEAD_DISPOSITION_LABELS: Record<LeadDisposition, string> = {
  no_answer: 'No answer',
  voicemail: 'No answer, left VM',
  spoke_did_not_book: 'Spoke, didn\u2019t book',
  callback_later: 'Spoke, call back later',
  booked: 'Booked',
  confirmed: 'Confirmed requested time',
  rescheduled: 'Rescheduled',
  booked_elsewhere: 'Booked elsewhere',
  do_not_call: 'Do not call',
}

const DAY = 24 * HOUR

/**
 * The numbers an owner asks for first. "Reached" is any lead the team has
 * spoken with at least once (status reached, booked, confirmed, or closed
 * by a conversation); "booked" is status booked or confirmed.
 */
export function campaignConversion(
  leads: Array<{ status: LeadStatus | string; lastDisposition?: string | null }>,
): CampaignConversion {
  const received = leads.length
  let reached = 0
  let booked = 0
  for (const l of leads) {
    const spoke =
      l.status === 'reached' ||
      l.status === 'booked' ||
      l.status === 'confirmed' ||
      (l.status === 'closed' && (l.lastDisposition === 'booked_elsewhere' || l.lastDisposition === 'do_not_call'))
    if (spoke) reached++
    if (l.status === 'booked' || l.status === 'confirmed') booked++
  }
  return { received, reached, booked, bookedRate: received === 0 ? 0 : booked / received }
}

export function isLeadDisposition(value: unknown): value is LeadDisposition {
  return typeof value === 'string' && (LEAD_DISPOSITIONS as readonly string[]).includes(value)
}

export interface LeadDispositionInput {
  disposition: LeadDisposition
  now: Date
  callBackAt?: Date | null
  bookedAt?: Date | null
}

/**
 * Why a lead cannot be called right now, or null when it can. Enforced on
 * the server (loader and action) and mirrored by the UI so nobody dials a
 * do-not-call lead or works an archived campaign.
 *  - archived campaign: restore it first; its leads are frozen.
 *  - closed lead: do-not-call or booked elsewhere is final from the caller's
 *    seat; reopening is an explicit owner action, not another call.
 * Booked/confirmed leads stay callable (reminders, reschedules) but a missed
 * retry never clears the booking — see applyLeadDisposition.
 */
export function leadCallBlockReason(
  campaign: { status: CampaignStatus | string },
  lead: { status: LeadStatus | string; lastDisposition?: string | null },
): string | null {
  if (campaign.status === 'archived') return 'This campaign is archived. Restore it before calling its leads.'
  if (lead.status === 'closed') {
    if (lead.lastDisposition === 'do_not_call') return 'This lead asked not to be called.'
    if (lead.lastDisposition === 'booked_elsewhere') return 'This lead booked elsewhere and is closed.'
    return 'This lead is closed.'
  }
  return null
}

/**
 * Whether a lead's scheduled retry or callback has come due. Any lead that
 * is not closed qualifies — including a booked lead who asked to be called
 * back — so a promised callback always reaches the call-next list. The
 * store's SQL mirrors this rule.
 */
export function isLeadDue(
  lead: { status: LeadStatus | string; nextDueAt: Date | string | null },
  now: Date | number,
): boolean {
  if (lead.status === 'closed' || !lead.nextDueAt) return false
  const due = typeof lead.nextDueAt === 'string' ? new Date(lead.nextDueAt).getTime() : lead.nextDueAt.getTime()
  const at = typeof now === 'number' ? now : now.getTime()
  return due <= at
}

/** Why a lead is not in the working queue yet (separate from campaign/DNC blocking). */
export function leadQueueBlockReason(
  lead: { status: string; nextDueAt: Date | string | null; requestedAt?: string | null },
  now: Date,
): string | null {
  const hour = officeClock(now).getHours()
  if (hour < 9 || hour >= 18) return 'Please call during office hours (9 AM–6 PM Eastern).'
  if (lead.nextDueAt && new Date(lead.nextDueAt).getTime() > now.getTime()) return 'The next call is scheduled for later.'
  if (lead.requestedAt && !['booked', 'confirmed'].includes(lead.status) &&
    lead.requestedAt.slice(0, 16).replace(' ', 'T') <= officeWallClockOf(now)) {
    return 'The requested appointment time has passed; review this lead before calling.'
  }
  if (lead.status === 'new' || isLeadDue(lead, now)) return null
  return 'No call is due for this lead.'
}

export interface CampaignConversion {
  received: number
  reached: number
  booked: number
  /** booked / received, 0..1; 0 when nothing has been received. */
  bookedRate: number
}

/** The fields a disposition must carry; the server refuses without them. */
export function leadDispositionFieldError(input: {
  disposition: LeadDisposition
  callBackAt: Date | null
  bookedAt: Date | null
}): string | null {
  if (input.disposition === 'callback_later' && !input.callBackAt) return 'Pick when they asked to be called back.'
  if (input.disposition === 'booked' && !input.bookedAt) return 'Pick the appointment date and time.'
  if (input.disposition === 'confirmed' && !input.bookedAt) return 'Pick the time you confirmed with them.'
  if (input.disposition === 'rescheduled' && !input.bookedAt) return 'Pick the new appointment date and time.'
  return null
}

/**
 * Which screen the lead script opens on. A lead who picked a day and time on
 * the ad form believes they already booked, so the call starts on the
 * confirmation screen instead of the "why didn't you book" open — until
 * the appointment is locked in (booked/confirmed) or the lead is closed.
 * Null means the flow's normal first step.
 */
export const LEAD_CONFIRM_STEP_KEY = 'confirm_requested'

export function leadEntryStepKey(lead: {
  status: LeadStatus | string
  requestedAt?: string | null
}): string | null {
  if (!lead.requestedAt) return null
  if (lead.status === 'booked' || lead.status === 'confirmed' || lead.status === 'closed') return null
  return LEAD_CONFIRM_STEP_KEY
}

export function isAppointmentDisposition(d: LeadDisposition | string): boolean {
  return (APPOINTMENT_DISPOSITIONS as readonly string[]).includes(d)
}
