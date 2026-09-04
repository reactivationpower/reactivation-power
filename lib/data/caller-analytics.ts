import 'server-only'

import { getAdminClient } from '@/lib/supabase/admin'
import { DISPOSITION_LABELS, type CallDisposition } from '@/lib/types'
import type { Participant } from '@/lib/types'
import {
  MIN_BUCKET_SAMPLE,
  type Bucket,
  type CallAnalytics,
  type MonthRow,
  type NicheRow,
  type TimeInsight,
  type TrainingAudit,
  type WeekRow,
} from '@/lib/analytics-types'

// Client components import shapes from lib/analytics-types directly; server
// code can keep importing everything from here.
export { MIN_BUCKET_SAMPLE }
export type {
  Bucket,
  CallAnalytics,
  MonthRow,
  NicheRow,
  TimeInsight,
  TrainingAudit,
  WeekRow,
}

/**
 * Per-caller (or per-team) call analytics.
 *
 * Every time bucket is computed in Eastern time to match the rest of the
 * dialer (scattered retries, suggested call bands). Insights only fire once a
 * bucket has MIN_BUCKET_SAMPLE calls so a lucky 1-for-1 never becomes "your
 * best hour".
 */

const ET_ZONE = 'America/New_York'

const REACHED = new Set<CallDisposition>([
  'spoke_did_not_schedule',
  'spoke_call_back_later',
  'scheduled',
])

interface CallRow {
  id: string
  caller_id: string
  contact_id: string
  disposition: CallDisposition
  voicemail_left: boolean | null
  created_at: string
  appointment_at: string | null
}

// ---------- Eastern-time helpers ----------

function etParts(iso: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ET_ZONE,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    weekday: 'short',
  }).formatToParts(new Date(iso))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const hourRaw = parseInt(get('hour'), 10)
  return {
    year: get('year'),
    month: get('month'),
    day: parseInt(get('day'), 10),
    hour: hourRaw === 24 ? 0 : hourRaw,
    weekday: get('weekday'), // "Mon"
  }
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTH_WEEKS: { key: string; label: string; test: (d: number) => boolean }[] =
  [
    { key: 'w1', label: 'Days 1–7', test: (d) => d <= 7 },
    { key: 'w2', label: 'Days 8–14', test: (d) => d > 7 && d <= 14 },
    { key: 'w3', label: 'Days 15–21', test: (d) => d > 14 && d <= 21 },
    { key: 'w4', label: 'Days 22–31', test: (d) => d > 21 },
  ]

function hourLabel(h: number) {
  const suffix = h < 12 ? 'AM' : 'PM'
  const twelve = h % 12 === 0 ? 12 : h % 12
  return `${twelve} ${suffix}`
}

function pct(n: number, d: number) {
  return d > 0 ? Math.round((n / d) * 100) : 0
}

function finalize(
  raw: Map<string, { label: string; calls: number; reached: number; scheduled: number }>,
  order: string[],
): Bucket[] {
  return order.map((key) => {
    const b = raw.get(key) ?? { label: key, calls: 0, reached: 0, scheduled: 0 }
    return {
      key,
      label: b.label,
      calls: b.calls,
      reached: b.reached,
      scheduled: b.scheduled,
      answerRate: pct(b.reached, b.calls),
      yesRate: pct(b.scheduled, b.calls),
      reliable: b.calls >= MIN_BUCKET_SAMPLE,
    }
  })
}

function bump(
  map: Map<string, { label: string; calls: number; reached: number; scheduled: number }>,
  key: string,
  label: string,
  c: CallRow,
) {
  const cur = map.get(key) ?? { label, calls: 0, reached: 0, scheduled: 0 }
  cur.calls += 1
  if (REACHED.has(c.disposition)) cur.reached += 1
  if (c.disposition === 'scheduled') cur.scheduled += 1
  map.set(key, cur)
}

