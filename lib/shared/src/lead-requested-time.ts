/**
 * The appointment time a lead typed on the ad form ("Tuesday at 2",
 * "10/6 2:00 PM", "2026-10-06T14:00") resolved to a wall-clock slot.
 *
 * Wall clock, not an instant: the office and its callers share a clock, so
 * the parsed value is stored as a zone-less `YYYY-MM-DDTHH:mm` string (a
 * Postgres `timestamp`). The browser turns it into a local Date when it
 * needs a real instant (the confirm disposition's appointment time), which
 * is the same convention the "booked" picker already uses.
 *
 * Relative words ("tomorrow", "Tuesday") and the call-next window are
 * resolved on the OFFICE clock (Eastern, the same anchor call-time.ts uses
 * for the reactivation cadence), never on the server's UTC calendar: a form
 * filled at 10 pm Eastern on Monday is already Tuesday in UTC, and "tomorrow
 * at 3" must still mean Tuesday. Use officeClock() to turn an instant into
 * that wall clock before passing it as `now`.
 *
 * Only a day AND a time-of-day count. "Saturday", "any morning this week" or
 * "after 3pm" cannot be locked in on a confirmation call, so they stay as
 * free text and the lead gets the normal script.
 */

export type RequestedWallClock = string // YYYY-MM-DDTHH:mm

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

const pad = (n: number) => String(n).padStart(2, '0')

export function toWallClock(y: number, m: number, d: number, h: number, min: number): RequestedWallClock {
  return `${y}-${pad(m)}-${pad(d)}T${pad(h)}:${pad(min)}`
}

/** Local-time wall clock of a Date, e.g. for comparing "now" with a requested slot. */
export function wallClockOf(d: Date): RequestedWallClock {
  return toWallClock(d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes())
}

/** The zone every stored slot is read in (see call-time.ts for the same anchor). */
export const OFFICE_ZONE = 'America/New_York'

/**
 * The office wall clock at `instant`, as a Date whose LOCAL fields carry
 * that wall clock (so getDay()/getDate() answer "what day is it at the
 * office"). Pass it as `now` to parseRequestedTime / isRequestedSoon on the
 * server, whose own zone is UTC. In the browser, where local time already
 * is the office's clock, plain `new Date()` is equivalent.
 */
export function officeClock(instant: Date, zone: string = OFFICE_ZONE): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(instant)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? NaN)
  // Some engines print midnight as "24" under h23.
  return new Date(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), 0, 0)
}

/** Office wall clock of an instant as a slot string; what the server compares stored slots against. */
export function officeWallClockOf(instant: Date, zone: string = OFFICE_ZONE): RequestedWallClock {
  return wallClockOf(officeClock(instant, zone))
}

const WALL_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/

/** Split a stored slot (either `YYYY-MM-DDTHH:mm` or Postgres' `YYYY-MM-DD HH:mm:ss`) into parts, or null. */
export function wallClockParts(value: string | null | undefined): { y: number; m: number; d: number; h: number; min: number } | null {
  if (!value) return null
  const m = WALL_RE.exec(value)
  if (!m) return null
  const parts = { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]), h: Number(m[4]), min: Number(m[5]) }
  if (!validDate(parts.y, parts.m, parts.d) || parts.h > 23 || parts.min > 59) return null
  return parts
}

/** The slot as a local Date (the browser's zone), or null when unset/invalid. */
export function requestedAtLocalDate(value: string | null | undefined): Date | null {
  const p = wallClockParts(value)
  return p ? new Date(p.y, p.m - 1, p.d, p.h, p.min, 0, 0) : null
}

/** Normalise any accepted storage spelling to `YYYY-MM-DDTHH:mm`. */
export function normalizeWallClock(value: string | null | undefined): RequestedWallClock | null {
  const p = wallClockParts(value)
  return p ? toWallClock(p.y, p.m, p.d, p.h, p.min) : null
}

function validDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false
  const probe = new Date(Date.UTC(y, m - 1, d))
  return probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d
}

interface TimeOfDay {
  hour: number
  minute: number
}

/**
 * "2pm", "2:30 PM", "14:00", "2" (business hours: 1–6 -> afternoon), "noon".
 * Returns the time and the text with it removed so the date can be parsed
 * from what is left.
 */
