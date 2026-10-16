
import { revalidatePath } from 'next/cache'
import { getAdminClient } from '@/lib/supabase/admin'
import {
  accessOwnerId,
  getCurrentParticipant,
} from '@/lib/data/participants'
import {
  getNiches,
  getOwnerNiches,
  releaseReserveContacts,
} from '@/lib/data/reactivation'
import { matchNicheByName } from '@workspace/niche-catalog'
import { easternWallClockToUtc } from '@workspace/shared/call-time'
import { sanitizeNotes } from '@/lib/notes-html'
import type { CallDisposition } from '@workspace/shared/types'
import { CALL_BATCH_SIZES } from '@workspace/shared/types'
import { sendPortalWelcomeEmail } from '@/lib/mail'
import { changeCallerSeat } from '@/lib/data/caller-seats'
import { executePatientImport, listImportReviews, resolveImportReview } from '@/lib/patients/csv-import'
import type { PatientImportRow } from '@workspace/shared/csv-patients'
import type { ResolvedImportRow } from '@/lib/patients/import-plan'
import { logger } from '@/lib/logger'
import { claimPatient, renewPatient, releasePatient, reopenPatientService, savePatientCall } from '@/lib/patients/outreach'

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
  revalidatePath('/portal', 'layout')
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
  revalidatePath('/portal', 'layout')
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
  revalidatePath('/portal', 'layout')
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
  revalidatePath('/portal', 'layout')
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

  revalidatePath('/portal', 'layout')
  return { id: contact.id }
}

export async function updateContact(formData: FormData) {
  const participant = await getCurrentParticipant()
  if (!participant) return { error: 'Not signed in' }
  const id = String(formData.get('id') ?? '')
  if (!id) return { error: 'Missing id' }

  const patch: Record<string, unknown> = {}
  for (const key of ['name', 'phone', 'email'] as const) {
    const v = formData.get(key)
    if (v !== null) patch[key] = String(v).trim() || null
  }
  // Notes arrive as a small HTML subset from the rich-text editor; strip
  // anything outside that subset so pasted EHR notes can't inject markup.
  const notes = formData.get('notes')
  if (notes !== null) patch.notes = sanitizeNotes(String(notes)) || null
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
  revalidatePath('/portal', 'layout')
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
  revalidatePath('/portal', 'layout')
  return {}
}

// ---------- Portal: bulk contact actions (owner only) ----------

const BULK_CHUNK = 500

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/**
 * Owner deletes many contacts at once (the "select all → delete" reset path).
 * Scoped to the owner's own contacts; follow-ups and call history cascade.
 */
export async function bulkDeleteContacts(ids: string[]) {
  const participant = await getCurrentParticipant()
  if (!participant) return { error: 'Not signed in' }
  if (participant.role !== 'owner')
    return { error: 'Only the account owner can delete contacts in bulk' }
  const clean = Array.from(new Set((ids ?? []).filter(Boolean)))
  if (clean.length === 0) return { error: 'No contacts selected' }

  const supabase = getAdminClient()
  let deleted = 0
  for (const part of chunk(clean, BULK_CHUNK)) {
    const { data, error } = await supabase
      .from('contacts')
      .delete()
      .in('id', part)
      .eq('owner_id', participant.id)
      .select('id')
    if (error) return { error: error.message, deleted }
    deleted += data?.length ?? 0
  }
  revalidatePath('/portal', 'layout')
  return { deleted }
}

/**
 * Owner assigns (or clears) the niche on many contacts at once — for lists
 * that were uploaded without a niche and need the right script attached.
 */