function pickInsight(
  buckets: Bucket[],
  metric: 'answerRate' | 'yesRate',
  direction: 'max' | 'min',
): TimeInsight | null {
  const reliable = buckets.filter((b) => b.reliable)
  if (reliable.length < 2) return null
  const sorted = [...reliable].sort((a, b) =>
    direction === 'max'
      ? b[metric] - a[metric] || b.calls - a.calls
      : a[metric] - b[metric] || b.calls - a.calls,
  )
  const top = sorted[0]
  // A "best" that is 0% is not a best; a "worst" that ties the best is noise.
  if (direction === 'max' && top[metric] === 0) return null
  if (direction === 'min' && top[metric] === sorted[sorted.length - 1][metric])
    return null
  return { label: top.label, rate: top[metric], calls: top.calls }
}

// ---------- Main aggregation ----------

/**
 * Aggregate calls for one or more callers. Pass a single id for the
 * drill-down page, or every member of the account for the team view.
 */
export async function getCallAnalytics(
  callerIds: string[],
): Promise<CallAnalytics> {
  const supabase = getAdminClient()
  const empty = emptyAnalytics()
  if (callerIds.length === 0) return empty

  const { data: callsData } = await supabase
    .from('reactivation_calls')
    .select(
      'id, caller_id, contact_id, disposition, voicemail_left, created_at, appointment_at',
    )
    .in('caller_id', callerIds)
    .order('created_at', { ascending: true })
  const calls = (callsData ?? []) as CallRow[]
  if (calls.length === 0) return empty

  // Niche per contact (for the niche breakdown)
  const contactIds = Array.from(new Set(calls.map((c) => c.contact_id)))
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, niche_id')
    .in('id', contactIds)
  const nicheByContact = new Map(
    (contacts ?? []).map((c) => [c.id, c.niche_id as string | null]),
  )
  const nicheIds = Array.from(
    new Set(
      Array.from(nicheByContact.values()).filter((n): n is string => !!n),
    ),
  )
  const { data: niches } = nicheIds.length
    ? await supabase.from('niches').select('id, name').in('id', nicheIds)
    : { data: [] as { id: string; name: string }[] }
  const nicheName = new Map((niches ?? []).map((n) => [n.id, n.name]))

  // ---- summary ----
  const reached = calls.filter((c) => REACHED.has(c.disposition)).length
  const scheduled = calls.filter((c) => c.disposition === 'scheduled').length
  const voicemails = calls.filter(
    (c) => c.disposition === 'voicemail' || c.voicemail_left,
  ).length
  const doNotCall = calls.filter((c) => c.disposition === 'do_not_call').length
  const now = Date.now()
  const upcomingAppointments = calls.filter(
    (c) => c.appointment_at && new Date(c.appointment_at).getTime() > now,
  ).length
  const dayKeys = new Set(
    calls.map((c) => {
      const p = etParts(c.created_at)
      return `${p.year}-${p.month}-${p.day}`
    }),
  )

  // ---- dispositions ----
  const dispCount = new Map<CallDisposition, number>()
  for (const c of calls)
    dispCount.set(c.disposition, (dispCount.get(c.disposition) ?? 0) + 1)
  const dispositions = (Object.keys(DISPOSITION_LABELS) as CallDisposition[])
    .map((key) => ({
      key,
      label: DISPOSITION_LABELS[key],
      count: dispCount.get(key) ?? 0,
    }))
    .filter((d) => d.count > 0)

  // ---- time buckets ----
  const hourMap = new Map<string, { label: string; calls: number; reached: number; scheduled: number }>()
  const dayMap = new Map<string, { label: string; calls: number; reached: number; scheduled: number }>()
  const mwMap = new Map<string, { label: string; calls: number; reached: number; scheduled: number }>()
  const nicheMap = new Map<
    string,
    { nicheId: string | null; name: string; calls: number; reached: number; scheduled: number }
  >()
  const monthMap = new Map<string, MonthRow>()
  const weekMap = new Map<string, WeekRow>()

  for (const c of calls) {
    const p = etParts(c.created_at)
    bump(hourMap, String(p.hour), hourLabel(p.hour), c)
    bump(dayMap, p.weekday, p.weekday, c)
    const mw = MONTH_WEEKS.find((w) => w.test(p.day)) ?? MONTH_WEEKS[3]
    bump(mwMap, mw.key, mw.label, c)

    // Niche
    const nid = nicheByContact.get(c.contact_id) ?? null
    const nkey = nid ?? '__none'
    const cur = nicheMap.get(nkey) ?? {
      nicheId: nid,
      name: nid ? nicheName.get(nid) ?? 'Unknown niche' : 'No niche',
      calls: 0,
      reached: 0,
      scheduled: 0,
    }
    cur.calls += 1
    if (REACHED.has(c.disposition)) cur.reached += 1
    if (c.disposition === 'scheduled') cur.scheduled += 1
    nicheMap.set(nkey, cur)

    // Month of the call (for scheduled-by-month)
    const mKey = `${p.year}-${p.month}`
    const m = monthMap.get(mKey) ?? {
      key: mKey,
      label: monthLabel(mKey),
      scheduled: 0,
      appointments: 0,
    }
    if (c.disposition === 'scheduled') m.scheduled += 1
    monthMap.set(mKey, m)

    // Month of the APPOINTMENT (when booked date is known)
    if (c.appointment_at) {
      const ap = etParts(c.appointment_at)
      const aKey = `${ap.year}-${ap.month}`
      const am = monthMap.get(aKey) ?? {
        key: aKey,
        label: monthLabel(aKey),
        scheduled: 0,
        appointments: 0,
      }
      am.appointments += 1
      monthMap.set(aKey, am)
    }

    // ISO-ish week (Monday start) in ET
    const wKey = weekKey(c.created_at)
    const w = weekMap.get(wKey) ?? {
      key: wKey,
      label: weekLabel(wKey),
      calls: 0,
      reached: 0,
      scheduled: 0,
    }
    w.calls += 1
    if (REACHED.has(c.disposition)) w.reached += 1
    if (c.disposition === 'scheduled') w.scheduled += 1
    weekMap.set(wKey, w)
  }

  // Working hours 8 AM – 7 PM ET; calls outside are folded into edges.
  const hourOrder = Array.from({ length: 12 }, (_, i) => String(i + 8))
  for (const [k, v] of Array.from(hourMap.entries())) {
    const h = Number(k)
    if (h < 8) {
      const cur = hourMap.get('8') ?? { label: hourLabel(8), calls: 0, reached: 0, scheduled: 0 }
      cur.calls += v.calls; cur.reached += v.reached; cur.scheduled += v.scheduled
      hourMap.set('8', cur); hourMap.delete(k)
    } else if (h > 19) {
      const cur = hourMap.get('19') ?? { label: hourLabel(19), calls: 0, reached: 0, scheduled: 0 }
      cur.calls += v.calls; cur.reached += v.reached; cur.scheduled += v.scheduled
      hourMap.set('19', cur); hourMap.delete(k)
    }
  }
  for (const h of hourOrder)
    if (!hourMap.has(h))
      hourMap.set(h, { label: hourLabel(Number(h)), calls: 0, reached: 0, scheduled: 0 })
  for (const d of WEEKDAYS)
    if (!dayMap.has(d)) dayMap.set(d, { label: d, calls: 0, reached: 0, scheduled: 0 })
  for (const w of MONTH_WEEKS)
    if (!mwMap.has(w.key))
      mwMap.set(w.key, { label: w.label, calls: 0, reached: 0, scheduled: 0 })

  const byHour = finalize(hourMap, hourOrder)
  const byWeekday = finalize(dayMap, WEEKDAYS)
  const byMonthWeek = finalize(
    mwMap,
    MONTH_WEEKS.map((w) => w.key),
  )

  const byNiche: NicheRow[] = Array.from(nicheMap.values())
    .map((n) => ({
      ...n,
      closeRate: pct(n.scheduled, n.reached),
      yesRate: pct(n.scheduled, n.calls),
    }))
    .sort((a, b) => b.scheduled - a.scheduled || b.calls - a.calls)

  // Last 12 calendar months, always present (zeros included) so the bar chart
  // has a stable axis even for a brand-new caller.
  const byMonth = lastNMonths(12).map(
    (key) =>
      monthMap.get(key) ?? {
        key,
        label: monthLabel(key),
        scheduled: 0,
        appointments: 0,
      },
  )
  // Also include any FUTURE months that already have booked appointments.
  for (const m of Array.from(monthMap.values())) {
    if (!byMonth.find((x) => x.key === m.key) && m.appointments > 0) byMonth.push(m)
  }
  byMonth.sort((a, b) => a.key.localeCompare(b.key))

  const byWeek = lastNWeeks(12).map(
    (key) =>
      weekMap.get(key) ?? {
        key,
        label: weekLabel(key),
        calls: 0,
        reached: 0,
        scheduled: 0,
      },
  )

  return {
    summary: {
      calls: calls.length,
      reached,
      scheduled,
      voicemails,
      doNotCall,
      answerRate: pct(reached, calls.length),
      successRate: pct(scheduled, calls.length),
      closeRate: pct(scheduled, reached),
      firstCallAt: calls[0]?.created_at ?? null,
      lastCallAt: calls[calls.length - 1]?.created_at ?? null,
      activeDays: dayKeys.size,
      upcomingAppointments,
    },
    dispositions,
    byHour,
    byWeekday,
    byMonthWeek,
    byNiche,
    byMonth,
    byWeek,
    insights: {
      bestAnswerHour: pickInsight(byHour, 'answerRate', 'max'),
      worstAnswerHour: pickInsight(byHour, 'answerRate', 'min'),
      bestYesHour: pickInsight(byHour, 'yesRate', 'max'),
      bestYesDay: pickInsight(byWeekday, 'yesRate', 'max'),
      bestYesMonthWeek: pickInsight(byMonthWeek, 'yesRate', 'max'),
    },
  }
}

