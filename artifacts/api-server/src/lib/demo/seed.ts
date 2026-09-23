
import { randomUUID } from 'node:crypto'
import { getAdminClient } from '@/lib/supabase/admin'
import { easternWallClockToUtc } from '@workspace/shared/call-time'
import type { CallDisposition } from '@workspace/shared/types'
import {
  DEMO_COURSE_ID,
  DEMO_OWNER_TRAINING_COMPLETED,
  DEMO_PRACTICES,
  DEMO_VIDEO_IDS,
  DEMO_STAGE_IDS,
  demoEmail,
  demoPracticeByOwnerEmail,
  getDemoPractice,
  type DemoCallerProfile,
  type DemoPractice,
  type DemoPracticeKey,
} from './config'
import { DEMO_PRACTICE_COPY, type DemoPracticeCopy } from './practice-copy'

/**
 * Demo account seeder.
 *
 * There are two demo practices (see config.ts). Each is built independently:
 * its own owner and staff, niche grants, 100 patients, calls, follow-ups and
 * training progress. Everything here is computed RELATIVE TO NOW (Eastern
 * time) so a presenter who opens the demo two months from now sees a
 * campaign that looks like it started ten weeks ago and made its last call
 * yesterday afternoon. Same 100 patients, same four callers, same story
 * every time — only the dates slide.
 *
 * The generator is deterministic: a seeded PRNG keyed off a per-practice
 * string, so "the closer is ahead, the laggard is behind" is stable across
 * resets.
 *
 * SAFETY: every delete in wipeDemoPractice() is scoped to the participant
 * family (owner + staff) of ONE demo practice, all flagged is_demo = true.
 * Live accounts are never touched, and resetting one demo never touches the
 * other.
 */

// ---------- deterministic PRNG ----------

function mulberry32(seed: number) {
  let a = seed >>> 0
  return function rand() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashSeed(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

let rand = mulberry32(hashSeed('unseeded'))
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]
const chance = (p: number) => rand() < p
const between = (lo: number, hi: number) =>
  lo + Math.floor(rand() * (hi - lo + 1))

/** Restart the stream so every rebuild of a practice tells the identical
 *  story, even when several rebuilds run inside one long-lived server process. */
function resetRng(seed: string) {
  rand = mulberry32(hashSeed(seed))
}

// ---------- query guard ----------

/**
 * Every demo query goes through here. A failed read must never be mistaken
 * for "no rows": that is how a transient 502 once turned into a full rebuild
 * (and nearly a duplicate demo owner). Throwing aborts the seed cleanly.
 */
function must<T>(
  result: { data: T; error: { message: string } | null },
  what: string,
): T {
  if (result.error) throw new Error(`demo ${what}: ${result.error.message}`)
  return result.data
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ---------- Eastern-time date helpers ----------

const ET = 'America/New_York'

function etParts(d: Date) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: ET,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    weekday: 'short',
    hour12: false,
  }).formatToParts(d)
  const get = (t: string) => f.find((p) => p.type === t)?.value ?? ''
  return {
    y: Number(get('year')),
    mo: Number(get('month')),
    d: Number(get('day')),
    h: Number(get('hour')) % 24,
    wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')),
  }
}

/** Midnight ET of (today + offsetDays), returned as a y/mo/d triple. */
function etDay(offsetDays: number) {
  const base = new Date(Date.now() + offsetDays * 86_400_000)
  const p = etParts(base)
  return { y: p.y, mo: p.mo, d: p.d, wd: p.wd }
}

/** A UTC instant for an ET wall-clock time on today+offsetDays. */
function at(offsetDays: number, hour: number, minute = 0): Date {
  const { y, mo, d } = etDay(offsetDays)
  // Intl gives a 1-based month; easternWallClockToUtc feeds Date.UTC (0-based).
  return easternWallClockToUtc(y, mo - 1, d, hour, minute)
}

function isWeekend(offsetDays: number) {
  const wd = etDay(offsetDays).wd
  return wd === 0 || wd === 6
}

/** Random business-hours instant (9:00–5:30 ET) on the given day. */
function businessInstant(offsetDays: number) {
  const hour = between(9, 17)
  const minute = pick([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55])
  return at(offsetDays, hour, minute)
}

// ---------- fake-data pools ----------

function fakePhone(areaCodes: readonly string[]) {
  // 555-01xx is the reserved fictional exchange range; keep the area code real-looking.
  return `(${pick(areaCodes)}) 555-${String(between(100, 199)).padStart(3, '0')}${between(0, 9)}`
}

