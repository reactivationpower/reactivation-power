import 'server-only'

import { getAdminClient } from '@/lib/supabase/admin'
import { easternWallClockToUtc } from '@/lib/call-time'
import type { CallDisposition } from '@/lib/types'
import {
  DEMO_CALLERS,
  DEMO_COURSE_ID,
  DEMO_NICHES,
  DEMO_OWNER,
  DEMO_VIDEO_IDS,
  DEMO_STAGE_IDS,
  PATIENT_NAMES,
  demoEmail,
  type DemoCallerProfile,
} from './config'

/**
 * Demo account seeder.
 *
 * Everything here is computed RELATIVE TO NOW (Eastern time) so a presenter
 * who opens the demo two months from now sees a campaign that looks like it
 * started ten weeks ago and made its last call yesterday afternoon. Same 100
 * patients, same four callers, same story every time — only the dates slide.
 *
 * The generator is deterministic: a seeded PRNG keyed off a fixed string, so
 * "Sarah is the closer, Tyler is behind" is stable across resets.
 *
 * SAFETY: every delete in wipeDemoData() is scoped to participant rows where
 * is_demo = true. Live accounts are never touched.
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

const rand = mulberry32(hashSeed('ridgeline-chiro-demo-v1'))
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]
const chance = (p: number) => rand() < p
const between = (lo: number, hi: number) =>
  lo + Math.floor(rand() * (hi - lo + 1))

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
  return easternWallClockToUtc(y, mo, d, hour, minute)
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

const AREA_CODES = ['303', '720', '970', '719'] // Colorado, matches the clinic
function fakePhone() {
  // 555-01xx is the reserved fictional exchange range; keep the area code real-looking.
  return `(${pick(AREA_CODES)}) 555-${String(between(100, 199)).padStart(3, '0')}${between(0, 9)}`
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

const COMPLAINTS: Record<string, string[]> = {
  Chiropractic: ['Lower back pain', 'Neck pain', 'Headaches', 'Sciatica', 'Mid-back tightness', 'Shoulder pain'],
  Decompression: ['Herniated disc L4-L5', 'Sciatica', 'Degenerative disc disease', 'Lower back pain', 'Spinal stenosis'],
  'Joint Pain': ['Knee pain', 'Shoulder pain', 'Hip pain', 'Elbow tendonitis', 'Ankle pain'],
  ChiroThin: ['Weight loss', 'Weight management'],
}

const SERVICE_LABELS: Record<string, string[]> = {
  Chiropractic: ['Chiropractic Adjustment', 'Adjustment', 'Chiro Wellness Visit'],
  Decompression: ['Spinal Decompression', 'DTS Therapy'],
  'Joint Pain': ['Joint Pain Program', 'Knee Program'],
  ChiroThin: ['ChiroThin Weight Loss', 'ChiroThin'],
}

// Notes are written the way a real caller would type them, so they read
// naturally in the contact drawer and the call history.
const NOTES_RECEPTIVE = [
  '<p>Very friendly. Said the back has been acting up again since starting a new desk job. Open to coming back in.</p>',
  '<p>Remembered Dr. Whitaker by name. Asked whether we still do Saturday hours.</p>',
  '<p>Receptive — knee has been bothering her on stairs. Wants to talk to her husband first.</p>',
  '<p>Warm call. He said the last round of care "worked great" and he just got busy.</p>',
  '<p>Interested, but recovering from a cold this week. Wants a callback next week.</p>',
  '<p>Said she\u2019s been thinking about coming back. Best time to reach is early morning.</p>',
]
const NOTES_NEUTRAL = [
  '<p>Polite but short. Said things are "fine for now." Left the door open.</p>',
  '<p>Asked about insurance changes — told him we\u2019d have the front desk confirm.</p>',
  '<p>Busy at work, asked us to try again in the afternoon.</p>',
  '<p>Moved across town but still within driving distance. Not a hard no.</p>',
]
const NOTES_COLD = [
  '<p>Not interested right now. Said to check back in a few months.</p>',
  '<p>Seeing a PT through work insurance. Wished us well.</p>',
  '<p>Asked not to be called again. Marked DNC.</p>',
]
const NOTES_NEVER_REACHED = [
  '<p>Straight to voicemail both times. Number appears active.</p>',
  '<p>No answer. Mobile number from the 2024 intake form.</p>',
  '',
  '',
]

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
      notes = pick(NOTES_COLD)
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
      notes = pick(NOTES_RECEPTIVE)
      calls.push({
        contact_id: contactId,
        caller_id: caller.id,
        disposition: 'scheduled',
        voicemail_left: false,
        notes: pick([
          'Booked. Wants to see Dr. Whitaker specifically.',
          'Scheduled — reminded her to bring the updated insurance card.',
          'Booked for a re-eval. Very glad we called.',
          'Scheduled. Said the timing was perfect.',
        ]),
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
      notes = pick(NOTES_RECEPTIVE.concat(NOTES_NEUTRAL))
      calls.push({
        contact_id: contactId,
        caller_id: caller.id,
        disposition: 'spoke_call_back_later',
        voicemail_left: false,
        notes: pick([
          'Asked us to call back — better time is after 3pm.',
          'In the middle of something, asked for a callback next week.',
          'Wants to check her schedule first. Call back Thursday.',
        ]),
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
    notes = pick(NOTES_NEUTRAL.concat(NOTES_COLD.slice(0, 2)))
    calls.push({
      contact_id: contactId,
      caller_id: caller.id,
      disposition: 'spoke_did_not_schedule',
      voicemail_left: false,
      notes: pick([
        'Not right now — doing okay. Said to check back in a few months.',
        'Feeling fine lately. Keep him on the list.',
        'Interested but money is tight this quarter.',
      ]),
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

  if (outcome === 'unreached' && attempts > 0) notes = pick(NOTES_NEVER_REACHED) || null

  return { calls, followUps, firstCallAt, stage, dnc, outcome, notes, attempts }
}

// ---------- wipe ----------

export async function wipeDemoData() {
  const supabase = getAdminClient()
  const { data: demoParticipants } = await supabase
    .from('participants')
    .select('id')
    .eq('is_demo', true)
  const ids = (demoParticipants ?? []).map((p) => p.id)
  if (ids.length === 0) return

  // Contacts cascade to follow_ups + reactivation_calls (FK ON DELETE CASCADE).
  await supabase.from('contacts').delete().in('owner_id', ids)
  await supabase.from('activity_events').delete().in('participant_id', ids)
  await supabase.from('video_progress').delete().in('participant_id', ids)
  await supabase.from('sessions').delete().in('participant_id', ids)
  await supabase.from('service_niche_mappings').delete().in('owner_id', ids)
}

// ---------- ensure identities ----------

async function ensureDemoParticipants() {
  const supabase = getAdminClient()

  // Owner
  const { data: existingOwner } = await supabase
    .from('participants')
    .select('id')
    .eq('email', demoEmail(DEMO_OWNER.email))
    .maybeSingle()

  let ownerId = existingOwner?.id as string | undefined
  const ownerRow = {
    first_name: DEMO_OWNER.first,
    last_name: DEMO_OWNER.last,
    email: demoEmail(DEMO_OWNER.email),
    phone: DEMO_OWNER.phone,
    parent_id: null,
    role: 'owner',
    is_active: true,
    is_demo: true,
    practice_name: DEMO_OWNER.practice,
    office_phone: DEMO_OWNER.officePhone,
    default_niche_id: DEMO_NICHES[0].id,
    call_batch_size: 7,
    is_business_owner: true,
  }
  if (ownerId) {
    await supabase.from('participants').update(ownerRow).eq('id', ownerId)
  } else {
    const { data } = await supabase
      .from('participants')
      .insert(ownerRow)
      .select('id')
      .single()
    ownerId = data!.id
  }

  // Callers
  const callerIds = new Map<string, string>()
  for (const c of DEMO_CALLERS) {
    const email = demoEmail(c.email)
    const { data: existing } = await supabase
      .from('participants')
      .select('id')
      .eq('email', email)
      .maybeSingle()
    const row = {
      first_name: c.first,
      last_name: c.last,
      email,
      phone: c.phone,
      parent_id: ownerId,
      role: 'staff',
      is_active: true,
      is_demo: true,
    }
    if (existing) {
      await supabase.from('participants').update(row).eq('id', existing.id)
      callerIds.set(c.key, existing.id)
    } else {
      const { data } = await supabase
        .from('participants')
        .insert(row)
        .select('id')
        .single()
      callerIds.set(c.key, data!.id)
    }
  }

  // Niche + course access (idempotent)
  for (const n of DEMO_NICHES) {
    const { data } = await supabase
      .from('niche_access')
      .select('id')
      .eq('participant_id', ownerId)
      .eq('niche_id', n.id)
      .maybeSingle()
    if (!data)
      await supabase
        .from('niche_access')
        .insert({ participant_id: ownerId, niche_id: n.id })
  }
  const { data: ca } = await supabase
    .from('course_access')
    .select('id')
    .eq('participant_id', ownerId)
    .eq('course_id', DEMO_COURSE_ID)
    .maybeSingle()
  if (!ca)
    await supabase
      .from('course_access')
      .insert({ participant_id: ownerId, course_id: DEMO_COURSE_ID })

  return { ownerId: ownerId!, callerIds }
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

export async function seedDemoData(): Promise<SeedSummary> {
  const supabase = getAdminClient()
  await wipeDemoData()
  const { ownerId, callerIds } = await ensureDemoParticipants()

  const callers: DemoCallerProfile[] = DEMO_CALLERS.map((c) => ({
    ...c,
    id: callerIds.get(c.key)!,
  }))
  // Weighted caller pick: Sarah + Marcus carry most of the volume, Tyler least.
  const callerPool: DemoCallerProfile[] = []
  for (const c of callers) for (let i = 0; i < c.volumeWeight; i++) callerPool.push(c)
  const callerFor = () => pick(callerPool)

  // ----- 100 contacts -----
  const contacts: SeedContact[] = []
  const nameQueue = [...PATIENT_NAMES]
  const nicheCycle = [0, 0, 0, 0, 1, 1, 2, 2, 3, 0] // Chiro-heavy mix

  // 60 "worked" patients imported ~10 weeks ago (staggered over a week)
  for (let i = 0; i < 60; i++) {
    const [first, last] = nameQueue.shift()!
    const niche = DEMO_NICHES[nicheCycle[i % nicheCycle.length]]
    const importDay = -70 + between(0, 6)
    contacts.push({
      name: `${first} ${last}`,
      phone: fakePhone(),
      email: chance(0.85) ? fakeEmail(first, last) : null,
      niche_id: niche.id,
      stage_id: DEMO_STAGE_IDS.new,
      do_not_call: false,
      notes: null,
      first_call_at: null,
      created_at: at(importDay, 8, between(0, 59)).toISOString(),
      service_label: pick(SERVICE_LABELS[niche.name]),
      original_complaint: pick(COMPLAINTS[niche.name]),
      owner_id: ownerId,
      created_by: ownerId,
    })
  }
  // 40 "new" patients imported this morning (never called)
  for (let i = 0; i < 40; i++) {
    const [first, last] = nameQueue.shift()!
    const niche = DEMO_NICHES[nicheCycle[(i + 3) % nicheCycle.length]]
    contacts.push({
      name: `${first} ${last}`,
      phone: fakePhone(),
      email: chance(0.85) ? fakeEmail(first, last) : null,
      niche_id: niche.id,
      stage_id: DEMO_STAGE_IDS.new,
      do_not_call: false,
      notes: null,
      first_call_at: null,
      created_at: at(0, 8, between(5, 40)).toISOString(),
      service_label: pick(SERVICE_LABELS[niche.name]),
      original_complaint: pick(COMPLAINTS[niche.name]),
      owner_id: ownerId,
      created_by: ownerId,
    })
  }

  const { data: insertedContacts, error: cErr } = await supabase
    .from('contacts')
    .insert(contacts)
    .select('id, created_at')
  if (cErr) throw new Error(`demo contacts: ${cErr.message}`)
  const contactIds = insertedContacts!.map((c) => c.id as string)

  // ----- histories for the 60 worked patients -----
  const allCalls: SeedCall[] = []
  const allFollowUps: SeedFollowUp[] = []
  const contactPatches: {
    id: string
    stage_id: string
    do_not_call: boolean
    notes: string | null
    first_call_at: string | null
  }[] = []
  let scheduled = 0
  let reached = 0

  for (let i = 0; i < 60; i++) {
    const cid = contactIds[i]
    const importDay = Math.round(
      (new Date(contacts[i].created_at).getTime() - Date.now()) / 86_400_000,
    )
    const h = buildHistory(cid, importDay, callerFor)
    allCalls.push(...h.calls)
    allFollowUps.push(...h.followUps)
    if (h.outcome === 'scheduled') scheduled += 1
    if (h.outcome !== 'unreached') reached += 1
    contactPatches.push({
      id: cid,
      stage_id: DEMO_STAGE_IDS[h.stage],
      do_not_call: h.dnc,
      notes: h.notes,
      first_call_at: h.firstCallAt,
    })
  }

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
  const { data: insertedCalls, error: callErr } = await supabase
    .from('reactivation_calls')
    .insert(allCalls)
    .select('id, contact_id, created_at')
  if (callErr) throw new Error(`demo calls: ${callErr.message}`)

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

  const { error: fErr } = await supabase.from('follow_ups').insert(allFollowUps)
  if (fErr) throw new Error(`demo follow-ups: ${fErr.message}`)

  // ----- contact patches -----
  for (const p of contactPatches) {
    await supabase
      .from('contacts')
      .update({
        stage_id: p.stage_id,
        do_not_call: p.do_not_call,
        notes: p.notes,
        first_call_at: p.first_call_at,
      })
      .eq('id', p.id)
  }

  // ----- training history -----
  await seedTraining(ownerId, callers)

  // ----- stamp the owner -----
  await supabase
    .from('participants')
    .update({ demo_seeded_at: new Date().toISOString() })
    .eq('id', ownerId)

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
    { id: ownerId, completedVideos: videos.length, loginsPerWeek: 1, weeks: 11 },
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

  if (sessions.length) await supabase.from('sessions').insert(sessions)
  if (events.length) await supabase.from('activity_events').insert(events)
  if (progress.length) await supabase.from('video_progress').insert(progress)
}

// ---------- staleness check ----------

/** True if the demo has never been seeded or was seeded on a previous ET day. */
export function demoIsStale(seededAt: string | null | undefined): boolean {
  if (!seededAt) return true
  const a = etParts(new Date(seededAt))
  const b = etParts(new Date())
  return a.y !== b.y || a.mo !== b.mo || a.d !== b.d
}
