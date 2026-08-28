import 'server-only'

import { getAdminClient } from '@/lib/supabase/admin'
import { dueWithinEasternToday } from '@/lib/call-time'
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
} from '@/lib/types'

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

export { extractSlots, mergeScript } from '@/lib/script-merge'

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
export async function getScriptFlow(): Promise<ScriptFlow> {
  const supabase = getAdminClient()
  const [{ data: steps }, { data: choices }] = await Promise.all([
    supabase.from('script_flow_steps').select('*').order('sort_order'),
    supabase.from('script_flow_choices').select('*').order('sort_order'),
  ])
  return {
    steps: (steps ?? []) as ScriptFlowStep[],
    choices: (choices ?? []) as ScriptFlowChoice[],
  }
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
  niche: Niche | null
  stage: PipelineStage | null
  next_follow_up: FollowUp | null
  last_call: ReactivationCall | null
  call_count: number
}

export async function getContacts(ownerId: string): Promise<ContactWithMeta[]> {
  const supabase = getAdminClient()
  const { data: contacts } = await supabase
    .from('contacts')
    .select('*, niche:niches(*), stage:pipeline_stages(*)')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
  if (!contacts || contacts.length === 0) return []

  const ids = contacts.map((c) => c.id)
  const [{ data: followUps }, { data: calls }] = await Promise.all([
    supabase
      .from('follow_ups')
      .select('*')
      .in('contact_id', ids)
      .is('completed_call_id', null)
      .order('due_at'),
    supabase
      .from('reactivation_calls')
      .select('*')
      .in('contact_id', ids)
      .order('created_at', { ascending: false }),
  ])

  const nextByContact = new Map<string, FollowUp>()
  for (const f of (followUps ?? []) as FollowUp[]) {
    if (!nextByContact.has(f.contact_id)) nextByContact.set(f.contact_id, f)
  }
  const lastCallByContact = new Map<string, ReactivationCall>()
  const callCounts = new Map<string, number>()
  for (const c of (calls ?? []) as ReactivationCall[]) {
    if (!lastCallByContact.has(c.contact_id))
      lastCallByContact.set(c.contact_id, c)
    callCounts.set(c.contact_id, (callCounts.get(c.contact_id) ?? 0) + 1)
  }

  return contacts.map((c) => ({
    ...(c as Contact),
    niche: (c.niche ?? null) as Niche | null,
    stage: (c.stage ?? null) as PipelineStage | null,
    next_follow_up: nextByContact.get(c.id) ?? null,
    last_call: lastCallByContact.get(c.id) ?? null,
    call_count: callCounts.get(c.id) ?? 0,
  }))
}

export async function getContact(id: string): Promise<ContactWithMeta | null> {
  const supabase = getAdminClient()
  const { data: c } = await supabase
    .from('contacts')
    .select('*, niche:niches(*), stage:pipeline_stages(*)')
    .eq('id', id)
    .maybeSingle()
  if (!c) return null

  const [{ data: followUps }, { data: calls }] = await Promise.all([
    supabase
      .from('follow_ups')
      .select('*')
      .eq('contact_id', id)
      .is('completed_call_id', null)
      .order('due_at')
      .limit(1),
    supabase
      .from('reactivation_calls')
      .select('*')
      .eq('contact_id', id)
      .order('created_at', { ascending: false }),
  ])

  return {
    ...(c as Contact),
    niche: (c.niche ?? null) as Niche | null,
    stage: (c.stage ?? null) as PipelineStage | null,
    next_follow_up: ((followUps ?? [])[0] ?? null) as FollowUp | null,
    last_call: ((calls ?? [])[0] ?? null) as ReactivationCall | null,
    call_count: calls?.length ?? 0,
  }
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
  const contacts = await getContacts(ownerId)
  const byId = new Map(contacts.map((c) => [c.id, c]))
  const items: QueueItem[] = []
  for (const c of contacts) {
    if (c.do_not_call) continue
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
  /** Everything due now: released cold calls + due scheduled callbacks */
  queue: QueueItem[]
  /** How many due items are cold-list initial calls (subject to the cap) */
  releasedInitial: number
  /** Uncalled contacts still held in reserve (no follow-up yet) */
  waiting: number
  /** The account's batch target */
  batchSize: number
}

/** An uncalled contact is a reserve candidate when it has no open follow-up */
function isReserveCandidate(c: ContactWithMeta): boolean {
  return !c.do_not_call && !c.next_follow_up && !c.first_call_at
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
  const contacts = await getContacts(ownerId)
  const reserve = contacts
    .filter(isReserveCandidate)
    // getContacts returns newest-first; reverse so we release oldest imports first
    .reverse()
    .slice(0, count)
  const released = await insertInitialFollowUps(reserve)
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
 * Implementation note: this reads contacts exactly once and computes the
 * release from that single snapshot, appending freshly-released contacts to
 * the queue in memory. It deliberately does NOT re-read after inserting —
 * Next.js memoizes identical fetches within a render, so a re-read returns
 * the stale pre-insert data. That stale read previously made every load
 * think the queue was empty and release another batch (a runaway).
 * Release-from-one-snapshot makes it idempotent per request.
 */
export async function getCallQueueState(
  ownerId: string,
  batchSize: number,
): Promise<CallQueueState> {
  const target = Math.max(1, batchSize)
  const contacts = await getContacts(ownerId)
  const byId = new Map(contacts.map((c) => [c.id, c]))

  // Base queue: every contact whose follow-up is overdue or due sometime
  // today (Eastern). A contact scattered to the afternoon shows all day with
  // a "Call afternoon" hint rather than staying hidden until its exact time.
  const queue: QueueItem[] = []
  for (const c of contacts) {
    if (c.do_not_call || !c.next_follow_up) continue
    if (dueWithinEasternToday(c.next_follow_up.due_at)) {
      queue.push({ follow_up: c.next_follow_up, contact: byId.get(c.id)! })
    }
  }
  let releasedInitial = queue.filter(
    (q) => q.follow_up.reason === 'initial',
  ).length

  // Reserve candidates from this same snapshot (oldest import first).
  const reserve = contacts.filter(isReserveCandidate).reverse()

  // Only refill when the live cold-call queue is empty — then release a full
  // batch. Append synthetic items so they appear in THIS render without a
  // stale re-fetch.
  const releasedIds = new Set<string>()
  if (releasedInitial === 0 && reserve.length > 0) {
    const toRelease = reserve.slice(0, target)
    const released = await insertInitialFollowUps(toRelease)
    for (const c of released) {
      queue.push(syntheticQueueItem(c))
      releasedIds.add(c.id)
    }
    releasedInitial += released.length
  }

  queue.sort(
    (a, b) =>
      new Date(a.follow_up.due_at).getTime() -
      new Date(b.follow_up.due_at).getTime(),
  )

  // Reserve remaining = candidates we did not just release.
  const waiting = reserve.filter((c) => !releasedIds.has(c.id)).length

  return { queue, releasedInitial, waiting, batchSize: target }
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
    .select('caller_id, disposition, created_at')
    .in('caller_id', memberIds)

  return members.map((m) => {
    const mine = (calls ?? []).filter((c) => c.caller_id === m.id)
    const week = mine.filter((c) => new Date(c.created_at) >= weekAgo)
    const reached = mine.filter((c) =>
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
        mine.length > 0 ? Math.round((scheduled / mine.length) * 100) : 0,
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