const EMAIL_DOMAINS = ['gmail.com', 'yahoo.com', 'outlook.com', 'icloud.com', 'comcast.net']
function fakeEmail(first: string, last: string) {
  const styles = [
    `${first}.${last}`,
    `${first}${last}`,
    `${first[0]}${last}`,
    `${first}${last}${between(1, 99)}`,
    `${first}.${last[0]}`,
  ]
  return `${pick(styles).toLowerCase()}@${pick(EMAIL_DOMAINS)}`
}

// ---------- types ----------

interface SeedContact {
  id?: string
  name: string
  phone: string
  email: string | null
  niche_id: string
  stage_id: string | null
  do_not_call: boolean
  notes: string | null
  first_call_at: string | null
  created_at: string
  service_label: string
  original_complaint: string
  owner_id: string
  created_by: string
}

interface SeedCall {
  contact_id: string
  caller_id: string
  disposition: CallDisposition
  voicemail_left: boolean
  notes: string | null
  created_at: string
  appointment_at: string | null
}

interface SeedFollowUp {
  contact_id: string
  due_at: string
  reason: 'retry' | 'three_month' | 'quarterly' | 'manual' | 'initial'
  completed_call_id: string | null
  created_at: string
}

// ---------- the story ----------

/**
 * Per-caller performance profile. Answer rate is per dial; close rate is
 * scheduled / reached. Team-wide these average ~30% / ~30% (so ~9% of dials
 * book), with Sarah above and Tyler clearly below.
 */
function callerProfile(c: DemoCallerProfile) {
  return {
    answer: c.answerRate,
    close: c.closeRate,
    dnc: c.dncRate,
    callbackShare: c.callbackShare,
  }
}

/**
 * Builds one patient's full call history, walking forward from their import
 * date and honoring the real cadence (4–7 day scattered retries, 3-month
 * spoke-didn't-schedule, callback-later manual dates) — so when the presenter
 * clicks a contact, the timeline looks exactly like one the system itself
 * would have produced.
 */
function buildHistory(
  contactId: string,
  importDayOffset: number,
  callerFor: () => DemoCallerProfile,
  copy: DemoPracticeCopy,
  todayOffset = 0,
) {
  const calls: SeedCall[] = []
  const followUps: SeedFollowUp[] = []
  let day = importDayOffset + between(0, 3)
  let firstCallAt: string | null = null
  let stage: keyof typeof DEMO_STAGE_IDS = 'new'
  let dnc = false
  let outcome: 'scheduled' | 'callback' | 'no_sched' | 'dnc' | 'unreached' = 'unreached'
  let notes: string | null = null
  let attempts = 0
  let openFollowUp: SeedFollowUp | null = null

  while (day <= todayOffset - 1 && attempts < 9) {
    if (isWeekend(day)) {
      day += 1
      continue
    }
    const caller = callerFor()
    const prof = callerProfile(caller)
    const when = businessInstant(day)
    if (when.getTime() > Date.now() - 60 * 60 * 1000) break // never in the future
    attempts += 1
    const createdIso = when.toISOString()
    if (!firstCallAt) firstCallAt = createdIso

    // Mark any open follow-up as completed by this call (id patched after insert).
    if (openFollowUp) {
      openFollowUp.completed_call_id = 'PENDING'
      openFollowUp = null
    }

    const reached = chance(prof.answer)
    if (!reached) {
      const vm = attempts % 2 === 0
      calls.push({
        contact_id: contactId,
        caller_id: caller.id,
        disposition: vm ? 'voicemail' : 'no_answer',
        voicemail_left: vm,
        notes: null,
        created_at: createdIso,
        appointment_at: null,
      })
      stage = 'contacting'
      // scattered retry: 4–7 days, random business time
      const gap = between(4, 7)
      const due = businessInstant(day + gap)
      openFollowUp = {
        contact_id: contactId,
        due_at: due.toISOString(),
        reason: 'retry',
        completed_call_id: null,
        created_at: createdIso,
      }
      followUps.push(openFollowUp)
      day += gap
      continue
    }

    // Reached someone.
    if (chance(prof.dnc)) {
      dnc = true
      outcome = 'dnc'
      notes = pick(copy.notesCold)
      calls.push({
        contact_id: contactId,
        caller_id: caller.id,
        disposition: 'do_not_call',
        voicemail_left: false,
        notes: 'Asked not to be contacted again.',
        created_at: createdIso,
        appointment_at: null,
      })
      break
    }

    if (chance(prof.close)) {
      // Booked. Appointment 3–14 days after the call (skipping weekends).
      let apptDay = day + between(3, 14)
      while (isWeekend(apptDay)) apptDay += 1
      const appt = at(apptDay, pick([9, 10, 11, 13, 14, 15, 16]), pick([0, 30]))
      outcome = 'scheduled'
      stage = 'scheduled'
      notes = pick(copy.notesReceptive)
      calls.push({
        contact_id: contactId,
        caller_id: caller.id,
        disposition: 'scheduled',
        voicemail_left: false,
        notes: pick(copy.bookedNotes),
        created_at: createdIso,
        appointment_at: appt.toISOString(),
      })
      // quarterly follow-up after a booking
      const due = at(day + 90, 10)
      followUps.push({
        contact_id: contactId,
        due_at: due.toISOString(),
        reason: 'quarterly',
        completed_call_id: null,
        created_at: createdIso,
      })
      break
    }

    if (chance(prof.callbackShare)) {
      // Call back later — a manual date 2–10 days out at a chosen hour
      const gap = between(2, 10)
      let cbDay = day + gap
      while (isWeekend(cbDay)) cbDay += 1
      const cb = at(cbDay, pick([9, 10, 11, 13, 14, 15, 16, 17]), pick([0, 30]))
      stage = 'spoke_to'
      outcome = 'callback'
      notes = pick(copy.notesReceptive.concat(copy.notesNeutral))
      calls.push({
        contact_id: contactId,
        caller_id: caller.id,
        disposition: 'spoke_call_back_later',
        voicemail_left: false,
        notes: pick(copy.callbackNotes),
        created_at: createdIso,
        appointment_at: null,
      })
      openFollowUp = {
        contact_id: contactId,
        due_at: cb.toISOString(),
        reason: 'manual',
        completed_call_id: null,
        created_at: createdIso,
      }
      followUps.push(openFollowUp)
      // If the callback lands in the past, the loop continues and works it.
      day = cbDay
      continue
    }

    // Spoke, didn't schedule → 3 months out
    stage = 'spoke_to'
    outcome = 'no_sched'
    notes = pick(copy.notesNeutral.concat(copy.notesCold.slice(0, -1)))
    calls.push({
      contact_id: contactId,
      caller_id: caller.id,
      disposition: 'spoke_did_not_schedule',
      voicemail_left: false,
      notes: pick(copy.noScheduleNotes),
      created_at: createdIso,
      appointment_at: null,
    })
    followUps.push({
      contact_id: contactId,
      due_at: at(day + 90, 10).toISOString(),
      reason: 'three_month',
      completed_call_id: null,
      created_at: createdIso,
    })
    break
  }

  if (outcome === 'unreached' && attempts > 0) notes = pick(copy.notesNeverReached) || null

  return { calls, followUps, firstCallAt, stage, dnc, outcome, notes, attempts }
}