export async function bulkAssignNiche(ids: string[], nicheId: string | null) {
  const participant = await getCurrentParticipant()
  if (!participant) return { error: 'Not signed in' }
  if (participant.role !== 'owner')
    return { error: 'Only the account owner can change niches in bulk' }
  const clean = Array.from(new Set((ids ?? []).filter(Boolean)))
  if (clean.length === 0) return { error: 'No contacts selected' }

  const supabase = getAdminClient()
  if (nicheId) {
    const { data: niche } = await supabase
      .from('niches')
      .select('id')
      .eq('id', nicheId)
      .eq('is_active', true)
      .maybeSingle()
    if (!niche) return { error: 'That niche is not available' }
  }

  let updated = 0
  for (const part of chunk(clean, BULK_CHUNK)) {
    const { data, error } = await supabase
      .from('contacts')
      .update({ niche_id: nicheId })
      .in('id', part)
      .eq('owner_id', participant.id)
      .select('id')
    if (error) return { error: error.message, updated }
    updated += data?.length ?? 0
  }
  revalidatePath('/portal', 'layout')
  return { updated }
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
  revalidatePath('/portal', 'layout')
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
  patientId?: string
  lastVisit?: string
  doNotCall?: string
}

export interface ImportMapping {
  /** Normalized (lowercased, trimmed) service label */
  service_label: string
  /** Niche id, or null = fall back to the practice default */
  niche_id: string | null
}

const MAX_IMPORT_ROWS = 5000
const MAX_FILE_ROWS = 1_000_000

/**
 * Resolve each row's service, then match people and apply this request's rows
 * atomically. Repeated uploads preserve outreach; uncertain identities are
 * held for explicit review instead of silently dropped or merged.
 *
 * A request must fit the hosting body limit (4 MB on Vercel), so the browser
 * sends a large file as several consecutive requests in file order, each with
 * `rowOffset` (rows already sent). Rows in a later request match people the
 * earlier ones created, exactly as a repeated upload would, and row numbers in
 * reviews and messages stay those of the file.
 */
