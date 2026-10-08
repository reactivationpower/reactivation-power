
import { getAdminClient } from '@/lib/supabase/admin'
import { pool } from '@workspace/db'
import { ensurePrimaryServices } from '@/lib/patients/outreach'
import { planOutreach } from '@/lib/patients/outreach-policy'
import { readQueuePatients, isQueueReserve, type QueuePatient } from '@/lib/patients/queue-read'
import type { PatientService } from '@workspace/shared/csv-patients'
import { dueWithinEasternToday } from '@workspace/shared/call-time'
import type {
  Contact,
  FollowUp,
  Niche,
  Participant,
  PipelineStage,
  ReactivationCall,
  ReactivationScript,
  ScriptFlowChoice,
  ScriptFlowStep,
  ScriptSection,
  Sector,
  ServiceNicheMapping,
} from '@workspace/shared/types'

// ---------- Niches ----------

export async function getNiches(
  activeOnly = false,
  sectors?: Sector[],
): Promise<Niche[]> {
  const supabase = getAdminClient()
  let query = supabase.from('niches').select('*').order('sort_order')
  if (activeOnly) query = query.eq('is_active', true)
  if (sectors && sectors.length > 0) query = query.in('sector', sectors)
  const { data } = await query
  return (data ?? []) as Niche[]
}

/** Niche ids an access-owner has been granted (mirrors course_access) */
export async function getAccessibleNicheIds(
  ownerId: string,
): Promise<string[]> {
  const supabase = getAdminClient()
  const { data } = await supabase
    .from('niche_access')
    .select('niche_id')
    .eq('participant_id', ownerId)
  return (data ?? []).map((r) => r.niche_id as string)
}

/**
 * Active niches the owner's account can use in the portal — the global
 * active list filtered down to what has been toggled on for the account.
 * Staff inherit from their owner via accessOwnerId upstream.
 */
export async function getOwnerNiches(
  ownerId: string,
  sectors?: Sector[],
): Promise<Niche[]> {
  const [niches, accessIds] = await Promise.all([
    getNiches(true, sectors),
    getAccessibleNicheIds(ownerId),
  ])
  const allowed = new Set(accessIds)
  return niches.filter((n) => allowed.has(n.id))
}

// ---------- Scripts ----------

export async function getMasterScript(): Promise<ReactivationScript | null> {
  const supabase = getAdminClient()
  const { data } = await supabase
    .from('reactivation_scripts')
    .select('*')
    .order('created_at')
    .limit(1)
    .maybeSingle()
  return data as ReactivationScript | null
}

export async function getScriptSections(
  nicheId?: string,
): Promise<ScriptSection[]> {
  const supabase = getAdminClient()
  let query = supabase.from('script_sections').select('*')
  if (nicheId) query = query.eq('niche_id', nicheId)
  const { data } = await query
  return (data ?? []) as ScriptSection[]
}

export { extractSlots, mergeScript } from '@workspace/shared/script-merge'

// ---------- Interactive script flow ----------

export interface ScriptFlow {
  steps: ScriptFlowStep[]
  choices: ScriptFlowChoice[]
}

/**
 * All flow steps and choices — general defaults (niche_id null) plus every
 * niche override. The client filters per selected niche: a niche row with the
 * same step_key replaces the general one.
 */
export type ScriptFlowKind = 'reactivation' | 'lead'

export async function getScriptFlow(kind: ScriptFlowKind = 'reactivation'): Promise<ScriptFlow> {
  const [steps, choices] = await Promise.all([
    fetchAllRows<ScriptFlowStep>('script_flow_steps', kind),
    fetchAllRows<ScriptFlowChoice>('script_flow_choices', kind),
  ])
  return { steps, choices }
}

/**
 * Fetch every row of one flow family from a script-flow table, paging past
 * PostgREST's per-request row cap (1000). Both tables exceed 1000 rows across
 * all niches, and a single request silently truncated to the first 1000 by
 * sort_order — which dropped every choice/step at higher sort orders. We page
 * in 1000-row chunks with a stable (sort_order, id) order so page boundaries
 * never skip or duplicate a row. `flow_kind` keeps the lead family and the
 * reactivation family apart even though they share step keys.
 */
