/**
 * The strategy-call booking window: 4 full Sunday–Saturday weeks, starting
 * on the Sunday of the current week in the visitor's timezone. The calendar
 * draws exactly these days, and the server only offers and books times
 * before the end of the last Saturday.
 */
export const BOOKING_WINDOW_WEEKS = 4
export const BOOKING_WINDOW_DAY_COUNT = BOOKING_WINDOW_WEEKS * 7

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function zonedParts(ms: number, tz: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms))
  const out: Record<string, string> = {}
  for (const p of parts) out[p.type] = p.value
  return out
}

/** Offset (ms) of `tz` from UTC at an instant. */
function tzOffsetMs(ms: number, tz: string): number {
  const p = zonedParts(ms, tz)
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  )
  return asUtc - Math.floor(ms / 1000) * 1000
}

/** The instant of local midnight for a calendar date (month is 1-based). */
function zonedMidnightMs(year: number, month: number, day: number, tz: string): number {
  const guess = Date.UTC(year, month - 1, day)
  let result = guess - tzOffsetMs(guess, tz)
  // Correct once if the offset differs at the result (DST change nearby).
  const corrected = guess - tzOffsetMs(result, tz)
  if (corrected !== result) result = corrected
  return result
}

export interface BookingWindowDay {
  /** "YYYY-MM-DD" in the timezone */
  key: string
  /** Local noon of that day, as an instant */
  ms: number
  /** True for days before today */
  isPast: boolean
}

export interface BookingWindow {
  /** Local midnight that starts the first Sunday */
  startMs: number
  /** Local midnight right after the last Saturday (exclusive) */
  endMs: number
  /** Exactly BOOKING_WINDOW_DAY_COUNT days, Sunday first */
  days: BookingWindowDay[]
}

const pad = (n: number) => String(n).padStart(2, '0')

export function bookingWindow(nowMs: number, tz: string): BookingWindow {
  const p = zonedParts(nowMs, tz)
  const todayKey = `${p.year}-${p.month}-${p.day}`
  const weekday = WEEKDAYS.indexOf(p.weekday)
  const y = Number(p.year)
  const m = Number(p.month)
  const d = Number(p.day) - weekday
  const days: BookingWindowDay[] = []
  for (let i = 0; i < BOOKING_WINDOW_DAY_COUNT; i++) {
    const date = new Date(Date.UTC(y, m - 1, d + i))
    const key = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
    const midnight = zonedMidnightMs(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), tz)
    days.push({ key, ms: midnight + 12 * 60 * 60 * 1000, isPast: key < todayKey })
  }
  const after = new Date(Date.UTC(y, m - 1, d + BOOKING_WINDOW_DAY_COUNT))
  return {
    startMs: zonedMidnightMs(y, m, d, tz),
    endMs: zonedMidnightMs(after.getUTCFullYear(), after.getUTCMonth() + 1, after.getUTCDate(), tz),
    days,
  }
}

/** True when a slot instant falls before the end of the window. */
export function isWithinBookingWindow(slotMs: number, nowMs: number, tz: string): boolean {
  return slotMs < bookingWindow(nowMs, tz).endMs
}
