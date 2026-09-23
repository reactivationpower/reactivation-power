import { phoneKey } from './lead-followup.ts'

/**
 * Lead Follow-Up webhook intake: turning whatever a form tool, Zapier, a
 * Facebook lead-form connector or a GoHighLevel workflow POSTs into a lead.
 * Pure functions only — the api-server route calls them on every request and
 * the Lead sources tab uses the same tables to describe the defaults.
 */

// ---------- targets ----------

/** The lead fields a payload can fill. */
export const WEBHOOK_FIELDS = ['firstName', 'lastName', 'email', 'phone', 'requestedTime', 'message'] as const
export type WebhookField = (typeof WEBHOOK_FIELDS)[number]

export const WEBHOOK_FIELD_LABELS: Record<WebhookField, string> = {
  firstName: 'First name',
  lastName: 'Last name',
  email: 'Email',
  phone: 'Phone',
  requestedTime: 'Requested appointment date/time',
  message: 'Note / message',
}

/** Owner overrides: target field -> incoming key. Dotted paths reach nested objects. */
export type WebhookFieldMapping = Partial<Record<WebhookField, string>>

export const MAX_MAPPING_KEY = 120

/**
 * Incoming keys recognised automatically, most specific first. Matching is
 * case-insensitive and ignores spaces, underscores and dashes, so
 * `first_name`, `firstName`, `First Name` and `FIRST-NAME` are the same key.
 * Nested keys match on their leaf (`contact.firstName`, `customData.phone`).
 */
export const DEFAULT_FIELD_KEYS: Record<WebhookField, readonly string[]> = {
  firstName: ['first_name', 'firstname', 'fname', 'given_name', 'first'],
  lastName: ['last_name', 'lastname', 'lname', 'surname', 'family_name', 'last'],
  email: ['email', 'email_address', 'e_mail', 'emailaddress'],
  phone: ['phone', 'phone_number', 'mobile', 'cell', 'mobile_phone', 'cell_phone', 'telephone', 'tel', 'phonenumber'],
  requestedTime: [
    'requested_time',
    'requested_appointment',
    'requested_date',
    'preferred_time',
    'preferred_date',
    'preferred_appointment_time',
    'appointment_time',
    'appointment_date',
    'appointment',
    'best_time',
    'best_time_to_call',
    'when',
    'date_time',
    'datetime',
    'date',
    'time',
  ],
  message: ['message', 'note', 'notes', 'comment', 'comments', 'description', 'details', 'question', 'reason'],
}

/** A single full-name key is split when neither first nor last name is present. */
const FULL_NAME_KEYS = ['full_name', 'fullname', 'name', 'contact_name', 'customer_name', 'lead_name']

/** Nested objects whose leaves may be matched by their own name. */
const LEAF_MATCH_PREFIXES = ['contact', 'customdata', 'custom_data', 'customfields', 'custom_fields', 'data', 'fields', 'lead', 'form', 'answers']

// ---------- flattening ----------

/** `first_name`, `firstName`, `First Name` -> `firstname` */
export function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[\s_\-.]+/g, '')
}

function scalarToString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return null
}

/**
 * Flatten a payload to dotted paths. Arrays of scalars are joined with
 * ", " (a tags list, a multi-select answer); arrays of objects are indexed.
 * Depth is capped so a hostile body cannot blow the stack.
 */
export function flattenPayload(body: unknown, maxDepth = 4): Record<string, string> {
  const out: Record<string, string> = {}
  const walk = (value: unknown, path: string, depth: number) => {
    if (depth > maxDepth) return
    if (Array.isArray(value)) {
      if (value.every((v) => scalarToString(v) !== null)) {
        if (path) out[path] = value.map((v) => scalarToString(v) ?? '').join(', ')
        return
      }
      value.slice(0, 20).forEach((v, i) => walk(v, path ? `${path}.${i}` : String(i), depth + 1))
      return
    }
    if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        walk(v, path ? `${path}.${k}` : k, depth + 1)
      }
      return
    }
    const s = scalarToString(value)
    if (s !== null && path) out[path] = s
  }
  walk(body, '', 0)
  return out
}

/**
 * Facebook lead-form connectors (and Zapier's "Lead Ads" trigger) often
 * deliver answers as `field_data: [{ name, values: [..] }]`. Lift them to
 * plain keys so the defaults apply.
 */
function liftFieldData(body: Record<string, unknown>): Record<string, unknown> {
  const fieldData = body.field_data
  if (!Array.isArray(fieldData)) return body
  const lifted: Record<string, unknown> = { ...body }
  for (const entry of fieldData) {
    if (!entry || typeof entry !== 'object') continue
    const { name, values, value } = entry as { name?: unknown; values?: unknown; value?: unknown }
    if (typeof name !== 'string' || !name) continue
    const v = Array.isArray(values) ? values[0] : (value ?? values)
    if (lifted[name] === undefined) lifted[name] = v
  }
  return lifted
}

// ---------- source detection ----------