// ---------- wipe ----------

/**
 * The participant ids (owner + staff) that belong to one demo practice, by
 * the owner's e-mail. Only rows flagged is_demo are ever returned, so a
 * live account that somehow shared the id space could never be swept up.
 */
async function demoFamilyIds(practice: DemoPractice): Promise<string[]> {
  const supabase = getAdminClient()
  const owner = must(
    await supabase
      .from('participants')
      .select('id')
      .eq('email', demoEmail(practice.owner.email))
      .eq('is_demo', true)
      .maybeSingle(),
    'demo owner lookup',
  )
  if (!owner) return []
  const ownerId = owner.id as string
  const staff = must(
    await supabase
      .from('participants')
      .select('id')
      .eq('parent_id', ownerId)
      .eq('is_demo', true),
    'demo staff lookup',
  )
  return [ownerId, ...(staff ?? []).map((p) => p.id as string)]
}

/** Remove every row that belongs to ONE demo practice; the other is untouched. */
export async function wipeDemoPractice(practice: DemoPractice) {
  const supabase = getAdminClient()
  const ids = await demoFamilyIds(practice)
  if (ids.length === 0) return

  // Contacts cascade to follow_ups + reactivation_calls (FK ON DELETE CASCADE).
  // The five tables are independent of each other, so wipe them in parallel.
  const tables = [
    'contacts',
    'activity_events',
    'video_progress',
    'sessions',
    'service_niche_mappings',
  ] as const
  const results = await Promise.all([
    supabase.from('contacts').delete().in('owner_id', ids),
    supabase.from('activity_events').delete().in('participant_id', ids),
    supabase.from('video_progress').delete().in('participant_id', ids),
    supabase.from('sessions').delete().in('participant_id', ids),
    supabase.from('service_niche_mappings').delete().in('owner_id', ids),
  ])
  results.forEach((r, i) => must(r, `wipe ${tables[i]}`))
}

// ---------- ensure identities ----------

interface DemoNiche {
  id: string
  name: string
}

/**
 * Resolve the practice's niche names to ids from the niches table. A name
 * that is missing (renamed, deactivated) stops the build with a clear error
 * rather than seeding contacts into the wrong niche.
 */
