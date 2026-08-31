'use server'

import { revalidatePath } from 'next/cache'
import { getAdminClient } from '@/lib/supabase/admin'
import {
  accessOwnerId,
  getCurrentParticipant,
} from '@/lib/data/participants'
import {
  getOwnerNiches,
  releaseReserveContacts,
} from '@/lib/data/reactivation'
import { matchNicheByName } from '@/lib/niche-match'
import { easternWallClockToUtc } from '@/lib/call-time'
import type { CallDisposition } from '@/lib/types'
import { CALL_BATCH_SIZES, RETRY_WINDOW_MONTHS, MAX_STAFF } from '@/lib/types'

// ---------- Admin: niches ----------

export async function createNiche(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'Name is required' }
  const rawSector = String(formData.get('sector') ?? 'healthcare')
  const sector = rawSector === 'home_services' ? 'home_services' : 'healthcare'
  const supabase = getAdminClient()
  const { count } = await supabase
    .from('niches')
    .select('id', { count: 'exact', head: true })
  const { error } = await supabase
    .from('niches')
    .insert({ name, sort_order: count ?? 0, sector })
  if (error) return { error: error.message }
  revalidatePath('/admin/reactivation')
  return {}
}

export async function updateNiche(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  if (!id) return { error: 'Missing id' }
  const patch: Record<string, unknown> = {}
  const name = formData.get('name')
  if (name !== null) patch.name = String(name).trim()
  const isActive = formData.get('isActive')
  if (isActive !== null) patch.is_active = isActive === 'true'
  const supabase = getAdminClient()
  const { error } = await supabase.from('niches').update(patch).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/reactivation')
  return {}
}

export async function deleteNiche(id: string) {
  const supabase = getAdminClient()
  await supabase.from('niches').delete().eq('id', id)
  revalidatePath('/admin/reactivation')
}

// ---------- Admin: master script + sections ----------

export async function updateMasterScript(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  const body = String(formData.get('body') ?? '')
  const title = String(formData.get('title') ?? '').trim()
  const status = String(formData.get('status') ?? '')
  if (!id) return { error: 'Missing id' }
  const supabase = getAdminClient()
  const patch: Record<string, unknown> = {
    body,
    updated_at: new Date().toISOString(),
  }
  if (title) patch.title = title
  if (status === 'draft' || status === 'live') patch.status = status
  const { error } = await supabase
    .from('reactivation_scripts')
    .update(patch)
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/reactivation')
  revalidatePath('/portal/reactivation')
  return {}
}

export async function saveScriptSection(formData: FormData) {
  const nicheId = String(formData.get('nicheId') ?? '')
  const slotName = String(formData.get('slotName') ?? '')
  const content = String(formData.get('content') ?? '')
  if (!nicheId || !slotName) return { error: 'Missing fields' }
  const supabase = getAdminClient()
  const { error } = await supabase.from('script_sections').upsert(
    {
      niche_id: nicheId,
      slot_name: slotName,
      content,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'niche_id,slot_name' },
  )
  if (error) return { error: error.message }
  revalidatePath('/admin/reactivation')
  return {}
}

// ---------- Portal: pipeline stages ----------

export async function createStage(formData: FormData) {
  const participant = await getCurrentParticipant()
  if (!participant) return { error: 'Not signed in' }
  const ownerId = accessOwnerId(participant)
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'Name is required' }
  const supabase = getAdminClient()
  const { data: existing } = await supabase
    .from('pipeline_stages')
    .select('sort_order')
    .or(`owner_id.is.null,owner_id.eq.${ownerId}`)
    .order('sort_order', { ascending: false })
    .limit(1)
  const nextOrder = ((existing ?? [])[0]?.sort_order ?? -1) + 1
  const { error } = await supabase
    .from('pipeline_stages')
    .insert({ owner_id: ownerId, name, sort_order: nextOrder })
  if (error) return { error: error.message }
  revalidatePath('/portal/reactivation')
  return {}
}

export async function moveStage(id: string, direction: 'up' | 'down') {
  const participant = await getCurrentParticipant()
  if (!participant) return
  const ownerId = accessOwnerId(participant)
  const supabase = getAdminClient()
  const { data: stages } = await supabase
    .from('pipeline_stages')
    .select('id, sort_order')
    .or(`owner_id.is.null,owner_id.eq.${ownerId}`)
    .order('sort_order')
    .order('created_at')
  if (!stages) return
  const idx = stages.findIndex((s) => s.id === id)
  const swap = direction === 'up' ? idx - 1 : idx + 1
  if (idx < 0 || swap < 0 || swap >= stages.length) return
  const order = stages.map((s) => s.id)
  ;[order[idx], order[swap]] = [order[swap], order[idx]]
  await Promise.all(
    order.map((sid, i) =>
      supabase.from('pipeline_stages').update({ sort_order: i }).eq('id', sid),
    ),
  )
  revalidatePath('/portal/reactivation')
}

