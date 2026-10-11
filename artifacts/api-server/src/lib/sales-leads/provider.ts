/**
 * Private-integration API 2021-07-28, verified read-only in the configured
 * location. Contacts pagination uses meta.startAfter/startAfterId, never
 * follows a provider-supplied URL (which could leak Authorization).
 * Docs: marketplace.gohighlevel.com/docs/2021-07-28/ghl/
 */
const BASE = 'https://services.leadconnectorhq.com'
import type { GhlUpsertInput } from '@/lib/ghl'
import { salesTiming } from './timing'
/** Provider upsert prefers phone/email according to location configuration.
 * Check both identities first; never let that implicit preference merge two
 * different people or erase existing tags. */
const normalizePhone = (value: string) => String(value ?? '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')
/** True when a different GoHighLevel contact, with a different email, already has
 * this phone (often a shared office line or a repeat tester). Writing the phone to
 * our contact would collide with or take over that contact, so callers omit it. */
export async function phoneOwnedByOtherContact(phone: string, email: string, ownContactId?: string | null) {
  if (!normalizePhone(phone)) return false
  const page = await contactPage(phone, {}, 100)
  return page.contacts.some((row: any) => row.id !== ownContactId && normalizePhone(row.phone) === normalizePhone(phone) &&
    !!row.email && String(row.email).trim().toLowerCase() !== String(email ?? '').trim().toLowerCase())
}
/** `ownedElsewhere` lists GoHighLevel contact IDs already linked to other local
 * leads; they are never written to, even if a (possibly stale) search matches them. */