export type WebhookLeadSource = 'webhook' | 'gohighlevel'

/**
 * A GoHighLevel workflow "Webhook" action sends the contact flat
 * (`contact_id`, `first_name`, `full_name`, `location`, `workflow`, ...);
 * other GHL surfaces nest it under `contact`. Either way the payload carries
 * a contact id and a location, which no generic form tool does.
 */
export function detectWebhookSource(body: Record<string, unknown>): WebhookLeadSource {
  const hasContactId = 'contact_id' in body || 'contactId' in body
  const hasGhlEnvelope = 'location' in body || 'workflow' in body || 'locationId' in body || 'location_id' in body
  if (hasContactId && hasGhlEnvelope) return 'gohighlevel'
  const contact = body.contact
  if (contact && typeof contact === 'object' && ('locationId' in (contact as object) || 'location_id' in (contact as object))) {
    return 'gohighlevel'
  }
  return 'webhook'
}

// ---------- mapping ----------

export interface MappedLead {
  firstName: string
  lastName: string
  email: string
  phone: string
  requestedTime: string
  message: string
}

export interface MappingHit {
  /** The dotted path in the payload the value came from. */
  key: string
  value: string
  /** Owner mapping or automatic default. */
  via: 'mapping' | 'auto'
}

export type WebhookMappingResult =
  | { ok: true; lead: MappedLead; hits: Partial<Record<WebhookField, MappingHit>> }
  | { ok: false; error: string; hits: Partial<Record<WebhookField, MappingHit>> }

/** Index of normalized leaf/path -> [dotted path] for one flattened payload. */
function buildIndex(flat: Record<string, string>) {
  const byPath = new Map<string, string>()
  const byLeaf = new Map<string, string>()
  for (const path of Object.keys(flat)) {
    byPath.set(normalizeKey(path), path)
    const segments = path.split('.')
    if (segments.length === 1) continue
    const prefix = normalizeKey(segments[0])
    if (!LEAF_MATCH_PREFIXES.includes(prefix)) continue
    const leaf = normalizeKey(segments[segments.length - 1])
    if (!byLeaf.has(leaf)) byLeaf.set(leaf, path)
  }
  return { byPath, byLeaf }
}

function lookup(index: ReturnType<typeof buildIndex>, flat: Record<string, string>, candidate: string): { key: string; value: string } | null {
  const norm = normalizeKey(candidate)
  const path = index.byPath.get(norm) ?? index.byLeaf.get(norm)
  if (path === undefined) return null
  const value = (flat[path] ?? '').trim()
  return value ? { key: path, value } : null
}

/**
 * Map one payload to a lead. Owner mapping wins per field; unmapped fields
 * fall back to the defaults. A payload with no usable phone or no name at
 * all is rejected with a sentence the owner can act on.
 */
export function mapWebhookPayload(body: unknown, mapping: WebhookFieldMapping = {}): WebhookMappingResult {
  const hits: Partial<Record<WebhookField, MappingHit>> = {}
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'The body must be a JSON object or form fields.', hits }
  }
  const lifted = liftFieldData(body as Record<string, unknown>)
  const flat = flattenPayload(lifted)
  if (Object.keys(flat).length === 0) {
    return { ok: false, error: 'The body was empty — no fields were received.', hits }
  }
  const index = buildIndex(flat)

  for (const field of WEBHOOK_FIELDS) {
    const custom = mapping[field]?.trim()
    if (custom) {
      const hit = lookup(index, flat, custom)
      if (hit) hits[field] = { ...hit, via: 'mapping' }
      continue
    }
    for (const candidate of DEFAULT_FIELD_KEYS[field]) {
      const hit = lookup(index, flat, candidate)
      if (hit) {
        hits[field] = { ...hit, via: 'auto' }
        break
      }
    }
  }

  // A separate date and time field become one "when" the caller can read.
  if (hits.requestedTime?.via === 'auto') {
    const dateHit = ['requested_date', 'preferred_date', 'appointment_date', 'date'].map((c) => lookup(index, flat, c)).find(Boolean)
    const timeHit = ['requested_time', 'preferred_time', 'appointment_time', 'time'].map((c) => lookup(index, flat, c)).find(Boolean)
    if (dateHit && timeHit && dateHit.key !== timeHit.key) {
      hits.requestedTime = { key: `${dateHit.key} + ${timeHit.key}`, value: `${dateHit.value} ${timeHit.value}`, via: 'auto' }
    }
  }

  let firstName = hits.firstName?.value ?? ''
  let lastName = hits.lastName?.value ?? ''
  if (!firstName && !lastName) {
    for (const candidate of FULL_NAME_KEYS) {
      const hit = lookup(index, flat, candidate)
      if (!hit) continue
      const parts = hit.value.split(/\s+/).filter(Boolean)
      firstName = parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0] ?? ''
      lastName = parts.length > 1 ? parts[parts.length - 1] : ''
      hits.firstName = { key: hit.key, value: firstName, via: 'auto' }
      if (lastName) hits.lastName = { key: hit.key, value: lastName, via: 'auto' }
      break
    }
  }

  const phone = hits.phone?.value ?? ''
  const missing: string[] = []
  if (!firstName) missing.push('a first name')
  if (!phone) missing.push('a phone number')
  if (missing.length > 0) {
    const fields = Object.keys(flat).slice(0, 12).join(', ')
    return {
      ok: false,
      hits,
      error: `Could not find ${missing.join(' or ')} in the payload. Fields received: ${fields}${Object.keys(flat).length > 12 ? ', …' : ''}. Map the right field on the Lead sources tab.`,
    }
  }
  if (phoneKey(phone).length < 7) {
    return { ok: false, hits, error: `"${phone}" does not look like a phone number (fewer than 7 digits).` }
  }

  return {
    ok: true,
    hits,
    lead: {
      firstName: firstName.slice(0, 80),
      lastName: lastName.slice(0, 80),
      email: (hits.email?.value ?? '').slice(0, 200),
      phone: phone.slice(0, 40),
      requestedTime: (hits.requestedTime?.value ?? '').slice(0, 200),
      message: (hits.message?.value ?? '').slice(0, 2000),
    },
  }
}

