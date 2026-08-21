import 'server-only'

/**
 * GoHighLevel API v2 helpers (services.leadconnectorhq.com).
 * Auth: Private Integration token (sub-account) via GHL_API_TOKEN.
 * Required scopes: contacts.write, contacts/notes.write (implied by
 * contacts.write in private integrations), calendars.read,
 * calendars/events.write.
 */

const GHL_BASE = 'https://services.leadconnectorhq.com'
const GHL_VERSION = '2021-07-28'

export function ghlConfigured(): boolean {
  return Boolean(
    process.env.GHL_API_TOKEN &&
      process.env.GHL_LOCATION_ID &&
      process.env.GHL_CALENDAR_ID,
  )
}

async function ghlFetch(path: string, init?: RequestInit) {
  const token = process.env.GHL_API_TOKEN
  if (!token) throw new Error('GHL_API_TOKEN is not set')
  const res = await fetch(`${GHL_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Version: GHL_VERSION,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...init?.headers,
    },
    cache: 'no-store',
  })
  const text = await res.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    // non-JSON response body
  }
  if (!res.ok) {
    const message =
      (json as { message?: string | string[] } | null)?.message ?? text
    throw new Error(
      `GHL ${init?.method ?? 'GET'} ${path} failed (${res.status}): ${
        Array.isArray(message) ? message.join('; ') : message
      }`,
    )
  }
  return json
}

export interface GhlUpsertInput {
  firstName: string
  lastName: string
  email: string
  phone: string
  companyName?: string
  postalCode?: string
  city?: string
  state?: string
  timezone?: string
  tags?: string[]
  source?: string
}

/**
 * Upsert a contact (matched by email/phone). Returns the GHL contact id.
 */
export async function upsertGhlContact(
  input: GhlUpsertInput,
): Promise<string> {
  const locationId = process.env.GHL_LOCATION_ID
  if (!locationId) throw new Error('GHL_LOCATION_ID is not set')
  const body: Record<string, unknown> = {
    locationId,
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    phone: input.phone,
    country: 'US',
  }
  if (input.companyName) body.companyName = input.companyName
  if (input.postalCode) body.postalCode = input.postalCode
  if (input.city) body.city = input.city
  if (input.state) body.state = input.state
  if (input.timezone) body.timezone = input.timezone
  if (input.tags?.length) body.tags = input.tags
  if (input.source) body.source = input.source

  const json = (await ghlFetch('/contacts/upsert', {
    method: 'POST',
    body: JSON.stringify(body),
  })) as { contact?: { id?: string } }
  const id = json?.contact?.id
  if (!id) throw new Error('GHL upsert returned no contact id')
  return id
}

/** Add a note to a contact. */
export async function addGhlContactNote(
  contactId: string,
  noteBody: string,
): Promise<void> {
  await ghlFetch(`/contacts/${encodeURIComponent(contactId)}/notes`, {
    method: 'POST',
    body: JSON.stringify({ body: noteBody.slice(0, 5000) }),
  })
}

/**
 * Fetch free slots for the configured calendar between two instants,
 * localized to the given IANA timezone. Returns a map of
 * "YYYY-MM-DD" -> ISO slot strings (with offsets) in that timezone.
 */
export async function getGhlFreeSlots(params: {
  startMs: number
  endMs: number
  timezone: string
}): Promise<Record<string, string[]>> {
  const calendarId = process.env.GHL_CALENDAR_ID
  if (!calendarId) throw new Error('GHL_CALENDAR_ID is not set')
  const qs = new URLSearchParams({
    startDate: String(params.startMs),
    endDate: String(params.endMs),
    timezone: params.timezone,
  })
  const json = (await ghlFetch(
    `/calendars/${encodeURIComponent(calendarId)}/free-slots?${qs.toString()}`,
  )) as Record<string, unknown>

  const out: Record<string, string[]> = {}
  for (const [key, value] of Object.entries(json ?? {})) {
    // Keys are dates like "2026-08-21"; skip metadata keys (e.g. traceId)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue
    const slots = (value as { slots?: unknown })?.slots
    if (Array.isArray(slots)) {
      out[key] = slots.filter((s): s is string => typeof s === 'string')
    }
  }
  return out
}

/**
 * Book an appointment on the configured calendar for a contact,
 * marked confirmed. startTime must be an ISO string with offset.
 */
export async function bookGhlAppointment(params: {
  contactId: string
  startTime: string
  title?: string
}): Promise<string> {
  const locationId = process.env.GHL_LOCATION_ID
  const calendarId = process.env.GHL_CALENDAR_ID
  if (!locationId || !calendarId)
    throw new Error('GHL_LOCATION_ID / GHL_CALENDAR_ID is not set')

  const json = (await ghlFetch('/calendars/events/appointments', {
    method: 'POST',
    body: JSON.stringify({
      calendarId,
      locationId,
      contactId: params.contactId,
      startTime: params.startTime,
      appointmentStatus: 'confirmed',
      title: params.title ?? 'Reactivation Power Strategy Call',
      ignoreFreeSlotValidation: false,
    }),
  })) as { id?: string; event?: { id?: string } }
  return json?.id ?? json?.event?.id ?? ''
}