function emptyAnalytics(): CallAnalytics {
  const zeroBuckets = (keys: string[], labels: string[]): Bucket[] =>
    keys.map((key, i) => ({
      key,
      label: labels[i],
      calls: 0,
      reached: 0,
      scheduled: 0,
      answerRate: 0,
      yesRate: 0,
      reliable: false,
    }))
  const hourKeys = Array.from({ length: 12 }, (_, i) => String(i + 8))
  return {
    summary: {
      calls: 0,
      reached: 0,
      scheduled: 0,
      voicemails: 0,
      doNotCall: 0,
      answerRate: 0,
      successRate: 0,
      closeRate: 0,
      firstCallAt: null,
      lastCallAt: null,
      activeDays: 0,
      upcomingAppointments: 0,
    },
    dispositions: [],
    byHour: zeroBuckets(hourKeys, hourKeys.map((h) => hourLabel(Number(h)))),
    byWeekday: zeroBuckets(WEEKDAYS, WEEKDAYS),
    byMonthWeek: zeroBuckets(
      MONTH_WEEKS.map((w) => w.key),
      MONTH_WEEKS.map((w) => w.label),
    ),
    byNiche: [],
    byMonth: lastNMonths(12).map((key) => ({
      key,
      label: monthLabel(key),
      scheduled: 0,
      appointments: 0,
    })),
    byWeek: lastNWeeks(12).map((key) => ({
      key,
      label: weekLabel(key),
      calls: 0,
      reached: 0,
      scheduled: 0,
    })),
    insights: {
      bestAnswerHour: null,
      worstAnswerHour: null,
      bestYesHour: null,
      bestYesDay: null,
      bestYesMonthWeek: null,
    },
  }
}