async function resolveDemoNiches(practice: DemoPractice): Promise<Map<string, DemoNiche>> {
  const supabase = getAdminClient()
  const rows = must(
    await supabase
      .from('niches')
      .select('id, name')
      .in('name', [...practice.niches])
      .eq('is_active', true),
    'niche lookup',
  )
  const byName = new Map<string, DemoNiche>()
  for (const r of rows ?? []) byName.set(r.name as string, { id: r.id as string, name: r.name as string })
  const missing = practice.niches.filter((n) => !byName.has(n))
  if (missing.length > 0) {
    throw new Error(`demo ${practice.key}: niches not found or inactive: ${missing.join(', ')}`)
  }
  return byName
}

async function ensureDemoParticipants(practice: DemoPractice, niches: Map<string, DemoNiche>) {
  const supabase = getAdminClient()
  const { owner: profile } = practice

  // Owner: one upsert keyed on the unique email creates the row on a brand-new
  // database and refreshes it on every rebuild after that.
  const ownerRow = {
    first_name: profile.first,
    last_name: profile.last,
    email: demoEmail(profile.email),
    phone: profile.phone,
    parent_id: null,
    role: 'owner',
    is_active: true,
    is_demo: true,
    practice_name: profile.practice,
    office_phone: profile.officePhone,
    default_niche_id: niches.get(practice.defaultNiche)!.id,
    call_batch_size: practice.callBatchSize,
    is_business_owner: true,
  }
  const owner = must(
    await supabase
      .from('participants')
      .upsert(ownerRow, { onConflict: 'email' })
      .select('id')
      .single(),
    'owner upsert',
  )
  if (!owner) throw new Error('demo owner upsert: no row returned')
  const ownerId = owner.id as string

  // Callers and access grants only depend on the owner id, so they run together.
  const callerRows = practice.callers.map((c) => ({
    first_name: c.first,
    last_name: c.last,
    email: demoEmail(c.email),
    phone: c.phone,
    parent_id: ownerId,
    role: 'staff',
    is_active: true,
    is_demo: true,
  }))
  const nicheIds = [...niches.values()].map((n) => n.id)
  const [callersRes, nicheRes, courseRes] = await Promise.all([
    supabase
      .from('participants')
      .upsert(callerRows, { onConflict: 'email' })
      .select('id, email'),
    // Grants that are no longer in the config (a niche moved to the other
    // demo) are dropped, so the account shows exactly the configured list.
    supabase
      .from('niche_access')
      .delete()
      .eq('participant_id', ownerId)
      .not('niche_id', 'in', `(${nicheIds.join(',')})`)
      .then(() =>
        supabase.from('niche_access').upsert(
          nicheIds.map((id) => ({ participant_id: ownerId, niche_id: id })),
          { onConflict: 'participant_id,niche_id', ignoreDuplicates: true },
        ),
      ),
    supabase
      .from('course_access')
      .upsert(
        { participant_id: ownerId, course_id: DEMO_COURSE_ID },
        { onConflict: 'course_id,participant_id', ignoreDuplicates: true },
      ),
  ])
  const savedCallers = must(callersRes, 'callers upsert') ?? []
  must(nicheRes, 'niche access')
  must(courseRes, 'course access')

  const idByEmail = new Map(
    savedCallers.map((r) => [r.email as string, r.id as string]),
  )
  const callerIds = new Map<string, string>()
  for (const c of practice.callers) {
    const id = idByEmail.get(demoEmail(c.email))
    if (!id) throw new Error(`demo callers upsert: ${c.email} missing from response`)
    callerIds.set(c.key, id)
  }

  return { ownerId, callerIds }
}

// ---------- seed ----------

export interface SeedSummary {
  contacts: number
  calls: number
  followUps: number
  scheduled: number
  reached: number
  dueToday: number
  reserve: number
}