async function fetchAllRows<T>(
  table: 'script_flow_steps' | 'script_flow_choices',
  kind: ScriptFlowKind,
): Promise<T[]> {
  const supabase = getAdminClient()
  const PAGE = 1000
  const all: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('flow_kind', kind)
      .order('sort_order')
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) throw error
    const rows = (data ?? []) as T[]
    all.push(...rows)
    if (rows.length < PAGE) break
  }
  return all
}

// ---------- Service -> niche mappings (learned at CSV import) ----------

export async function getServiceMappings(
  ownerId: string,
): Promise<ServiceNicheMapping[]> {
  const supabase = getAdminClient()
  const { data } = await supabase
    .from('service_niche_mappings')
    .select('*')
    .eq('owner_id', ownerId)
    .order('service_label')
  return (data ?? []) as ServiceNicheMapping[]
}

// ---------- Pipeline stages ----------

/** Global default stages plus the owner's custom stages, sorted */
export async function getPipelineStages(
  ownerId: string,
): Promise<PipelineStage[]> {
  const supabase = getAdminClient()
  const { data } = await supabase
    .from('pipeline_stages')
    .select('*')
    .or(`owner_id.is.null,owner_id.eq.${ownerId}`)
    .order('sort_order')
    .order('created_at')
  return (data ?? []) as PipelineStage[]
}

// ---------- Contacts ----------

export interface ContactWithMeta extends Contact {
  outreach_available_at?: string | null
  outreach_blocked?: string | null
  call_assigned?: boolean
  services?: PatientService[]
  niche: Niche | null
  stage: PipelineStage | null
  next_follow_up: FollowUp | null
  last_call: ReactivationCall | null
  call_count: number
  /**
   * Whether the contact's niche is currently enabled on the account. False
   * means the niche exists but hasn't been turned on (e.g. imported before
   * it was purchased) — the UI flags it "… — not active" and blocks calling
   * so no one runs the wrong script. A contact with no niche is treated as
   * active (nothing to flag).
   */
  niche_active: boolean
}

export async function getContacts(ownerId: string): Promise<ContactWithMeta[]> {
  await ensurePrimaryServices(ownerId)
  // Direct, tenant-scoped SQL avoids Supabase's default 1,000-row response
  // cap, which would otherwise hide patients after a large CSV import.
  const { rows: contacts } = await pool.query(`SELECT c.*, row_to_json(n) AS niche, row_to_json(s) AS stage,
    (SELECT row_to_json(f) FROM follow_ups f WHERE f.contact_id = c.id AND f.completed_call_id IS NULL
      ORDER BY CASE WHEN f.call_context = 'confirmation' OR f.reason = 'manual' THEN 0 WHEN f.reason = 'retry' THEN 1 ELSE 2 END, f.due_at LIMIT 1) AS next_follow_up,
    EXISTS (SELECT 1 FROM patient_call_leases l WHERE l.contact_id = c.id AND l.expires_at > now()) AS call_assigned,
    (SELECT row_to_json(rc) FROM reactivation_calls rc WHERE rc.contact_id = c.id ORDER BY rc.created_at DESC LIMIT 1) AS last_call,
    (SELECT count(*)::integer FROM reactivation_calls rc WHERE rc.contact_id = c.id) AS call_count
    FROM contacts c LEFT JOIN niches n ON n.id = c.niche_id LEFT JOIN pipeline_stages s ON s.id = c.stage_id
    WHERE c.owner_id = $1 ORDER BY c.created_at DESC`, [ownerId])
  if (!contacts || contacts.length === 0) return []

  // Niche ids currently usable on this account (enabled AND globally active),
  // to flag contacts whose niche isn't turned on (e.g. imported before it was
  // purchased/activated).
  const ownerNiches = await getOwnerNiches(ownerId)
  const activeNicheIds = new Set(ownerNiches.map(n => n.id))

  const servicesByContact = new Map<string, PatientService[]>()
  for (const service of await getPatientServices(ownerId)) {
    const list = servicesByContact.get(service.contact_id) ?? []
    list.push(service)
    servicesByContact.set(service.contact_id, list)
  }

  return contacts.map((c) => coordinateContact({
    ...(c as Contact),
    // pg returns top-level timestamptz as Date; preserve the existing DTO.
    created_at: new Date(c.created_at).toISOString(),
    first_call_at: c.first_call_at ? new Date(c.first_call_at).toISOString() : null,
    services: servicesByContact.get(c.id) ?? [],
    niche: (c.niche ?? null) as Niche | null,
    stage: (c.stage ?? null) as PipelineStage | null,
    next_follow_up: c.next_follow_up ?? null,
    last_call: c.last_call ?? null,
    call_count: c.call_count ?? 0,
    niche_active: !c.niche_id || activeNicheIds.has(c.niche_id),
  }, ownerNiches))
}