function takeTime(text: string): { time: TimeOfDay; rest: string } | null {
  const s = ` ${text} `
  const named = /\s(noon|midday)\s/.exec(s)
  if (named) return { time: { hour: 12, minute: 0 }, rest: s.replace(named[0], ' ').trim() }
  // "2pm" "2:30pm" "2 p.m." "14:00" "2 o'clock"
  const re = /(?:^|\s)(?:at\s+|@\s*)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?|o'?clock)?(?=\s|$)/g
  let m: RegExpExecArray | null
  const candidates: { m: RegExpExecArray; time: TimeOfDay; explicit: boolean }[] = []
  while ((m = re.exec(s)) !== null) {
    let hour = Number(m[1])
    const minute = m[2] !== undefined ? Number(m[2]) : 0
    const suffix = m[3]?.replace(/\./g, '')
    if (minute > 59) continue
    if (suffix === 'am' || suffix === 'pm') {
      if (hour < 1 || hour > 12) continue
      if (suffix === 'pm' && hour !== 12) hour += 12
      if (suffix === 'am' && hour === 12) hour = 0
      candidates.push({ m, time: { hour, minute }, explicit: true })
    } else {
      // A bare number only counts as a time when it looks like one: has
      // minutes ("14:00"), says o'clock, or follows "at" ("Tuesday at 2").
      const hasColon = m[2] !== undefined
      const afterAt = /(?:at\s+|@)/.test(m[0])
      if (!hasColon && !suffix && !afterAt) continue
      if (hour > 23) continue
      if (hour >= 1 && hour <= 6) hour += 12
      candidates.push({ m, time: { hour, minute }, explicit: hasColon || !!suffix })
    }
  }
  if (candidates.length === 0) return null
  // Prefer a hit with am/pm over a bare "at 2"; otherwise the last hit,
  // because dates tend to come before times ("10/6 2pm").
  const pick = candidates.find((c) => !!c.m[3]) ?? candidates[candidates.length - 1]
  const rest = (s.slice(0, pick.m.index) + ' ' + s.slice(pick.m.index + pick.m[0].length)).trim()
  return { time: pick.time, rest }
}

interface Ymd {
  y: number
  m: number
  d: number
}

function nextWeekday(target: number, from: Date): Ymd {
  const base = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const delta = (target - base.getDay() + 7) % 7 // 0 = today counts as "this <weekday>"
  base.setDate(base.getDate() + delta)
  return { y: base.getFullYear(), m: base.getMonth() + 1, d: base.getDate() }
}

function takeDate(text: string, now: Date): Ymd | null {
  const s = text.toLowerCase()
  // ISO / numeric year-first: 2026-10-06
  let m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)
  if (m) {
    const c = { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) }
    return validDate(c.y, c.m, c.d) ? c : null
  }
  // US numeric: 10/6, 10/6/26, 10-06-2026
  m = /(?:^|\D)(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2}|\d{4}))?(?!\d)/.exec(s)
  if (m) {
    let y = m[3] ? Number(m[3]) : now.getFullYear()
    if (m[3] && m[3].length === 2) y += 2000
    const c = { y, m: Number(m[1]), d: Number(m[2]) }
    if (!validDate(c.y, c.m, c.d)) return null
    if (!m[3] && monthDayBeforeToday(c, now)) c.y += 1
    return c
  }
  // Month name + day: "Oct 6", "October 6th, 2026", "6 October"
  const monthNames = MONTHS.map((n, i) => ({ n, short: n.slice(0, 3), i }))
  for (const mo of monthNames) {
    const re = new RegExp(`(?:^|\\W)(?:(\\d{1,2})(?:st|nd|rd|th)?\\s+)?${mo.short}[a-z]*\\.?\\s*(?:(\\d{1,2})(?:st|nd|rd|th)?)?(?:,?\\s*(\\d{4}))?(?!\\d)`)
    const hit = re.exec(s)
    if (!hit) continue
    const day = hit[2] ?? hit[1]
    if (!day) continue
    const c = { y: hit[3] ? Number(hit[3]) : now.getFullYear(), m: mo.i + 1, d: Number(day) }
    if (!validDate(c.y, c.m, c.d)) return null
    if (!hit[3] && monthDayBeforeToday(c, now)) c.y += 1
    return c
  }
  if (/\btoday\b/.test(s)) return nextWeekday(now.getDay(), now)
  if (/\btomorrow\b/.test(s)) {
    const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() }
  }
  // Weekday, full or clipped ("tue", "tues", "weds", "thurs"), optionally "next".
  const wd = /\b(?:(next)\s+)?([a-z]{3,9})\b/g
  let hit: RegExpExecArray | null
  while ((hit = wd.exec(s)) !== null) {
    const word = hit[2]
    const i = WEEKDAYS.findIndex((w) => w.startsWith(word) || (word.length >= 3 && w.startsWith(word.replace(/s$/, ''))))
    if (i === -1) continue
    const c = nextWeekday(i, now)
    if (hit[1]) {
      const t = new Date(c.y, c.m - 1, c.d + 7)
      return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() }
    }
    return c
  }
  return null
}