// ---------- calendar helpers (ET) ----------

function monthLabel(key: string) {
  const [y, m] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('en-US', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  })
}

function lastNMonths(n: number): string[] {
  const p = etParts(new Date().toISOString())
  let y = Number(p.year)
  let m = Number(p.month)
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}-${String(m).padStart(2, '0')}`)
    m -= 1
    if (m === 0) {
      m = 12
      y -= 1
    }
  }
  return out
}

/** Monday-start week key "YYYY-MM-DD" (the Monday's ET calendar date). */
function weekKey(iso: string): string {
  const p = etParts(iso)
  const d = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, p.day))
  const dow = (d.getUTCDay() + 6) % 7 // Mon=0
  d.setUTCDate(d.getUTCDate() - dow)
  return d.toISOString().slice(0, 10)
}

function weekLabel(key: string) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

function lastNWeeks(n: number): string[] {
  const thisWeek = weekKey(new Date().toISOString())
  const [y, m, d] = thisWeek.split('-').map(Number)
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const dt = new Date(Date.UTC(y, m - 1, d - i * 7))
    out.push(dt.toISOString().slice(0, 10))
  }
  return out
}

// ---------- Training audit ----------

export async function getTrainingAudit(
  participantId: string,
  courseIds: string[],
): Promise<TrainingAudit> {
  const supabase = getAdminClient()
  const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString()

  const [sessions, progress, events, courses] = await Promise.all([
    supabase
      .from('sessions')
      .select('id, started_at')
      .eq('participant_id', participantId)
      .order('started_at', { ascending: true }),
    supabase
      .from('video_progress')
      .select('video_id, seconds_watched, completed')
      .eq('participant_id', participantId),
    supabase
      .from('activity_events')
      .select('id, event_type, created_at, video_id, course_id')
      .eq('participant_id', participantId)
      .order('created_at', { ascending: false })
      .limit(12),
    courseIds.length
      ? supabase
          .from('courses')
          .select('id, title, modules(id, videos(id, status))')
          .in('id', courseIds)
          .order('sort_order')
      : Promise.resolve({ data: [] as unknown[] }),
  ])

  const sess = sessions.data ?? []
  const prog = progress.data ?? []
  const completedIds = new Set(
    prog.filter((p) => p.completed).map((p) => p.video_id),
  )

  // Resolve titles for the recent-activity list
  const ev = (events.data ?? []) as {
    id: string
    event_type: string
    created_at: string
    video_id: string | null
    course_id: string | null
  }[]
  const videoIds = Array.from(
    new Set(ev.map((e) => e.video_id).filter((v): v is string => !!v)),
  )
  const { data: vids } = videoIds.length
    ? await supabase.from('videos').select('id, title').in('id', videoIds)
    : { data: [] as { id: string; title: string }[] }
  const vTitle = new Map((vids ?? []).map((v) => [v.id, v.title]))

  type CourseRow = {
    id: string
    title: string
    modules: { id: string; videos: { id: string; status: string }[] }[]
  }
  const courseRows = ((courses.data ?? []) as CourseRow[]).map((c) => {
    const vidsInCourse = c.modules.flatMap((m) =>
      m.videos.filter((v) => v.status !== 'draft'),
    )
    const total = vidsInCourse.length
    const done = vidsInCourse.filter((v) => completedIds.has(v.id)).length
    return {
      id: c.id,
      title: c.title,
      completedVideos: done,
      totalVideos: total,
      percentComplete: pct(done, total),
    }
  })

  const loginDays = new Set(
    sess.map((s) => {
      const p = etParts(s.started_at)
      return `${p.year}-${p.month}-${p.day}`
    }),
  )
  const weekCounts = new Map<string, number>()
  for (const s of sess) {
    const k = weekKey(s.started_at)
    weekCounts.set(k, (weekCounts.get(k) ?? 0) + 1)
  }

  return {
    logins: sess.length,
    loginsLast30: sess.filter((s) => s.started_at >= thirtyAgo).length,
    firstLoginAt: sess[0]?.started_at ?? null,
    lastLoginAt: sess[sess.length - 1]?.started_at ?? null,
    activeLoginDays: loginDays.size,
    videoStarts: prog.length,
    videoCompletions: completedIds.size,
    totalWatchSeconds: prog.reduce(
      (sum, p) => sum + Number(p.seconds_watched ?? 0),
      0,
    ),
    courses: courseRows,
    recent: ev.map((e) => ({
      id: e.id,
      type: e.event_type,
      at: e.created_at,
      title: e.video_id ? vTitle.get(e.video_id) ?? null : null,
    })),
    loginsByWeek: lastNWeeks(12).map((key) => ({
      key,
      label: weekLabel(key),
      logins: weekCounts.get(key) ?? 0,
    })),
  }
}

/** True when `viewer` may look at `target`'s analytics (same account). */
export function sameAccount(
  target: Participant,
  ownerId: string,
): boolean {
  return target.id === ownerId || target.parent_id === ownerId
}