export async function deleteStage(id: string) {
  const participant = await getCurrentParticipant()
  if (!participant) return { error: 'Not signed in' }
  const supabase = getAdminClient()
  // Only allow deleting custom (non-default) stages owned by this account
  const { error } = await supabase
    .from('pipeline_stages')
    .delete()
    .eq('id', id)
    .eq('owner_id', accessOwnerId(participant))
    .eq('is_default', false)
  if (error) return { error: error.message }
  revalidatePath('/portal/reactivation')
  return {}
}

// ---------- Portal: contacts ----------

export async function createContact(formData: FormData) {
  const participant = await getCurrentParticipant()
  if (!participant) return { error: 'Not signed in' }
  const ownerId = accessOwnerId(participant)

  const name = String(formData.get('name') ?? '').trim()
  const phone = String(formData.get('phone') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim()
  const nicheId = String(formData.get('nicheId') ?? '')
  const notes = String(formData.get('notes') ?? '').trim()
  const originalComplaint = String(
    formData.get('originalComplaint') ?? '',
  ).trim()
  if (!name || !phone) return { error: 'Name and phone are required' }

  const supabase = getAdminClient()
  const [{ data: newStage }, { data: ownerRow }] = await Promise.all([
    supabase
      .from('pipeline_stages')
      .select('id')
      .is('owner_id', null)
      .order('sort_order')
      .limit(1)
      .maybeSingle(),
    supabase
      .from('participants')
      .select('default_niche_id')
      .eq('id', ownerId)
      .maybeSingle(),
  ])

  const { data: contact, error } = await supabase
    .from('contacts')
    .insert({
      owner_id: ownerId,
      created_by: participant.id,
      name,
      phone,
      email: email || null,
      niche_id:
        nicheId && nicheId !== 'none'
          ? nicheId
          : (ownerRow?.default_niche_id ?? null),
      stage_id: newStage?.id ?? null,
      notes: notes || null,
      original_complaint: originalComplaint || null,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }

  // Immediately due for the first call
  await supabase.from('follow_ups').insert({
    contact_id: contact.id,
    due_at: new Date().toISOString(),
    reason: 'initial',
  })

  revalidatePath('/portal/reactivation')
  return { id: contact.id }
}

export async function updateContact(formData: FormData) {
  const participant = await getCurrentParticipant()
  if (!participant) return { error: 'Not signed in' }
  const id = String(formData.get('id') ?? '')
  if (!id) return { error: 'Missing id' }

  const patch: Record<string, unknown> = {}
  for (const key of ['name', 'phone', 'email', 'notes'] as const) {
    const v = formData.get(key)
    if (v !== null) patch[key] = String(v).trim() || null
  }
  // Optional "previously treated for" — clearing the field stores null so
  // the script falls back to its generic lead-in.
  const originalComplaint = formData.get('originalComplaint')
  if (originalComplaint !== null)
    patch.original_complaint = String(originalComplaint).trim() || null
  const nicheId = formData.get('nicheId')
  if (nicheId !== null)
    patch.niche_id =
      String(nicheId) && String(nicheId) !== 'none' ? String(nicheId) : null
  const stageId = formData.get('stageId')
  if (stageId !== null) patch.stage_id = String(stageId) || null
  const dnc = formData.get('doNotCall')
  if (dnc !== null) patch.do_not_call = dnc === 'true'

  const supabase = getAdminClient()
  const { error } = await supabase
    .from('contacts')
    .update(patch)
    .eq('id', id)
    .eq('owner_id', accessOwnerId(participant))
  if (error) return { error: error.message }
  revalidatePath('/portal/reactivation')
  revalidatePath(`/portal/reactivation/contacts/${id}`)
  return {}
}

export async function deleteContact(id: string) {
  const participant = await getCurrentParticipant()
  if (!participant) return { error: 'Not signed in' }
  const supabase = getAdminClient()
  await supabase
    .from('contacts')
    .delete()
    .eq('id', id)
    .eq('owner_id', accessOwnerId(participant))
  revalidatePath('/portal/reactivation')
  return {}
}

// ---------- Portal: CSV import + default niche ----------

/** Owner sets the practice's default niche (fallback when a contact has none) */
export async function setDefaultNiche(nicheId: string) {
  const participant = await getCurrentParticipant()
  if (!participant) return { error: 'Not signed in' }
  if (participant.role !== 'owner')
    return { error: 'Only the account owner can set the default niche' }
  const supabase = getAdminClient()
  const { error } = await supabase
    .from('participants')
    .update({ default_niche_id: nicheId || null })
    .eq('id', participant.id)
  if (error) return { error: error.message }
  revalidatePath('/portal/reactivation')
  return {}
}

export interface ImportRow {
  name: string
  phone: string
  email?: string
  service?: string
  notes?: string
  /** What the patient was previously treated for (optional) */
  complaint?: string
  /**
   * Value from an explicit "Niche" column on the file. Resolved by name
   * per contact, so one upload can mix decompression, Botox, etc. and
   * every caller still gets the right script.
   */
  niche?: string
}

export interface ImportMapping {
  /** Normalized (lowercased, trimmed) service label */
  service_label: string
  /** Niche id, or null = fall back to the practice default */
  niche_id: string | null
}

const MAX_IMPORT_ROWS = 5000

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.length === 11 && digits.startsWith('1')
    ? digits.slice(1)
    : digits
}

/**
 * Bulk import contacts from a CSV upload. Each row's niche is resolved:
 * forced file niche -> service mapping -> practice default -> none.
 * Mappings are saved so the next upload from this practice classifies
 * automatically. Duplicate phones (already in the account, or repeated in
 * the file) are skipped.
 */
export async function importContacts(input: {
  rows: ImportRow[]
  mappings: ImportMapping[]
  /** When set, every contact in this upload is tagged with this niche */
  forceNicheId?: string | null
}) {
  const participant = await getCurrentParticipant()
  if (!participant) return { error: 'Not signed in' }
  const ownerId = accessOwnerId(participant)

  const rows = (input.rows ?? []).slice(0, MAX_IMPORT_ROWS)
  if (rows.length === 0) return { error: 'No rows to import' }

  const supabase = getAdminClient()

  // 1. Save/refresh the service -> niche mappings for this practice
  const mappings = (input.mappings ?? []).filter((m) => m.service_label)
  if (mappings.length > 0) {
    await supabase.from('service_niche_mappings').upsert(
      mappings.map((m) => ({
        owner_id: ownerId,
        service_label: m.service_label.trim().toLowerCase(),
        niche_id: m.niche_id,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'owner_id,service_label' },
    )
  }
  const nicheByService = new Map(
    mappings.map((m) => [m.service_label.trim().toLowerCase(), m.niche_id]),
  )

  // 2. Practice default niche + default pipeline stage
  const [{ data: ownerRow }, { data: newStage }] = await Promise.all([
    supabase
      .from('participants')
      .select('default_niche_id')
      .eq('id', ownerId)
      .maybeSingle(),
    supabase
      .from('pipeline_stages')
      .select('id')
      .is('owner_id', null)
      .order('sort_order')
      .limit(1)
      .maybeSingle(),
  ])
  const defaultNicheId = ownerRow?.default_niche_id ?? null

  // Validate the forced file-level niche against real, active niches
  let forcedNicheId: string | null = null
  if (input.forceNicheId) {
    const { data: forced } = await supabase
      .from('niches')
      .select('id')
      .eq('id', input.forceNicheId)
      .eq('is_active', true)
      .maybeSingle()
    forcedNicheId = forced?.id ?? null
  }

  // Niches this account can actually use, for resolving a "Niche" column
  const usesNicheColumn = rows.some((r) => (r.niche ?? '').trim() !== '')
  const ownerNiches = usesNicheColumn ? await getOwnerNiches(ownerId) : []
  const unmatchedNiches = new Set<string>()

  // 3. Existing phones for dedupe
  const { data: existing } = await supabase
    .from('contacts')
    .select('phone')
    .eq('owner_id', ownerId)
  const seen = new Set((existing ?? []).map((c) => normalizePhone(c.phone)))

  const toInsert: Record<string, unknown>[] = []
  let skippedInvalid = 0
  let skippedDuplicate = 0

  for (const row of rows) {
    const name = (row.name ?? '').trim()
    const phone = (row.phone ?? '').trim()
    const key = normalizePhone(phone)
    if (!name || key.length < 7) {
      skippedInvalid++
      continue
    }
    if (seen.has(key)) {
      skippedDuplicate++
      continue
    }
    seen.add(key)

    const serviceRaw = (row.service ?? '').trim()
    const serviceKey = serviceRaw.replace(/\s+/g, ' ').toLowerCase()
    const mapped = serviceKey ? nicheByService.get(serviceKey) : undefined

    // A Niche column on the row beats the service mapping, but a niche
    // forced for the whole upload still wins over everything.
    const nicheRaw = (row.niche ?? '').trim()
    let rowNicheId: string | undefined
    if (nicheRaw && ownerNiches.length > 0) {
      const match = matchNicheByName(nicheRaw, ownerNiches)
      if (match) rowNicheId = match.id
      else unmatchedNiches.add(nicheRaw)
    }

    const nicheId = forcedNicheId ?? rowNicheId ?? mapped ?? defaultNicheId

    toInsert.push({
      owner_id: ownerId,
      created_by: participant.id,
      name,
      phone,
      email: (row.email ?? '').trim() || null,
      niche_id: nicheId,
      stage_id: newStage?.id ?? null,
      notes: (row.notes ?? '').trim() || null,
      service_label: serviceRaw || null,
      original_complaint: (row.complaint ?? '').trim() || null,
    })
  }

  // 4. Insert in chunks. We deliberately do NOT create follow-ups here —
  // imported contacts start in the "reserve" pool with no follow-up. The
  // dashboard releases them into the live queue a batch at a time
  // (getCallQueueState), so a bulk upload never dumps everyone into
  // "Calls Due" at once.
  let imported = 0
  const CHUNK = 250
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK)
    const { data: inserted, error } = await supabase
      .from('contacts')
      .insert(chunk)
      .select('id')
    if (error) return { error: error.message, imported }
    imported += inserted?.length ?? 0
  }

  revalidatePath('/portal/reactivation')
  return {
    imported,
    skippedDuplicate,
    skippedInvalid,
    // Niche values we could not match, so the UI can flag the typo
    unmatchedNiches: Array.from(unmatchedNiches).slice(0, 8),
  }
}

// ---------- Portal: call batch size + manual release ----------

/** Owner sets how many cold calls stay live in the queue (5/7/10) */
export async function setCallBatchSize(size: number) {
  const participant = await getCurrentParticipant()
  if (!participant) return { error: 'Not signed in' }
  if (participant.role !== 'owner')
    return { error: 'Only the account owner can change the batch size' }
  if (!CALL_BATCH_SIZES.includes(size as (typeof CALL_BATCH_SIZES)[number]))
    return { error: 'Invalid batch size' }
  const supabase = getAdminClient()
  const { error } = await supabase
    .from('participants')
    .update({ call_batch_size: size })
    .eq('id', participant.id)
  if (error) return { error: error.message }
  revalidatePath('/portal/reactivation')
  return {}
}

/**
 * "Add More Calls" — manually pull the next batch of reserve contacts into
 * the queue on demand, for a caller who has worked through their batch and
 * still has time. Releases up to `count` (defaults to the account batch
 * size), regardless of any auto top-up.
 */
export async function addMoreCalls(count?: number) {
  const participant = await getCurrentParticipant()
  if (!participant) return { error: 'Not signed in' }
  const ownerId = accessOwnerId(participant)

  let n = count ?? 0
  if (!n) {
    const supabase = getAdminClient()
    const { data: owner } = await supabase
      .from('participants')
      .select('call_batch_size')
      .eq('id', ownerId)
      .maybeSingle()
    n = owner?.call_batch_size ?? 7
  }
  const released = await releaseReserveContacts(ownerId, Math.max(1, n))
  revalidatePath('/portal/reactivation')
  return { released }
}

// ---------- Portal: niche selection ----------

export async function setSelectedNiche(nicheId: string) {
  const participant = await getCurrentParticipant()
  if (!participant) return
  const supabase = getAdminClient()
  await supabase
  .from('participants')
  .update({ selected_niche_id: nicheId || null })
  .eq('id', participant.id)
  revalidatePath('/portal/reactivation')
  }

/** Owner sets their practice name, auto-filled into scripts as {{practice_name}} */
export async function setPracticeName(formData: FormData) {
  const participant = await getCurrentParticipant()
  if (!participant) return { error: 'Not signed in' }
  if (participant.role !== 'owner')
    return { error: 'Only the account owner can set the practice name' }
  const practiceName = String(formData.get('practiceName') ?? '').trim()
  const supabase = getAdminClient()
  const { error } = await supabase
    .from('participants')
    .update({ practice_name: practiceName || null })
    .eq('id', participant.id)
  if (error) return { error: error.message }
  revalidatePath('/portal/reactivation')
  return {}
}

/** Owner sets the office callback number, auto-filled into the VM script */
export async function setOfficePhone(formData: FormData) {
  const participant = await getCurrentParticipant()
  if (!participant) return { error: 'Not signed in' }
  if (participant.role !== 'owner')
    return { error: 'Only the account owner can set the office number' }
  const officePhone = String(formData.get('officePhone') ?? '').trim()
  const supabase = getAdminClient()
  const { error } = await supabase
    .from('participants')
    .update({ office_phone: officePhone || null })
    .eq('id', participant.id)
  if (error) return { error: error.message }
  revalidatePath('/portal/reactivation')
  return {}
}

// ---------- Portal: team / callers (owner self-management) ----------

/**
 * Owner adds a caller (staff member) to their own account. The new member
 * logs in with their own email and inherits the owner's niches/scripts.
 * Every write is scoped to the current owner — an owner can only add staff
 * under themselves, never under another account.
 */
export async function addTeamMember(formData: FormData) {
  const participant = await getCurrentParticipant()
  if (!participant) return { error: 'Not signed in' }
  if (participant.role !== 'owner')
    return { error: 'Only the account owner can add callers' }

  const firstName = String(formData.get('firstName') ?? '').trim()
  const lastName = String(formData.get('lastName') ?? '').trim()
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase()
  const phone = String(formData.get('phone') ?? '').trim()
  if (!firstName || !lastName || !email) {
    return { error: 'First name, last name, and email are required' }
  }

  const supabase = getAdminClient()

  // Only active staff count toward the limit — deactivating frees a seat.
  const { count } = await supabase
    .from('participants')
    .select('id', { count: 'exact', head: true })
    .eq('parent_id', participant.id)
    .eq('is_active', true)
  if ((count ?? 0) >= MAX_STAFF) {
    return { error: `You can have up to ${MAX_STAFF} active callers.` }
  }

  const { error } = await supabase.from('participants').insert({
    first_name: firstName,
    last_name: lastName,
    email,
    phone: phone || null,
    parent_id: participant.id,
    role: 'staff',
  })
  if (error) {
    if (error.code === '23505')
      return { error: 'Someone with this email already exists.' }
    return { error: error.message }
  }
  revalidatePath('/portal/reactivation')
  return {}
}

/**
 * Owner activates or deactivates one of their own callers. Ownership is
 * enforced by matching parent_id to the current owner, so an owner can never
 * toggle a caller that isn't theirs.
 */
export async function setTeamMemberActive(memberId: string, isActive: boolean) {
  const participant = await getCurrentParticipant()
  if (!participant) return { error: 'Not signed in' }
  if (participant.role !== 'owner')
    return { error: 'Only the account owner can manage callers' }
  if (!memberId) return { error: 'Missing caller' }

  const supabase = getAdminClient()

  // Re-enabling counts against the active limit.
  if (isActive) {
    const { count } = await supabase
      .from('participants')
      .select('id', { count: 'exact', head: true })
      .eq('parent_id', participant.id)
      .eq('is_active', true)
    if ((count ?? 0) >= MAX_STAFF) {
      return { error: `You can have up to ${MAX_STAFF} active callers.` }
    }
  }

  const { error } = await supabase
    .from('participants')
    .update({ is_active: isActive })
    .eq('id', memberId)
    .eq('parent_id', participant.id) // ownership guard
  if (error) return { error: error.message }
  revalidatePath('/portal/reactivation')
  return {}
}

// ---------- Portal: log a call (dispositions + cadence) ----------

/**
 * Scattered weekly retry: 4-7 days out, random weekday, random time block
 * between 9am and 6pm EASTERN so retries don't always land at the same time.
 * The hour is anchored to Eastern (not the UTC server clock) so "afternoon"
 * actually means afternoon for the office.
 */
function nextScatteredRetry(): Date {
  const days = 4 + Math.floor(Math.random() * 4) // 4-7 days
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + days)
  // Skip weekends (evaluated on the target calendar day)
  if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1)
  if (d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 2)
  const hour = 9 + Math.floor(Math.random() * 9) // 9am-5:30pm ET start
  const minute = Math.random() < 0.5 ? 0 : 30
  return easternWallClockToUtc(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    hour,
    minute,
  )
}

