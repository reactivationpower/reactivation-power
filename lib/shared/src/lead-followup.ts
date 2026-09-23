/**
 * Lead Follow-Up: the second product inside the portal login. Everything
 * here hangs off a CAMPAIGN (the ad or offer a lead responded to), not off
 * the practice. This module is the single copy of the domain rules shared
 * by the web app (form validation, price line preview, lead ages) and the
 * api-server (server-side validation, import dedupe).
 */

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
  lead_followup: '/portal/campaigns',
}

/** Path prefixes that belong to Lead Follow-Up; everything else is reactivation. */
export const LEAD_FOLLOWUP_PATH_PREFIX = '/portal/campaigns'

export function productForPath(pathname: string): ProductId {
  return pathname === LEAD_FOLLOWUP_PATH_PREFIX ||
    pathname.startsWith(`${LEAD_FOLLOWUP_PATH_PREFIX}/`)
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

export const LEAD_SOURCES = ['upload', 'webhook', 'manual'] as const
export type LeadSource = (typeof LEAD_SOURCES)[number]

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  upload: 'List upload',
  webhook: 'Ad form',
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
    toInsert.push({
      firstName: firstName.slice(0, 80),
      lastName: lastName.slice(0, 80),
      phone,
      phoneKey: key,
      email: (row.email ?? '').trim().slice(0, 200) || null,
      requestedTime: (row.requestedTime ?? '').trim().slice(0, 200) || null,
      message: (row.message ?? '').trim().slice(0, 2000) || null,
      submittedAt: parseSubmittedAt(row.submittedAt),
    })
  }

  return { toInsert, skippedDuplicate, skippedInvalid }
}