export async function importContacts(input: {
  rows: ImportRow[]
  mappings: ImportMapping[]
  /** When set, every contact in this upload is tagged with this niche */
  forceNicheId?: string | null
  sourceSystem?: string
  /** Number of file rows sent in earlier requests of the same upload (default 0). */
  rowOffset?: number
}) {
  const participant = await getCurrentParticipant()
  if (!participant) return { error: 'Not signed in' }
  const ownerId = accessOwnerId(participant)

  if (!input || !Array.isArray(input.rows) || input.rows.length > MAX_IMPORT_ROWS)
    return { error: `Upload at most ${MAX_IMPORT_ROWS} rows at a time.` }
  const rows = input.rows
  if (rows.length === 0) return { error: 'No rows to import' }
  const rowOffset = input.rowOffset ?? 0
  if (!Number.isInteger(rowOffset) || rowOffset < 0 || rowOffset > MAX_FILE_ROWS)
    return { error: 'Invalid upload position. Upload the file again.' }
  const fields = ['name', 'phone', 'email', 'niche', 'service', 'complaint', 'notes', 'patientId', 'lastVisit', 'doNotCall'] as const
  if (rows.some(r => !r || typeof r !== 'object' || fields.some(k => r[k] !== undefined && (typeof r[k] !== 'string' || r[k]!.length > (k === 'notes' ? 10000 : 500)))))
    return { error: 'Invalid CSV fields. Check the file and upload again.' }
  if (input.sourceSystem !== undefined && typeof input.sourceSystem !== 'string')
    return { error: 'Enter a valid source system label.' }
  const source = (input.sourceSystem?.trim().toLowerCase().replace(/\s+/g, ' ') || 'csv')
  if (source.length > 80) return { error: 'Source system must be 80 characters or fewer.' }

  const supabase = getAdminClient()

  // 1. Save/refresh the service -> niche mappings for this practice
  if (input.mappings !== undefined && (!Array.isArray(input.mappings) || input.mappings.length > MAX_IMPORT_ROWS ||
    input.mappings.some(m => !m || typeof m.service_label !== 'string' || m.service_label.length > 500 ||
      (m.niche_id !== null && typeof m.niche_id !== 'string'))))
    return { error: 'Invalid service mappings.' }
  const mappings = (input.mappings ?? []).filter((m) => m.service_label.trim())
  const nicheByService = new Map(
    mappings.map((m) => [m.service_label.trim().toLowerCase(), m.niche_id]),
  )

  // 2. Practice default niche + default pipeline stage
  const [ownerResult, stageResult, allActiveNiches] = await Promise.all([
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
    getNiches(true),
  ])
  if (ownerResult.error || stageResult.error) return { error: 'Could not load practice settings. Please try again.' }
  const ownerRow = ownerResult.data
  const newStage = stageResult.data
  const validNicheIds = new Set(allActiveNiches.map(n => n.id))
  if (mappings.some(m => m.niche_id && !validNicheIds.has(m.niche_id)))
    return { error: 'A selected service niche is no longer available. Choose its mapping again.' }
  const defaultNicheId = ownerRow?.default_niche_id ?? null

  // Validate the forced file-level niche against real, active niches
  let forcedNicheId: string | null = null
  if (input.forceNicheId) {
    if (!validNicheIds.has(input.forceNicheId)) return { error: 'The selected niche is no longer available.' }
    forcedNicheId = input.forceNicheId
  }

  // Niches this account can actually use, for resolving a "Niche" column.
  // We also load every active niche so we can tell the difference between a
  // niche value we truly don't recognize (a typo) and one that is a real
  // niche the account simply hasn't had enabled yet — the latter needs a
  // "contact the Reactivation Power team" message, not a "check spelling" one.
  const ownerNiches = await getOwnerNiches(ownerId)
  const enabledNicheIds = new Set(ownerNiches.map(n => n.id))
  const unmatchedNiches = new Set<string>()
  // Canonical names of real niches present in the file but not enabled here
  const notEnabledNiches = new Set<string>()

  const resolvedRows: ResolvedImportRow[] = []

  for (const row of rows) {
    const serviceRaw = (row.service ?? '').trim()
    const serviceKey = serviceRaw.replace(/\s+/g, ' ').toLowerCase()
    const mapped = serviceKey ? nicheByService.get(serviceKey) : undefined

    // A Niche column on the row beats the service mapping, but a niche
    // forced for the whole upload still wins over everything.
    const nicheRaw = (row.niche ?? '').trim()
    let rowNicheId: string | undefined
    if (nicheRaw) {
      const match = matchNicheByName(nicheRaw, ownerNiches)
      if (match) rowNicheId = match.id
      else {
        // Not one of the account's enabled niches. Is it a real niche that
        // just isn't turned on here, or genuinely unrecognized?
        const systemMatch = matchNicheByName(nicheRaw, allActiveNiches)
        if (systemMatch) {
          notEnabledNiches.add(systemMatch.name)
          // Store the patient's TRUE niche even though it isn't enabled yet.
          // We deliberately do NOT fall back to the account default — that
          // would silently load the wrong script. The contact shows flagged
          // ("… — not active") and is blocked from calling until the team
          // turns the niche on, at which point it self-heals to the right
          // script with no re-import.
          rowNicheId = systemMatch.id
        } else {
          unmatchedNiches.add(nicheRaw)
        }
      }
    }

    const nicheId = forcedNicheId ?? rowNicheId ?? mapped ?? defaultNicheId
    if (nicheId && !enabledNicheIds.has(nicheId)) {
      const niche = allActiveNiches.find(n => n.id === nicheId)
      if (niche) notEnabledNiches.add(niche.name)
    }

    resolvedRows.push({
      row: { ...row, notes: row.notes ? sanitizeNotes(row.notes) : '' } as PatientImportRow,
      nicheId,
    })
  }

  try {
    const result = await executePatientImport({
      ownerId, participantId: participant.id, source, stageId: newStage?.id ?? null,
      simulated: Boolean(participant.is_demo),
      mappings,
      firstRowNumber: rowOffset + 1,
    }, resolvedRows)
    revalidatePath('/portal', 'layout')
    return { ...result, unmatchedNiches: Array.from(unmatchedNiches).slice(0, 8), notEnabledNiches: Array.from(notEnabledNiches).slice(0, 12) }
  } catch (error) {
    logger.error({ code: (error as { code?: string }).code }, 'Patient CSV transaction failed')
    return { error: 'Import failed. No patients were changed. Please try again.' }
  }
}