export async function seedDemoData(practice: DemoPractice): Promise<SeedSummary> {
  const startedAt = Date.now()
  resetRng(practice.rngSeed)
  const supabase = getAdminClient()
  const copy = DEMO_PRACTICE_COPY[practice.key]
  const niches = await resolveDemoNiches(practice)
  const nicheByName = (name: string) => niches.get(name)!
  await wipeDemoPractice(practice)
  const { ownerId, callerIds } = await ensureDemoParticipants(practice, niches)

  const callers: DemoCallerProfile[] = practice.callers.map((c) => ({
    ...c,
    id: callerIds.get(c.key)!,
  }))
  // Weighted caller pick: Sarah + Marcus carry most of the volume, Tyler least.
  const callerPool: DemoCallerProfile[] = []
  for (const c of callers) for (let i = 0; i < c.volumeWeight; i++) callerPool.push(c)
  const callerFor = () => pick(callerPool)

  // ----- 100 contacts -----
  const contacts: SeedContact[] = []
  const nameQueue = [...practice.patientNames]
  const { nicheCycle, showcaseNiches } = practice

  // 60 "worked" patients, uploaded in four waves over the past 10 weeks —
  // the way a real office feeds the list. The most recent wave is still
  // being actively worked, so the timeline runs right up to yesterday and a
  // handful of bookings land in the coming two weeks.
  const waveOf = (i: number) => {
    if (i < 20) return -70 + between(0, 4) // 10 weeks ago
    if (i < 35) return -49 + between(0, 3) // 7 weeks ago
    if (i < 48) return -28 + between(0, 3) // 4 weeks ago
    return -11 + between(0, 3) // last week and a half
  }
  for (let i = 0; i < 60; i++) {
    const [first, last] = nameQueue.shift()!
    const niche = nicheByName(nicheCycle[i % nicheCycle.length])
    const importDay = waveOf(i)
    contacts.push({
      id: randomUUID(),
      name: `${first} ${last}`,
      phone: fakePhone(practice.areaCodes),
      email: chance(0.85) ? fakeEmail(first, last) : null,
      niche_id: niche.id,
      stage_id: DEMO_STAGE_IDS.new,
      do_not_call: false,
      notes: null,
      first_call_at: null,
      created_at: at(importDay, 8, between(0, 59)).toISOString(),
      service_label: pick(copy.serviceLabels[niche.name]),
      original_complaint: pick(copy.complaints[niche.name]),
      owner_id: ownerId,
      created_by: ownerId,
    })
  }
  // 40 "new" patients imported this morning (never called)
  for (let i = 0; i < 40; i++) {
    const [first, last] = nameQueue.shift()!
    // The first few names carry the one-patient showcase niches (see config)
    // and are stamped 08:00, 08:01, … so they lead today's cold-call batch.
    const showcase = showcaseNiches[i] as string | undefined
    const niche = nicheByName(showcase ?? nicheCycle[(i + 3) % nicheCycle.length])
    // Always draw the minute so the PRNG stream, and the rest of the story, is unchanged.
    // The range starts after the last showcase minute so no ordinary import
    // can tie with or precede a showcase patient in the oldest-first release.
    const importMinute = between(showcaseNiches.length + 1, 40)
    contacts.push({
      id: randomUUID(),
      name: `${first} ${last}`,
      phone: fakePhone(practice.areaCodes),
      email: chance(0.85) ? fakeEmail(first, last) : null,
      niche_id: niche.id,
      stage_id: DEMO_STAGE_IDS.new,
      do_not_call: false,
      notes: null,
      first_call_at: null,
      created_at: at(0, 8, showcase ? i : importMinute).toISOString(),
      service_label: pick(copy.serviceLabels[niche.name]),
      original_complaint: pick(copy.complaints[niche.name]),
      owner_id: ownerId,
      created_by: ownerId,
    })
  }

  // ----- histories for the 60 worked patients -----
  // Ids were assigned up front, so each contact's final stage / notes /
  // first_call_at is known before it is written and the whole list goes in
  // with ONE insert instead of insert-then-60-patches.
  const allCalls: SeedCall[] = []
  const allFollowUps: SeedFollowUp[] = []
  let scheduled = 0
  let reached = 0

  for (let i = 0; i < 60; i++) {
    const c = contacts[i]
    const importDay = Math.round(
      (new Date(c.created_at).getTime() - Date.now()) / 86_400_000,
    )
    const h = buildHistory(c.id!, importDay, callerFor, copy)
    allCalls.push(...h.calls)
    allFollowUps.push(...h.followUps)
    if (h.outcome === 'scheduled') scheduled += 1
    if (h.outcome !== 'unreached') reached += 1
    c.stage_id = DEMO_STAGE_IDS[h.stage]
    c.do_not_call = h.dnc
    c.notes = h.notes
    c.first_call_at = h.firstCallAt
  }

  must(await supabase.from('contacts').insert(contacts), 'contacts insert')

  // ----- make TODAY interesting -----
  // Guarantee a handful of follow-ups land today across morning / midday /
  // afternoon (so the time-band chips show), one or two "1 day overdue", and
  // a few tomorrow. We do this by retargeting the OPEN follow-up of unreached
  // or callback patients rather than inventing new ones.
  const openByContact = new Map<string, SeedFollowUp>()
  for (const f of allFollowUps) {
    if (f.completed_call_id === null) openByContact.set(f.contact_id, f)
  }
  const retargetable = [...openByContact.values()].filter(
    (f) => f.reason === 'retry' || f.reason === 'manual',
  )
  const todaySlots: [number, number][] = [
    [9, 30], [10, 0], [11, 0], // morning
    [12, 30], [13, 30], [14, 0], // midday
    [15, 30], [16, 0], [17, 0], // afternoon
  ]
  let slot = 0
  for (const f of retargetable.slice(0, todaySlots.length)) {
    const [h, m] = todaySlots[slot++]
    f.due_at = at(0, h, m).toISOString()
  }
  // two overdue by a day
  for (const f of retargetable.slice(todaySlots.length, todaySlots.length + 2)) {
    f.due_at = at(-1, pick([10, 14]), 0).toISOString()
  }
  // four tomorrow, three later this week
  for (const f of retargetable.slice(todaySlots.length + 2, todaySlots.length + 6)) {
    f.due_at = at(1, pick([9, 10, 13, 15]), pick([0, 30])).toISOString()
  }
  for (const f of retargetable.slice(todaySlots.length + 6, todaySlots.length + 9)) {
    f.due_at = at(between(2, 4), pick([9, 11, 14, 16]), 0).toISOString()
  }

  // ----- insert calls, then patch follow-up completion ids -----
  // Sort chronologically so ids/created_at read naturally.
  allCalls.sort((a, b) => a.created_at.localeCompare(b.created_at))
  const insertedCalls = must(
    await supabase
      .from('reactivation_calls')
      .insert(allCalls)
      .select('id, contact_id, created_at'),
    'calls insert',
  )

  // Each follow-up marked PENDING was completed by the NEXT call on that
  // contact after the follow-up's created_at.
  const callsByContact = new Map<string, { id: string; created_at: string }[]>()
  for (const c of insertedCalls ?? []) {
    const arr = callsByContact.get(c.contact_id) ?? []
    arr.push({ id: c.id, created_at: c.created_at })
    callsByContact.set(c.contact_id, arr)
  }
  for (const f of allFollowUps) {
    if (f.completed_call_id !== 'PENDING') continue
    const later = (callsByContact.get(f.contact_id) ?? [])
      .filter((c) => c.created_at > f.created_at)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
    f.completed_call_id = later[0]?.id ?? null
  }

  must(await supabase.from('follow_ups').insert(allFollowUps), 'follow-ups insert')

  // ----- training history -----
  await seedTraining(ownerId, callers)

  // ----- stamp the owner -----
  must(
    await supabase
      .from('participants')
      .update({ demo_seeded_at: new Date().toISOString() })
      .eq('id', ownerId),
    'stamp',
  )
  console.log(`[demo-seed] rebuilt in ${Date.now() - startedAt}ms`)

  const dueToday = allFollowUps.filter(
    (f) =>
      f.completed_call_id === null &&
      new Date(f.due_at).getTime() <= at(0, 23, 59).getTime(),
  ).length

  return {
    contacts: contacts.length,
    calls: allCalls.length,
    followUps: allFollowUps.length,
    scheduled,
    reached,
    dueToday,
    reserve: 40,
  }
}

