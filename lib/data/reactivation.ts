import 'server-only'

import { getAdminClient } from '@/lib/supabase/admin'
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