function monthDayBeforeToday(c: Ymd, now: Date): boolean {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return new Date(c.y, c.m - 1, c.d).getTime() < today - 7 * 86_400_000
}

/**
 * Resolve the form text to a wall-clock slot, or null when it does not name
 * both a day and a time. `now` anchors relative words ("Tuesday",
 * "tomorrow") and a year-less date and is read as a WALL CLOCK (its local
 * fields): on the server pass officeClock(submittedAt), so a lead imported
 * later still lands on the Tuesday they meant, in the office's calendar.
 */
export function parseRequestedTime(raw: string | null | undefined, now: Date = new Date()): RequestedWallClock | null {
  if (!raw) return null
  const text = raw.trim().toLowerCase()
  if (!text) return null

  // Full ISO date-time from a calendar widget: "2026-10-06T14:00:00-04:00".
  // Taken literally as the wall clock the widget showed the lead.
  const iso = /^(\d{4})-(\d{2})-(\d{2})[t ](\d{2}):(\d{2})/.exec(text)
  if (iso) {
    const c = { y: Number(iso[1]), m: Number(iso[2]), d: Number(iso[3]) }
    const h = Number(iso[4])
    const min = Number(iso[5])
    if (!validDate(c.y, c.m, c.d) || h > 23 || min > 59) return null
    return toWallClock(c.y, c.m, c.d, h, min)
  }

  // "after 3pm", "before noon", "between 2 and 4": a range, not a slot.
  if (/\b(after|before|between|around|or later|ish)\b/.test(text)) return null
  const cleaned = text.replace(/[,]/g, ' ').replace(/\s+/g, ' ')
  const t = takeTime(cleaned)
  if (!t) return null
  const d = takeDate(t.rest, now)
  if (!d) return null
  return toWallClock(d.y, d.m, d.d, t.time.hour, t.time.minute)
}

function h12(h: number, min: number, withMeridiem: boolean): string {
  const hour = h % 12 === 0 ? 12 : h % 12
  const mm = min === 0 ? '' : `:${pad(min)}`
  return withMeridiem ? `${hour}${mm} ${h < 12 ? 'AM' : 'PM'}` : `${hour}${mm}`
}

/** Badge text: "Tue Oct 6, 2:00 PM" (year added when it differs from now). */
export function formatRequestedAt(value: string | null | undefined, now: Date = new Date()): string {
  const d = requestedAtLocalDate(value)
  if (!d) return ''
  const sameYear = d.getFullYear() === now.getFullYear()
  return d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

/**
 * How the caller says it: "Tuesday at 2", "Tuesday at 2:30", or with the
 * date when it is more than a week out ("Tuesday, October 13th at 2").
 */
export function spokenRequestedTime(value: string | null | undefined, now: Date = new Date()): string {
  const p = wallClockParts(value)
  if (!p) return ''
  const d = new Date(p.y, p.m - 1, p.d)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.round((d.getTime() - today.getTime()) / 86_400_000)
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' })
  const time = h12(p.h, p.min, false)
  if (days === 0) return `today at ${time}`
  if (days === 1) return `tomorrow at ${time}`
  if (days > 1 && days < 7) return `${weekday} at ${time}`
  const month = d.toLocaleDateString('en-US', { month: 'long' })
  return `${weekday}, ${month} ${ordinal(p.d)} at ${time}`
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

/** Two days: the window in which a requested slot puts a lead at the top of "call next". */
export const REQUESTED_SOON_MS = 2 * 24 * 60 * 60 * 1000
/** A slot that passed within the last day is still worth a call to re-book. */
export const REQUESTED_GRACE_MS = 24 * 60 * 60 * 1000

/**
 * Whether the requested slot is close enough (within the next two days, or
 * missed less than a day ago) that confirming it beats every other call.
 * Compared on wall clocks, so `nowWall` must be the office clock
 * (officeWallClockOf on the server, wallClockOf(new Date()) in the browser).
 */
export function isRequestedSoon(value: string | null | undefined, nowWall: RequestedWallClock): boolean {
  const slot = requestedAtLocalDate(value)
  const now = requestedAtLocalDate(nowWall)
  if (!slot || !now) return false
  const diff = slot.getTime() - now.getTime()
  return diff <= REQUESTED_SOON_MS && diff >= -REQUESTED_GRACE_MS
}