// ---------- training audit data ----------

async function seedTraining(ownerId: string, callers: DemoCallerProfile[]) {
  const supabase = getAdminClient()
  const videos = DEMO_VIDEO_IDS

  const people = [
    { id: ownerId, completedVideos: DEMO_OWNER_TRAINING_COMPLETED, loginsPerWeek: 1, weeks: 11 },
    ...callers.map((c) => ({
      id: c.id,
      completedVideos: c.trainingCompleted,
      loginsPerWeek: c.loginsPerWeek,
      weeks: 10,
    })),
  ]

  const sessions: { participant_id: string; started_at: string; last_active_at: string; user_agent: string }[] = []
  const events: {
    participant_id: string
    session_id: null
    course_id: string
    module_id: string | null
    video_id: string | null
    event_type: string
    created_at: string
  }[] = []
  const progress: {
    participant_id: string
    video_id: string
    seconds_watched: number
    furthest_position: number
    percent_watched: number
    completed: boolean
    completed_at: string | null
    updated_at: string
  }[] = []

  const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'

  for (const p of people) {
    // Logins: spread across the last N weeks on weekdays.
    const loginDays: number[] = []
    for (let w = p.weeks; w >= 1; w--) {
      for (let k = 0; k < p.loginsPerWeek; k++) {
        let d = -(w * 7) + between(0, 6)
        while (isWeekend(d)) d -= 1
        if (d < -(p.weeks * 7)) d += 7
        loginDays.push(d)
      }
    }
    // Everyone logged in "today" except the underperformer.
    if (p.loginsPerWeek >= 2) loginDays.push(0)
    for (const d of loginDays) {
      const start = at(d, between(8, 16), between(0, 59))
      if (start.getTime() > Date.now()) continue
      const end = new Date(start.getTime() + between(10, 55) * 60_000)
      sessions.push({
        participant_id: p.id,
        started_at: start.toISOString(),
        last_active_at: end.toISOString(),
        user_agent: UA,
      })
      events.push({
        participant_id: p.id,
        session_id: null,
        course_id: DEMO_COURSE_ID,
        module_id: null,
        video_id: null,
        event_type: 'login',
        created_at: start.toISOString(),
      })
    }

    // Videos: complete the first N in order across the first ~3 weeks.
    const firstDay = -(p.weeks * 7) + 1
    for (let i = 0; i < videos.length; i++) {
      const v = videos[i]
      const done = i < p.completedVideos
      const partial = !done && i === p.completedVideos && p.completedVideos > 0
      if (!done && !partial) continue
      const watchDay = firstDay + Math.floor((i / videos.length) * 21) + between(0, 1)
      const when = at(watchDay, between(9, 17), between(0, 59))
      if (when.getTime() > Date.now()) continue
      const startIso = when.toISOString()
      events.push({
        participant_id: p.id,
        session_id: null,
        course_id: DEMO_COURSE_ID,
        module_id: v.module_id,
        video_id: v.id,
        event_type: 'video_start',
        created_at: startIso,
      })
      const pct = done ? between(92, 100) : between(20, 55)
      const watched = Math.round((v.duration_seconds * pct) / 100)
      const finishIso = new Date(when.getTime() + watched * 1000).toISOString()
      if (done) {
        events.push({
          participant_id: p.id,
          session_id: null,
          course_id: DEMO_COURSE_ID,
          module_id: v.module_id,
          video_id: v.id,
          event_type: 'video_complete',
          created_at: finishIso,
        })
      }
      progress.push({
        participant_id: p.id,
        video_id: v.id,
        seconds_watched: watched,
        furthest_position: watched,
        percent_watched: pct,
        completed: done,
        completed_at: done ? finishIso : null,
        updated_at: finishIso,
      })
    }
  }

  const [s, e, pr] = await Promise.all([
    sessions.length ? supabase.from('sessions').insert(sessions) : null,
    events.length ? supabase.from('activity_events').insert(events) : null,
    progress.length ? supabase.from('video_progress').insert(progress) : null,
  ])
  if (s) must(s, 'training sessions')
  if (e) must(e, 'training events')
  if (pr) must(pr, 'video progress')
}