function coordinateContact(contact: ContactWithMeta, niches: Niche[]): ContactWithMeta {
  const plan = planOutreach(contact, new Set(niches.map(n => n.id)))
  const service = contact.services?.find(s => s.id === plan.service?.id) ?? null
  return {
    ...contact,
    outreach_blocked: plan.blocked,
    outreach_available_at: plan.dueAt,
    niche_id: service?.niche_id ?? contact.niche_id,
    niche: service?.niche_id ? niches.find(n => n.id === service.niche_id) ?? contact.niche : contact.niche,
    service_label: service?.service_label ?? contact.service_label,
    original_complaint: service ? service.original_complaint : contact.original_complaint,
    niche_active: !service?.niche_id || niches.some(n => n.id === service.niche_id),
    next_follow_up: contact.next_follow_up && plan.dueAt ? {
      ...contact.next_follow_up, due_at: plan.dueAt,
      call_context: plan.context, service_id: service?.id ?? null,
    } : contact.next_follow_up,
  } as ContactWithMeta
}

async function getPatientServices(ownerId: string, contactId?: string | string[]): Promise<PatientService[]> {
  const { rows } = await pool.query(`SELECT s.id, s.contact_id, s.niche_id, s.service_label, s.created_at,
    s.outreach_status, s.cycle_started_at, s.last_attempt_at, s.last_outcome,
    s.last_visit::text, s.original_complaint, s.source_notes, n.name AS niche_name
    FROM contact_services s LEFT JOIN niches n ON n.id = s.niche_id
    WHERE s.owner_id = $1 ${contactId ? Array.isArray(contactId) ? 'AND s.contact_id = ANY($2::uuid[])' : 'AND s.contact_id = $2' : ''}
    ORDER BY s.created_at, s.id`, contactId ? [ownerId, contactId] : [ownerId])
  return rows as PatientService[]
}

/** Hydrate only patients that will be displayed or released, never the reserve. */
async function hydrateQueuePatients(ownerId: string, patients: QueuePatient[], niches: Niche[]): Promise<ContactWithMeta[]> {
  if (!patients.length) return []
  const ids = patients.map(p => p.id)
  const [{ rows }, services] = await Promise.all([
    pool.query(`SELECT c.*, row_to_json(n) AS niche, row_to_json(s) AS stage,
      (SELECT row_to_json(r) FROM reactivation_calls r WHERE r.contact_id = c.id
        ORDER BY r.created_at DESC, r.id DESC LIMIT 1) AS last_call,
      (SELECT count(*)::integer FROM reactivation_calls r WHERE r.contact_id = c.id) AS call_count
      FROM contacts c LEFT JOIN niches n ON n.id = c.niche_id LEFT JOIN pipeline_stages s ON s.id = c.stage_id
      WHERE c.owner_id = $1 AND c.id = ANY($2::uuid[])`, [ownerId, ids]),
    getPatientServices(ownerId, ids),
  ])
  const byId = new Map(rows.map(c => [c.id, c]))
  const byContact = new Map<string, PatientService[]>()
  for (const s of services) {
    const group = byContact.get(s.contact_id) ?? []
    group.push(s)
    byContact.set(s.contact_id, group)
  }
  const nicheById = new Map(niches.map(n => [n.id, n]))
  return patients.flatMap(p => {
    const c = byId.get(p.id)
    if (!c) return []
    const fullServices = byContact.get(p.id) ?? []
    const service = fullServices.find(s => s.id === p.plan.service?.id)
    const nicheId = p.plan.service?.niche_id ?? c.niche_id
    return [{
      ...c, created_at: new Date(c.created_at).toISOString(),
      first_call_at: c.first_call_at ? new Date(c.first_call_at).toISOString() : null,
      services: fullServices, niche_id: nicheId,
      niche: nicheById.get(nicheId) ?? c.niche,
      service_label: service?.service_label ?? c.service_label,
      original_complaint: service ? service.original_complaint : c.original_complaint,
      niche_active: !p.plan.service?.niche_id || nicheById.has(p.plan.service.niche_id),
      outreach_blocked: p.plan.blocked, outreach_available_at: p.plan.dueAt,
      call_assigned: false,
      next_follow_up: p.next_follow_up && p.plan.dueAt ? {
        ...p.next_follow_up, due_at: p.plan.dueAt,
        call_context: p.plan.context, service_id: service?.id ?? null,
      } : p.next_follow_up,
    } as ContactWithMeta]
  })
}