export async function listPatientImportReviews() {
  const participant = await getCurrentParticipant()
  if (!participant) return { error: 'Not signed in' }
  if (participant.is_demo) return { reviews: [] }
  return { reviews: await listImportReviews(accessOwnerId(participant)) }
}

export async function resolvePatientImportReview(input: { reviewId: string; decision: 'match' | 'create' | 'ignore'; contactId?: string }) {
  const participant = await getCurrentParticipant()
  if (!participant) return { error: 'Not signed in' }
  if (participant.is_demo) return { error: 'Demo uploads are previews only.' }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!input || !uuid.test(input.reviewId ?? '') || !['match', 'create', 'ignore'].includes(input.decision) || (input.contactId && !uuid.test(input.contactId)))
    return { error: 'Invalid review selection.' }
  const supabase = getAdminClient()
  const { data: stage } = await supabase.from('pipeline_stages').select('id').is('owner_id', null).order('sort_order').limit(1).maybeSingle()
  try {
    await resolveImportReview({ ownerId: accessOwnerId(participant), participantId: participant.id, stageId: stage?.id ?? null }, input)
    revalidatePath('/portal', 'layout')
    return { resolved: true as const }
  } catch (error) {
    const e = error as Error & { code?: string }
    return { error: e.code ? 'Could not resolve this row. No patients were changed.' : e.message }
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
  revalidatePath('/portal', 'layout')
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
  revalidatePath('/portal', 'layout')
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
  revalidatePath('/portal', 'layout')
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
  revalidatePath('/portal', 'layout')
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
  revalidatePath('/portal', 'layout')
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

  const member = await changeCallerSeat(participant.id, {
    kind: 'add', firstName, lastName, email, phone: phone || null,
  })
  if (member.error || !member.id) return { error: member.error ?? 'Could not add the caller.' }
  await sendPortalWelcomeEmail({
    participantId: member.id,
    firstName,
    email,
    role: 'staff',
    ownerName: `${participant.first_name} ${participant.last_name}`.trim(),
    source: 'portal',
  })
  revalidatePath('/portal', 'layout')
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

  const result = await changeCallerSeat(participant.id, { kind: 'active', memberId, active: isActive })
  if (result.error) return { error: result.error }
  revalidatePath('/portal', 'layout')
  return {}
}

/**
 * Owner edits one of their own callers' name / email / phone — so a typo
 * doesn't require an admin ticket. Same parent_id ownership guard as toggle.
 */
export async function updateTeamMember(formData: FormData) {
  const participant = await getCurrentParticipant()
  if (!participant) return { error: 'Not signed in' }
  if (participant.role !== 'owner')
    return { error: 'Only the account owner can edit callers' }
  const memberId = String(formData.get('memberId') ?? '')
  if (!memberId) return { error: 'Missing caller' }

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
  const { error } = await supabase
    .from('participants')
    .update({
      first_name: firstName,
      last_name: lastName,
      email,
      phone: phone || null,
    })
    .eq('id', memberId)
    .eq('parent_id', participant.id) // ownership guard
  if (error) {
    if (error.code === '23505')
      return { error: 'Someone with this email already exists.' }
    return { error: error.message }
  }
  revalidatePath('/portal', 'layout')
  return {}
}

/**
 * Any signed-in participant (owner or caller) updates their OWN name, email,
 * and phone. Scoped to participant.id — nothing else is editable here.
 */