// ---------- staleness check ----------

/** True if the demo has never been seeded or was seeded on a previous ET day. */
export function demoIsStale(seededAt: string | null | undefined): boolean {
  if (!seededAt) return true
  const a = etParts(new Date(seededAt))
  const b = etParts(new Date())
  return a.y !== b.y || a.mo !== b.mo || a.d !== b.d
}

// ---------- one rebuild at a time ----------

/** A lock older than this is assumed abandoned (crashed mid-rebuild). */
const SEED_LOCK_TTL_MS = 3 * 60_000
const SEED_WAIT_MS = 90_000
const SEED_POLL_MS = 1_500

export interface DemoOwnerState {
  id: string
  demo_seeded_at: string | null
  demo_seed_started_at: string | null
}

/**
 * Read the demo owner row, retrying briefly on transport errors. Resolves to
 * `null` ONLY when the query succeeded and found no row. A failed read throws,
 * so no caller can mistake a database outage for "first run, needs seeding".
 */
export async function getDemoOwnerState(
  practice: DemoPractice,
  attempts = 3,
): Promise<DemoOwnerState | null> {
  const supabase = getAdminClient()
  let lastError = 'unknown error'
  for (let i = 0; i < attempts; i++) {
    const { data, error } = await supabase
      .from('participants')
      .select('id, demo_seeded_at, demo_seed_started_at')
      .eq('email', demoEmail(practice.owner.email))
      .maybeSingle()
    if (!error) return (data as DemoOwnerState | null) ?? null
    lastError = error.message
    if (i < attempts - 1) await sleep(300 * (i + 1))
  }
  throw new Error(`demo owner lookup: ${lastError}`)
}

function lockIsHeld(owner: DemoOwnerState) {
  if (!owner.demo_seed_started_at) return false
  return (
    Date.now() - new Date(owner.demo_seed_started_at).getTime() <
    SEED_LOCK_TTL_MS
  )
}

/**
 * A conditional UPDATE is atomic per row: of two racing claims only one sees
 * the lock column still empty (or expired) and gets its row back.
 */
async function claimSeedLock(ownerId: string): Promise<boolean> {
  const supabase = getAdminClient()
  const expiredBefore = new Date(Date.now() - SEED_LOCK_TTL_MS).toISOString()
  const rows = must(
    await supabase
      .from('participants')
      .update({ demo_seed_started_at: new Date().toISOString() })
      .eq('id', ownerId)
      .or(
        `demo_seed_started_at.is.null,demo_seed_started_at.lt.${expiredBefore}`,
      )
      .select('id'),
    'seed lock claim',
  )
  return (rows?.length ?? 0) > 0
}