export async function getContact(id: string): Promise<ContactWithMeta | null> {
  const supabase = getAdminClient()
  const { data: c } = await supabase
    .from('contacts')
    .select('*, niche:niches(*), stage:pipeline_stages(*)')
    .eq('id', id)
    .maybeSingle()
  if (!c) return null
  await ensurePrimaryServices((c as Contact).owner_id, pool, id)

  const [{ data: followUps }, { data: calls }, ownerNiches] =
    await Promise.all([
      supabase
        .from('follow_ups')
        .select('*')
        .eq('contact_id', id)
        .is('completed_call_id', null)
        .order('due_at'),
      supabase
        .from('reactivation_calls')
        .select('*')
        .eq('contact_id', id)
        .order('created_at', { ascending: false }),
      getOwnerNiches((c as Contact).owner_id),
    ])

  const activeNicheIds = new Set(ownerNiches.map((n) => n.id))

  const priority = (f: any) => f.call_context === 'confirmation' || f.reason === 'manual' ? 0 : f.reason === 'retry' ? 1 : 2
  const pending = (followUps ?? []).sort((a, b) => priority(a) - priority(b) || new Date(a.due_at).getTime() - new Date(b.due_at).getTime())
  return coordinateContact({
    ...(c as Contact),
    services: await getPatientServices((c as Contact).owner_id, id),
    niche: (c.niche ?? null) as Niche | null,
    stage: (c.stage ?? null) as PipelineStage | null,
    next_follow_up: (pending[0] ?? null) as FollowUp | null,
    last_call: ((calls ?? [])[0] ?? null) as ReactivationCall | null,
    call_count: calls?.length ?? 0,
    niche_active:
      !(c as Contact).niche_id ||
      activeNicheIds.has((c as Contact).niche_id as string),
  }, ownerNiches)
}

export interface CallWithCaller extends ReactivationCall {
  caller: Pick<Participant, 'id' | 'first_name' | 'last_name'> | null
}

export async function getCallHistory(
  contactId: string,
): Promise<CallWithCaller[]> {
  const supabase = getAdminClient()
  const { data } = await supabase
    .from('reactivation_calls')
    .select('*, caller:participants(id, first_name, last_name)')
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false })
  return (data ?? []) as CallWithCaller[]
}

// ---------- Call queue ----------

export interface QueueItem {
  follow_up: FollowUp
  contact: ContactWithMeta
}

/** Contacts with a follow-up due now or overdue, for the owner's account */
export async function getCallQueue(ownerId: string): Promise<QueueItem[]> {
  const niches = await getOwnerNiches(ownerId)
  const now = Date.now()
  const snapshot = await readQueuePatients(ownerId, new Set(niches.map(n => n.id)), now)
  const contacts = await hydrateQueuePatients(ownerId, snapshot.filter(p =>
    !p.plan.blocked && p.next_follow_up && p.plan.dueAt && new Date(p.plan.dueAt).getTime() <= now), niches)
  const byId = new Map(contacts.map((c) => [c.id, c]))
  const items: QueueItem[] = []
  for (const c of contacts) {
    if (c.do_not_call || c.outreach_blocked || c.call_assigned) continue
    if (!c.next_follow_up) continue
    if (new Date(c.next_follow_up.due_at) <= new Date()) {
      items.push({ follow_up: c.next_follow_up, contact: byId.get(c.id)! })
    }
  }
  items.sort(
    (a, b) =>
      new Date(a.follow_up.due_at).getTime() -
      new Date(b.follow_up.due_at).getTime(),
  )
  return items
}