export async function safeSalesUpsert(input: GhlUpsertInput, ownedElsewhere: string[] = []): Promise<string> {
  const matches = new Map<string, any>()
  for (const [query, kind] of [[input.email,'email'],[input.phone,'phone']]) {
    if (!query) continue
    const page = await contactPage(query!, {}, 100)
    if (page.cursor || page.total > 100) throw new Error('Provider identity conflict: narrow or resolve the matching contacts in GoHighLevel before retrying')
    for (const row of page.contacts) {
      const exact = kind === 'email' ? String(row.email ?? '').trim().toLowerCase() === input.email.trim().toLowerCase() :
        normalizePhone(String(row.phone ?? '')) === normalizePhone(input.phone)
      if (exact) matches.set(row.id, row)
    }
  }
  // Search results can lag behind real edits. Re-read every match and keep only
  // contacts whose current email or phone still matches before trusting them.
  for (const [matchId] of [...matches]) {
    const fresh = await contact(matchId)
    const still = fresh && ((input.email && String(fresh.email ?? '').trim().toLowerCase() === input.email.trim().toLowerCase()) ||
      (input.phone && normalizePhone(String(fresh.phone ?? '')) === normalizePhone(input.phone)))
    if (!still) { matches.delete(matchId); continue }
    if (ownedElsewhere.includes(matchId)) throw new Error('Provider identity conflict: matching GoHighLevel contact belongs to another lead. Review before contact sync.')
    matches.set(matchId, fresh)
  }
  if (matches.size > 1) throw new Error('Provider identity conflict: email and phone match different GoHighLevel records. Review those contacts before retrying.')
  const existing = [...matches.values()][0]
  const tags = [...new Set([...(existing?.tags ?? []), ...(input.tags ?? [])])]
  const { phone, ...rest } = input
  const body = { ...rest, ...(phone ? { phone } : {}), ...(tags.length ? { tags } : {}), ...(existing ? {} : { locationId: locationId(), country: 'US' }) }
  if (existing) {
    // Matching office phone alone does not authorize replacing another email.
    if (existing.email && input.email && existing.email.toLowerCase() !== input.email.toLowerCase()) throw new Error('Provider identity conflict: shared phone with a different email. Review before contact sync.')
    await provider(`/contacts/${encodeURIComponent(existing.id)}`, 'PUT', body)
    return existing.id
  }
  // We already searched by email and phone and found no match. Use plain create:
  // GoHighLevel's upsert can silently merge into another contact (e.g. same name)
  // and overwrite its email. A duplicate rejection here is a safe, visible failure.
  const result = await provider('/contacts/','POST',body)
  if (!result.contact?.id) throw new SalesProviderError(0, true)
  return result.contact.id
}
export class SalesProviderError extends Error {
  constructor(public status: number, public uncertain: boolean = false, public retryAfterSeconds = 0) {
    super(`GoHighLevel request failed (HTTP ${status}); check the required capability`)
  }
}
export const locationId = () => {
  const id = process.env.GHL_LOCATION_ID
  if (!id) throw new Error('Existing GoHighLevel location is not configured')
  return id
}
export async function provider(path: string, method = 'GET', body?: unknown): Promise<any> {
  const start = Date.now()
  const timing = salesTiming.getStore()
  try { return await request(path, method, body) }
  catch (error) {
    if (timing && error instanceof SalesProviderError) timing.providerStatus = error.status
    throw error
  } finally {
    if (timing) { timing.providerMs += Date.now() - start; timing.providerRequests++ }
  }
}
async function request(path: string, method: string, body?: unknown): Promise<any> {
  if (!process.env.GHL_API_TOKEN) throw new Error('Existing GoHighLevel private integration is not configured')
  let r: Response
  try {
    r = await fetch(`${BASE}${path}`, {
      method, headers: { Authorization: `Bearer ${process.env.GHL_API_TOKEN}`, Version: '2021-07-28', Accept: 'application/json', 'Content-Type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15_000),
    })
  } catch { throw new SalesProviderError(0, method !== 'GET') }
  if (!r.ok) {
    const retry = r.headers.get('retry-after') ?? ''
    const seconds = /^\d+$/.test(retry) ? Number(retry) : Math.ceil((Date.parse(retry) - Date.now()) / 1000)
    throw new SalesProviderError(r.status, method !== 'GET' && r.status >= 500,
      Number.isFinite(seconds) ? Math.max(0, seconds) : 0)
  }
  try { return await r.json() }
  catch { throw new SalesProviderError(r.status, method !== 'GET') }
}
export async function contactPage(query: string, cursor: { startAfter?: number; startAfterId?: string } = {}, limit = 100) {
  const qs = new URLSearchParams({ locationId: locationId(), query, limit: String(limit) })
  if (cursor.startAfter !== undefined) qs.set('startAfter', String(cursor.startAfter))
  if (cursor.startAfterId) qs.set('startAfterId', cursor.startAfterId)
  const j = await provider(`/contacts/?${qs}`)
  return { contacts: j.contacts ?? [], total: Number(j.meta?.total ?? 0), cursor: j.meta?.nextPage ? { startAfter: j.meta.startAfter, startAfterId: j.meta.startAfterId } : null }
}
export function contactUrl(contactId: string | null) {
  return contactId ? `https://app.gohighlevel.com/v2/location/${encodeURIComponent(locationId())}/contacts/detail/${encodeURIComponent(contactId)}` : null
}
export const contact = (id: string) => provider(`/contacts/${encodeURIComponent(id)}`).then(j => j.contact)
export const notes = (id: string) => provider(`/contacts/${encodeURIComponent(id)}/notes`).then(j => j.notes ?? [])
export const appointments = (id: string) => provider(`/contacts/${encodeURIComponent(id)}/appointments`).then(j => j.events ?? j.appointments ?? [])
export const conversations = (id: string) => provider(`/conversations/search?${new URLSearchParams({ locationId: locationId(), contactId: id, limit: '20' })}`).then(j => j.conversations ?? [])
export const messages = (id: string, cursor?: string) => provider(`/conversations/${encodeURIComponent(id)}/messages?${new URLSearchParams({ limit: '100', ...(cursor ? { lastMessageId: cursor } : {}) })}`).then(j => j.messages)
/** Fail closed if the location no longer has exactly one SMS sender. Never use
 * GHL's implicit default or infer a number from a previous recipient's thread. */
export async function smsSender() {
  const result = await provider(`/phone-system/numbers/location/${encodeURIComponent(locationId())}?skipNumberPool=true`)
  const numbers = result.numbers
  if (!Array.isArray(numbers) || numbers.length !== 1 ||
    numbers[0].capabilities?.sms !== true || !/^\+[1-9]\d{9,14}$/.test(numbers[0].phoneNumber))
    throw new Error('SMS sender unavailable: verify exactly one active SMS number in the existing GHL location')
  return numbers[0].phoneNumber as string
}
export async function verifyCapabilities() {
  const result: Record<string, { state: string; requirement: string }> = {}
  const checks = [
    ['contacts', `/contacts/?locationId=${encodeURIComponent(locationId())}&limit=1`, 'contacts.readonly'],
    ['conversations', `/conversations/search?locationId=${encodeURIComponent(locationId())}&limit=1`, 'conversations.readonly'],
    ['calendar', `/calendars/?locationId=${encodeURIComponent(locationId())}`, 'calendars.readonly'],
  ]
  let contactId: string | undefined, conversationId: string | undefined
  for (const [name, path, requirement] of checks) {
    try {
      const j = await provider(path!)
      result[name!] = { state: 'verified', requirement: requirement! }
      if (name === 'contacts') contactId = j.contacts?.[0]?.id
      if (name === 'conversations') conversationId = j.conversations?.[0]?.id
    } catch (e) { result[name!] = { state: e instanceof SalesProviderError && [401, 403].includes(e.status) ? 'missing_permission' : 'unavailable', requirement: requirement! } }
  }
  for (const [name, path, requirement] of [
    ['notes', contactId && `/contacts/${encodeURIComponent(contactId)}/notes`, 'contacts.readonly (notes)'],
    ['appointments', contactId && `/contacts/${encodeURIComponent(contactId)}/appointments`, 'contacts.readonly + calendars/events.readonly'],
    ['messages', conversationId && `/conversations/${encodeURIComponent(conversationId)}/messages?limit=1`, 'conversations/message.readonly'],
  ]) {
    try {
      if (!path) throw new Error('No sample available')
      await provider(path)
      result[name!] = { state: 'verified', requirement: requirement! }
    } catch (e) { result[name!] = { state: e instanceof SalesProviderError && [401, 403].includes(e.status) ? 'missing_permission' : 'unavailable', requirement: requirement! } }
  }
  result.contact_write = { state: 'existing_integration', requirement: 'contacts.write; existing contact upsert integration' }
  result.note_write = { state: 'existing_integration', requirement: 'contacts.write / notes.write; existing note integration' }
  result.sms_write = { state: 'review_required', requirement: 'conversations/message.write, SMS-enabled number, A2P/consent configuration; no live send used to verify' }
  result.recordings = { state: 'authenticated_link', requirement: 'GoHighLevel staff permission to view existing call recording; recordings are not enabled by this app' }
  result.transcriptions = { state: 'authenticated_link', requirement: 'GoHighLevel staff permission and existing provider transcription; availability is shown in authenticated contact' }
  result.webhooks = { state: 'polling', requirement: 'Private integration has no verified signed webhook subscription; bounded durable polling is used' }
  return result
}