async function releaseSeedLock(ownerId: string) {
  const supabase = getAdminClient()
  // Best effort: if this fails the lock simply expires after SEED_LOCK_TTL_MS.
  await supabase
    .from('participants')
    .update({ demo_seed_started_at: null })
    .eq('id', ownerId)
}

/** Wait for a rebuild someone else started to finish. */
async function waitForSeed(practice: DemoPractice): Promise<'fresh' | 'failed' | 'timeout'> {
  const deadline = Date.now() + SEED_WAIT_MS
  while (Date.now() < deadline) {
    await sleep(SEED_POLL_MS)
    let owner: DemoOwnerState | null
    try {
      owner = await getDemoOwnerState(practice, 1)
    } catch {
      continue // transport blip while waiting: keep polling
    }
    if (!owner) return 'failed'
    if (!lockIsHeld(owner)) {
      return demoIsStale(owner.demo_seeded_at) ? 'failed' : 'fresh'
    }
  }
  return 'timeout'
}

export type EnsureSeedResult =
  | { status: 'fresh' }
  | { status: 'seeded'; summary: SeedSummary }
  | { status: 'waited' }
  | { status: 'error'; message: string }

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * The ONLY place a rebuild may start from. Rebuilds one practice when it has
 * never been seeded, was seeded on a previous Eastern day, or `force` is set.
 * If a rebuild of that practice is already running (a double click, a second
 * presenter, the nightly cron) this waits for it instead of starting another
 * one on top. Each practice has its own lock (its owner row), so the two
 * demos never block or wipe each other.
 */
export async function ensureDemoSeeded(
  practiceKey: DemoPracticeKey,
  opts: { force?: boolean } = {},
): Promise<EnsureSeedResult> {
  const practice = getDemoPractice(practiceKey)
  let owner: DemoOwnerState | null
  try {
    owner = await getDemoOwnerState(practice)
  } catch (e) {
    return { status: 'error', message: errorMessage(e) }
  }

  // Brand-new database: no owner row exists yet (confirmed by a successful
  // read), so there is nothing to lock on. Seed directly.
  if (!owner) {
    try {
      return { status: 'seeded', summary: await seedDemoData(practice) }
    } catch (e) {
      return { status: 'error', message: errorMessage(e) }
    }
  }

  const held = lockIsHeld(owner)
  if (!opts.force && !held && !demoIsStale(owner.demo_seeded_at)) {
    return { status: 'fresh' }
  }

  let claimed = false
  try {
    claimed = await claimSeedLock(owner.id)
  } catch (e) {
    return { status: 'error', message: errorMessage(e) }
  }

  if (!claimed) {
    const outcome = await waitForSeed(practice)
    if (outcome === 'fresh') return { status: 'waited' }
    return {
      status: 'error',
      message:
        outcome === 'timeout'
          ? 'Another rebuild is still running. Give it a minute and try again.'
          : 'The other rebuild did not finish. Try again.',
    }
  }

  try {
    // Re-check under the lock: whoever held it before us may have just
    // finished the very rebuild we were about to start.
    if (!opts.force) {
      const latest = await getDemoOwnerState(practice)
      if (latest && !demoIsStale(latest.demo_seeded_at)) return { status: 'fresh' }
    }
    const summary = await seedDemoData(practice)
    return { status: 'seeded', summary }
  } catch (e) {
    return { status: 'error', message: errorMessage(e) }
  } finally {
    await releaseSeedLock(owner.id)
  }
}

/** Rebuild every demo practice in turn (the nightly reset). */
export async function ensureAllDemosSeeded(
  opts: { force?: boolean } = {},
): Promise<Record<DemoPracticeKey, EnsureSeedResult>> {
  const out = {} as Record<DemoPracticeKey, EnsureSeedResult>
  for (const p of DEMO_PRACTICES) out[p.key] = await ensureDemoSeeded(p.key, opts)
  return out
}

/**
 * Which demo practice a demo participant belongs to, by the e-mail of the
 * owner of their participant family. Null for anything that is not a demo
 * identity, so reset / refresh / "view as" can refuse to act.
 */
export async function demoPracticeOfParticipant(p: {
  id: string
  parent_id: string | null
  email?: string | null
}): Promise<DemoPractice | null> {
  if (!p.parent_id && p.email) return demoPracticeByOwnerEmail(p.email)
  const supabase = getAdminClient()
  const { data } = await supabase
    .from('participants')
    .select('email, is_demo')
    .eq('id', p.parent_id ?? p.id)
    .maybeSingle()
  if (!data || !data.is_demo) return null
  return demoPracticeByOwnerEmail(data.email as string)
}