export async function updateMyProfile(formData: FormData) {
  const participant = await getCurrentParticipant()
  if (!participant) return { error: 'Not signed in' }

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
  const { error } = await supabase
    .from('participants')
    .update({
      first_name: firstName,
      last_name: lastName,
      email,
      phone: phone || null,
    })
    .eq('id', participant.id)
  if (error) {
    if (error.code === '23505')
      return { error: 'Someone with this email already exists.' }
    return { error: error.message }
  }
  revalidatePath('/portal', 'layout')
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

/**
 * A fixed-interval follow-up N months out, anchored to 10:00 AM EASTERN.
 * We must NOT use setHours() here — that sets the hour in the server's clock
 * (UTC), which lands at ~5:00 AM Eastern in winter. Anchoring to ET keeps
 * every rescheduled call inside normal calling hours (9am-7pm ET).
 */
function monthsFromNow(months: number): Date {
  const d = new Date()
  d.setUTCMonth(d.getUTCMonth() + months)
  return easternWallClockToUtc(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    10,
    0,
  )
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
  const appointmentAtRaw = String(formData.get('appointmentAt') ?? '')
  const appointmentAt =
    appointmentAtRaw && !Number.isNaN(new Date(appointmentAtRaw).getTime())
      ? new Date(appointmentAtRaw).toISOString()
      : null

  const valid: CallDisposition[] = [
    'no_answer',
    'voicemail',
    'spoke_did_not_schedule',
    'spoke_call_back_later',
    'scheduled',
    'do_not_call',
    'service_declined',
    'appointment_confirmed',
    'appointment_cancelled',
  ]
  if (!contactId || !valid.includes(disposition))
    return { error: 'Missing contact or disposition' }

  const token = String(formData.get('leaseToken') ?? '')
  if (!uuidPattern.test(contactId) || !uuidPattern.test(token)) return { error: 'Open this patient from Calls Due Now before logging a call.' }
  const pickedCallback = callBackAt && !Number.isNaN(new Date(callBackAt).getTime()) ? new Date(callBackAt).toISOString() : null
  try {
    const enabled = new Set((await getOwnerNiches(ownerId)).map(n => n.id))
    const result = await savePatientCall(ownerId, participant.id, enabled, {
      contactId, token, disposition, voicemailLeft, notes, callBackAt: pickedCallback, appointmentAt, retryAt: nextScatteredRetry().toISOString(),
    })
    revalidatePath('/portal', 'layout')
    return result
  } catch (error) { return { error: error instanceof Error ? error.message : 'Unable to save the call.' } }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export async function claimPatientCall(contactId: string) {
  const participant = await getCurrentParticipant()
  if (!participant) return { error: 'Not signed in' }
  if (!uuidPattern.test(contactId)) return { error: 'Invalid patient.' }
  const ownerId = accessOwnerId(participant)
  try { return await claimPatient(ownerId, participant.id, contactId, new Set((await getOwnerNiches(ownerId)).map(n => n.id))) }
  catch (error) { return { error: error instanceof Error ? error.message : 'Unable to start this call.' } }
}
export async function renewPatientCall(contactId: string, token: string) {
  const p = await getCurrentParticipant()
  if (!p || !uuidPattern.test(contactId) || !uuidPattern.test(token)) return { renewed: false }
  return renewPatient(accessOwnerId(p), p.id, contactId, token)
}
export async function releasePatientCall(contactId: string, token: string) {
  const p = await getCurrentParticipant()
  if (!p || !uuidPattern.test(contactId) || !uuidPattern.test(token)) return {}
  return releasePatient(accessOwnerId(p), p.id, contactId, token)
}
export async function reopenService(contactId: string, serviceId: string, reason: string) {
  const p = await getCurrentParticipant()
  if (!p) return { error: 'Not signed in' }
  if (!uuidPattern.test(contactId) || !uuidPattern.test(serviceId)) return { error: 'Invalid patient or service.' }
  try {
    const result = await reopenPatientService(accessOwnerId(p), contactId, serviceId, p.id, reason)
    revalidatePath('/portal', 'layout')
    return result
  } catch (error) { return { error: error instanceof Error ? error.message : 'Unable to reopen the service.' } }
}