/**
 * Batched-release model.
 *
 * A bulk import no longer dumps every contact into the queue. Instead the
 * queue holds at most `batchSize` cold-list ("initial") calls at a time.
 * "Released" = the contact has an open initial follow-up. "Waiting" = an
 * uncalled contact with no follow-up yet — the reserve pool. Real scheduled
 * callbacks (retry/manual/quarterly follow-ups from logged calls) always
 * show and are never throttled.
 */
export interface CallQueueState {
  /**
   * Scheduled callbacks due today (no-answer/VM retries, "call back later"
   * picks, quarterly check-ins). Commitments the system already made — always
   * shown, never throttled, and worked before the fresh batch.
   */
  followUps: QueueItem[]
  /** Fresh cold-list calls released from reserve, capped at batchSize. */
  newCalls: QueueItem[]
  /** Uncalled contacts still held in reserve (no follow-up yet) */
  waiting: number
  /** The account's batch target */
  batchSize: number
}

/** An uncalled contact is a reserve candidate when it has no open follow-up */
function isReserveCandidate(c: ContactWithMeta): boolean {
  return !c.do_not_call && !c.outreach_blocked && !c.call_assigned && !c.next_follow_up && !c.first_call_at &&
    (!c.outreach_available_at || new Date(c.outreach_available_at).getTime() <= Date.now())
}

/**
 * Insert an initial follow-up (due now) for each contact. Returns the
 * contacts that were successfully released. Kept low-level so callers can
 * build the queue in memory without a stale re-read (see below).
 */
async function insertInitialFollowUps(
  contacts: ContactWithMeta[],
): Promise<ContactWithMeta[]> {
  if (contacts.length === 0) return []
  const supabase = getAdminClient()
  const now = new Date().toISOString()
  const { error } = await supabase.from('follow_ups').insert(
    contacts.map((c) => ({
      contact_id: c.id,
      due_at: now,
      reason: 'initial' as const,
    })),
  )
  if (error) return []
  return contacts
}

/**
 * Release up to `count` reserve contacts into the queue by creating an
 * initial follow-up (due now) for each. Oldest-imported first, so the list
 * is worked in a stable order. Returns how many were actually released.
 * Used by the manual "Add More Calls" action.
 */
export async function releaseReserveContacts(
  ownerId: string,
  count: number,
): Promise<number> {
  if (count <= 0) return 0
  const niches = await getOwnerNiches(ownerId)
  const now = Date.now()
  const patients = await readQueuePatients(ownerId, new Set(niches.map(n => n.id)), now)
  const reserve = patients
    .filter(p => isQueueReserve(p, now))
    .reverse()
    .slice(0, count)
  const released = await insertInitialFollowUps(await hydrateQueuePatients(ownerId, reserve, niches))
  return released.length
}

/** Build a synthetic QueueItem for a just-released contact (due now). */
function syntheticQueueItem(contact: ContactWithMeta): QueueItem {
  const now = new Date().toISOString()
  return {
    follow_up: {
      // Not yet re-read from the DB; id is only used as a React key and the
      // Call action keys off contact.id, so a synthetic id is safe.
      id: `pending-${contact.id}`,
      contact_id: contact.id,
      due_at: now,
      reason: 'initial',
      completed_call_id: null,
      created_at: now,
    },
    contact,
  }
}