/** Clean an owner-submitted mapping: known fields only, trimmed, blanks dropped. */
export function sanitizeFieldMapping(raw: unknown): WebhookFieldMapping {
  const out: WebhookFieldMapping = {}
  if (!raw || typeof raw !== 'object') return out
  for (const field of WEBHOOK_FIELDS) {
    const v = (raw as Record<string, unknown>)[field]
    if (typeof v !== 'string') continue
    const key = v.trim().slice(0, MAX_MAPPING_KEY)
    if (key) out[field] = key
  }
  return out
}

// ---------- test payload ----------

/**
 * The body "Send a test" posts to the campaign's own URL. Uses the owner's
 * mapped key names when set, so a custom mapping is what gets exercised.
 */
export function buildTestPayload(mapping: WebhookFieldMapping = {}, now: Date = new Date()): Record<string, string> {
  const key = (field: WebhookField, fallback: string) => mapping[field]?.trim() || fallback
  const when = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const day = when.toLocaleDateString('en-US', { weekday: 'long' })
  return {
    [key('firstName', 'first_name')]: 'Test',
    [key('lastName', 'last_name')]: 'Lead',
    [key('email', 'email')]: 'test.lead@example.com',
    [key('phone', 'phone')]: '(555) 010-0100',
    [key('requestedTime', 'requested_time')]: `${day} afternoon`,
    [key('message', 'message')]: 'Sent from the Lead sources tab to check this URL works.',
    test: 'true',
  }
}

// ---------- GoHighLevel reference ----------

/**
 * What a GoHighLevel workflow "Webhook" action sends for a contact and where
 * each field lands. Shown in the setup guide and used by the "GHL payload"
 * route test; keep the key names exactly as GHL emits them.
 */
export const GHL_FIELD_TABLE: ReadonlyArray<{ ghlKey: string; field: WebhookField | null; note: string }> = [
  { ghlKey: 'first_name', field: 'firstName', note: 'Contact first name' },
  { ghlKey: 'last_name', field: 'lastName', note: 'Contact last name' },
  { ghlKey: 'full_name', field: null, note: 'Used only when first/last are missing' },
  { ghlKey: 'email', field: 'email', note: 'Contact email' },
  { ghlKey: 'phone', field: 'phone', note: 'Contact phone (E.164, e.g. +13035550123)' },
  { ghlKey: 'customData.requested_time', field: 'requestedTime', note: 'Add as Custom Data on the webhook action' },
  { ghlKey: 'customData.message', field: 'message', note: 'Add as Custom Data on the webhook action' },
  { ghlKey: 'contact_id, location, workflow, tags', field: null, note: 'Stored with the raw payload; marks the source as GoHighLevel' },
]

/** A representative GHL workflow webhook body (documentation + tests). */
export const GHL_SAMPLE_PAYLOAD: Record<string, unknown> = {
  contact_id: 'ocQHyuzHvysMo5N5VsXc',
  first_name: 'Jordan',
  last_name: 'Reyes',
  full_name: 'Jordan Reyes',
  email: 'jordan.reyes@example.com',
  phone: '+13035550142',
  tags: 'back pain special, new lead',
  address1: '123 Main St',
  city: 'Denver',
  state: 'CO',
  country: 'US',
  date_created: '2026-09-22T15:04:05.000Z',
  contact_source: 'facebook ad',
  contact_type: 'lead',
  location: { name: 'Summit Chiropractic', address: '900 Broadway', city: 'Denver', state: 'CO', country: 'US', id: 'loc_1' },
  workflow: { id: 'wf_1', name: 'Send new leads to Reactivation Power' },
  customData: { requested_time: 'Tuesday after 3pm', message: 'Lower back has been bad for two weeks' },
}