function monthsFromNow(months: number): Date {
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  d.setHours(10, 0, 0, 0)
  return d
}

export async function logCall(formData: FormData) {
  const participant = await getCurrentParticipant()
  if (!participant) return { error: 'Not signed in' }
  const ownerId = accessOwnerId(participant)

  const contactId = String(formData.get('contactId') ?? '')
  const disposition = String(formData.get('disposition') ?? '') as CallDisposition
  const voicemailLeft = formData.get('voicemailLeft') === 'true'
  const notes = String(formData.get('notes') ?? '').trim()
  const callBackAt = String(formData.get('callBackAt') ?? '')

  const valid: CallDisposition[] = [
    'no_answer',
    'voicemail',
    'spoke_did_not_schedule',
    'spoke_call_back_later',
    'scheduled',
    'do_not_call',
  ]
  if (!contactId || !valid.includes(disposition))
    return { error: 'Missing contact or disposition' }

  const supabase = getAdminClient()

  const { data: contact } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', contactId)
    .eq('owner_id', ownerId)
    .maybeSingle()
  if (!contact) return { error: 'Contact not found' }

  // 1. Log the call
  const { data: call, error: callError } = await supabase
    .from('reactivation_calls')
    .insert({
      contact_id: contactId,
      caller_id: participant.id,
      disposition,
      voicemail_left: voicemailLeft,
      notes: notes || null,
    })
    .select('id')
    .single()
  if (callError) return { error: callError.message }

  // 2. Mark any open follow-ups for this contact as completed by this call
  await supabase
    .from('follow_ups')
    .update({ completed_call_id: call.id })
    .eq('contact_id', contactId)
    .is('completed_call_id', null)

  // 3. Contact patch: first_call_at, stage, dnc
  const contactPatch: Record<string, unknown> = {}
  if (!contact.first_call_at)
    contactPatch.first_call_at = new Date().toISOString()

  const { data: stages } = await supabase
    .from('pipeline_stages')
    .select('id, name')
    .or(`owner_id.is.null,owner_id.eq.${ownerId}`)
  const stageByName = new Map(
    (stages ?? []).map((s) => [s.name.toLowerCase(), s.id]),
  )

  // 4. Cadence rules → next follow-up
  let nextDue: Date | null = null
  let reason: 'retry' | 'three_month' | 'quarterly' | 'manual' = 'retry'

  switch (disposition) {
    case 'no_answer':
    case 'voicemail': {
      const firstCall = contact.first_call_at
        ? new Date(contact.first_call_at)
        : new Date()
      const retryWindowEnd = new Date(firstCall)
      retryWindowEnd.setMonth(retryWindowEnd.getMonth() + RETRY_WINDOW_MONTHS)
      if (new Date() < retryWindowEnd) {
        nextDue = nextScatteredRetry()
        reason = 'retry'
      } else {
        nextDue = monthsFromNow(3)
        reason = 'quarterly'
      }
      if (stageByName.has('contacting'))
        contactPatch.stage_id = stageByName.get('contacting')
      break
    }
    case 'spoke_did_not_schedule': {
      nextDue = monthsFromNow(3)
      reason = 'three_month'
      if (stageByName.has('spoke to'))
        contactPatch.stage_id = stageByName.get('spoke to')
      break
    }
    case 'spoke_call_back_later': {
      const picked = callBackAt ? new Date(callBackAt) : null
      nextDue =
        picked && !Number.isNaN(picked.getTime())
          ? picked
          : nextScatteredRetry()
      reason = 'manual'
      if (stageByName.has('spoke to'))
        contactPatch.stage_id = stageByName.get('spoke to')
      break
    }
    case 'scheduled': {
      nextDue = monthsFromNow(3)
      reason = 'quarterly'
      if (stageByName.has('scheduled'))
        contactPatch.stage_id = stageByName.get('scheduled')
      break
    }
    case 'do_not_call': {
      contactPatch.do_not_call = true
      nextDue = null
      break
    }
  }

  if (Object.keys(contactPatch).length > 0) {
    await supabase.from('contacts').update(contactPatch).eq('id', contactId)
  }

  if (nextDue) {
    await supabase.from('follow_ups').insert({
      contact_id: contactId,
      due_at: nextDue.toISOString(),
      reason,
    })
  }

  revalidatePath('/portal/reactivation')
  revalidatePath(`/portal/reactivation/contacts/${contactId}`)
  return { callId: call.id }
}