/**
 * The queue plus reserve counts, releasing a fresh batch when it empties.
 *
 * Rules (agreed with the product owner):
 *  - The queue is never *shown* empty while reserve remains ("never empty"):
 *    when the live cold-call queue hits zero, the next full batch of
 *    `batchSize` is released on the same load, so the staffer always lands
 *    on work.
 *  - Batch rhythm: while cold calls are still in the queue we do NOT keep
 *    topping up — the staffer works the batch down, then the next batch
 *    appears. (The manual "Add More Calls" action pulls the next batch early
 *    for a fast worker — see releaseReserveContacts.)
 *  - No cadence/time gate: purely demand-driven.
 *
 * Policy decisions use one compact snapshot; only visible patients and the
 * next reserve batch are hydrated. Newly released items are appended without
 * a second practice-wide read. Claims still recheck policy under patient lock.
 */
export async function getCallQueueState(
  ownerId: string,
  batchSize: number,
): Promise<CallQueueState> {
  const target = Math.max(1, batchSize)
  const niches = await getOwnerNiches(ownerId)
  const now = Date.now()
  const patients = await readQueuePatients(ownerId, new Set(niches.map(n => n.id)), now)
  const due = patients.filter(p => !p.plan.blocked && p.next_follow_up && p.plan.dueAt &&
    dueWithinEasternToday(p.plan.dueAt))
  const reserve = patients.filter(p => isQueueReserve(p, now)).reverse()
  const hasInitial = due.some(p => p.next_follow_up!.reason === 'initial')
  const toRelease = hasInitial ? [] : reserve.slice(0, target)
  const contacts = await hydrateQueuePatients(ownerId, [...due, ...toRelease], niches)
  const byId = new Map(contacts.map(c => [c.id, c]))

  // Base queue: every contact whose follow-up is overdue or due sometime
  // today (Eastern). A contact scattered to the afternoon shows all day with
  // a "Call afternoon" hint rather than staying hidden until its exact time.
  const queue: QueueItem[] = []
  for (const p of due) {
    const c = byId.get(p.id)
    if (!c) continue
    if (c.do_not_call || c.outreach_blocked || c.call_assigned || !c.next_follow_up) continue
    if (dueWithinEasternToday(c.next_follow_up.due_at)) {
      queue.push({ follow_up: c.next_follow_up, contact: byId.get(c.id)! })
    }
  }
  let releasedInitial = queue.filter(
    (q) => q.follow_up.reason === 'initial',
  ).length

  // Only refill when the live cold-call queue is empty — then release a full
  // batch. Append synthetic items so they appear in THIS render without a
  // stale re-fetch.
  const releasedIds = new Set<string>()
  if (releasedInitial === 0 && reserve.length > 0) {
    const released = await insertInitialFollowUps(toRelease.flatMap(p => byId.has(p.id) ? [byId.get(p.id)!] : []))
    for (const c of released) {
      queue.push(syntheticQueueItem(c))
      releasedIds.add(c.id)
    }
    releasedInitial += released.length
  }

  const byDueAt = (a: QueueItem, b: QueueItem) =>
    new Date(a.follow_up.due_at).getTime() -
    new Date(b.follow_up.due_at).getTime()

  // Split into scheduled callbacks vs fresh cold calls. Callbacks are
  // commitments already made, so they show as their own prioritized group
  // above the batch; only the "initial" cold calls are throttled.
  const followUps = queue
    .filter((q) => q.follow_up.reason !== 'initial')
    .sort(byDueAt)
  const newCalls = queue
    .filter((q) => q.follow_up.reason === 'initial')
    .sort(byDueAt)

  // Reserve remaining = candidates we did not just release.
  const waiting = reserve.filter((c) => !releasedIds.has(c.id)).length

  return { followUps, newCalls, waiting, batchSize: target }
}

// ---------- Team stats ----------

export interface TeamMemberStats {
  participant: Participant
  calls_today: number
  calls_week: number
  scheduled_week: number
  voicemails_week: number
  /** All-time totals for performance comparison */
  calls_total: number
  /** Calls where the caller actually spoke with the patient */
  reached_total: number
  scheduled_total: number
  /** Percent of all calls that ended in a scheduled appointment (0-100) */
  success_rate: number
  /** Percent of conversations (reached) that converted to scheduled (0-100) */
  conversion_rate: number
}

const REACHED_DISPOSITIONS = new Set([
  'spoke_did_not_schedule',
  'spoke_call_back_later',
  'scheduled',
  'service_declined',
])

export async function getTeamStats(
  owner: Participant,
  staff: Participant[],
): Promise<TeamMemberStats[]> {
  const supabase = getAdminClient()
  const members = [owner, ...staff]
  const memberIds = members.map((m) => m.id)

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const { data: calls } = await supabase
    .from('reactivation_calls')
    .select('caller_id, disposition, created_at, call_context')
    .in('caller_id', memberIds)

  return members.map((m) => {
    const mine = (calls ?? []).filter((c) => c.caller_id === m.id)
    const acquisition = mine.filter(c => c.call_context !== 'confirmation')
    const week = mine.filter((c) => new Date(c.created_at) >= weekAgo)
    const reached = acquisition.filter((c) =>
      REACHED_DISPOSITIONS.has(c.disposition),
    ).length
    const scheduled = mine.filter((c) => c.disposition === 'scheduled').length
    return {
      participant: m,
      calls_today: week.filter((c) => new Date(c.created_at) >= startOfToday)
        .length,
      calls_week: week.length,
      scheduled_week: week.filter((c) => c.disposition === 'scheduled').length,
      voicemails_week: week.filter((c) => c.disposition === 'voicemail')
        .length,
      calls_total: mine.length,
      reached_total: reached,
      scheduled_total: scheduled,
      success_rate:
        acquisition.length > 0 ? Math.round((scheduled / acquisition.length) * 100) : 0,
      conversion_rate:
        reached > 0 ? Math.round((scheduled / reached) * 100) : 0,
    }
  })
}

// ---------- Admin accountability ----------

/**
 * A blunt, admin-facing read on whether an account is actually working its
 * list. This is the "they called in saying it's not working" view — it
 * measures throughput and staleness, not a scary overdue count.
 */
export interface AccountReactivationStats {
  totalContacts: number
  /** Cold calls currently live in the queue (released, uncalled) */
  liveInQueue: number
  /** Uncalled contacts still held in reserve */
  waiting: number
  /** Contacts that have been called at least once */
  everCalled: number
  callsThisWeek: number
  callsToday: number
  /** Days the oldest live cold call has sat unworked (null if queue empty) */
  oldestLiveAgeDays: number | null
  /** Most recent call across the whole account (null if never) */
  lastCallAt: string | null
}

export async function getAccountReactivationStats(
  ownerId: string,
  memberIds: string[],
): Promise<AccountReactivationStats> {
  const supabase = getAdminClient()
  const contacts = await getContacts(ownerId)

  const now = Date.now()
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000)

  let liveInQueue = 0
  let waiting = 0
  let everCalled = 0
  let oldestLiveMs: number | null = null

  for (const c of contacts) {
    if (c.first_call_at) everCalled++
    if (isReserveCandidate(c)) {
      waiting++
      continue
    }
    // A live cold call: released initial follow-up, due, not yet called
    const fu = c.next_follow_up
    if (
      !c.do_not_call &&
      fu &&
      fu.reason === 'initial' &&
      new Date(fu.due_at).getTime() <= now
    ) {
      liveInQueue++
      const age = new Date(fu.due_at).getTime()
      if (oldestLiveMs === null || age < oldestLiveMs) oldestLiveMs = age
    }
  }

  let callsThisWeek = 0
  let callsToday = 0
  let lastCallAt: string | null = null
  if (memberIds.length > 0) {
    const { data: calls } = await supabase
      .from('reactivation_calls')
      .select('created_at')
      .in('caller_id', memberIds)
      .order('created_at', { ascending: false })
    for (const c of calls ?? []) {
      const t = new Date(c.created_at)
      if (t >= weekAgo) callsThisWeek++
      if (t >= startOfToday) callsToday++
    }
    lastCallAt = (calls ?? [])[0]?.created_at ?? null
  }

  return {
    totalContacts: contacts.length,
    liveInQueue,
    waiting,
    everCalled,
    callsThisWeek,
    callsToday,
    oldestLiveAgeDays:
      oldestLiveMs === null
        ? null
        : Math.floor((now - oldestLiveMs) / (24 * 60 * 60 * 1000)),
    lastCallAt,
  }
}
