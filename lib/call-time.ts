/**
 * Eastern-time helpers for the reactivation call cadence.
 *
 * The server runs in UTC, but the business (and the "9am-6pm" scatter window)
 * is Eastern. These helpers keep scheduling and display anchored to
 * America/New_York so a call scattered to "the afternoon" actually lands in
 * the afternoon for the office, and the dashboard shows the same band.
 */

const ET_ZONE = 'America/New_York'

/** Minutes to add to a UTC wall clock to get the ET wall clock (negative). */
function etOffsetMinutes(instant: Date): number {
  const tz =
    new Intl.DateTimeFormat('en-US', {
      timeZone: ET_ZONE,
      timeZoneName: 'shortOffset',
    })
      .formatToParts(instant)
      .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT-5'
  const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(tz)
  if (!m) return -300
  const sign = m[1] === '-' ? -1 : 1
  const hh = parseInt(m[2], 10)
  const mm = m[3] ? parseInt(m[3], 10) : 0
  return sign * (hh * 60 + mm)
}

/**
 * Build a UTC Date whose Eastern wall-clock reads y-mo-d at hh:mm.
 * DST-safe: the offset is probed at noon UTC on the target day.
 */
export function easternWallClockToUtc(
  y: number,
  mo: number,
  d: number,
  hh: number,
  mm: number,
): Date {
  const probe = new Date(Date.UTC(y, mo, d, 12, 0, 0))
  const off = etOffsetMinutes(probe)
  return new Date(Date.UTC(y, mo, d, hh, mm, 0) - off * 60000)
}

/** The Eastern hour (0-23) of an instant. */
export function easternHour(instant: Date): number {
  const h = new Intl.DateTimeFormat('en-US', {
    timeZone: ET_ZONE,
    hour12: false,
    hour: '2-digit',
  }).formatToParts(instant)
  const raw = h.find((p) => p.type === 'hour')?.value ?? '0'
  const n = parseInt(raw, 10)
  // Intl can emit "24" for midnight in hour12:false — normalize to 0.
  return n === 24 ? 0 : n
}

export type CallTimeBand = 'Morning' | 'Midday' | 'Afternoon'

/** Bucket an instant into a coarse Eastern time-of-day band. */
export function callTimeBand(iso: string): CallTimeBand {
  const hour = easternHour(new Date(iso))
  if (hour < 12) return 'Morning'
  if (hour < 15) return 'Midday'
  return 'Afternoon'
}

/** Short Eastern clock label, e.g. "2:30 PM". */
export function easternClock(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: ET_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso))
}

/** 0 = Morning, 1 = Midday, 2 = Afternoon. */
export function bandIndex(band: CallTimeBand): 0 | 1 | 2 {
  return band === 'Morning' ? 0 : band === 'Midday' ? 1 : 2
}

/**
 * The intentional call time for a follow-up, or null when there isn't one.
 * Only scattered retries (no-answer/VM) and picked callbacks carry a real
 * time-of-day; cold-call "initial" releases and 3-month/quarterly defaults
 * have no meaningful hour, so we don't imply one.
 */
export function suggestedCallTime(
  reason: string,
  dueAt: string,
): { band: CallTimeBand; clock: string } | null {
  if (reason !== 'retry' && reason !== 'manual') return null
  return { band: callTimeBand(dueAt), clock: easternClock(dueAt) }
}

/** The Eastern calendar date (YYYY-MM-DD) of an instant — lexically sortable. */
function easternDateKey(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ET_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

/**
 * True when the due instant falls on or before "today" in Eastern time —
 * i.e. it's overdue or scheduled for some point later today. Lets a
 * time-scattered contact appear in the day's list all day rather than
 * popping in only once its exact minute arrives.
 */
export function dueWithinEasternToday(iso: string): boolean {
  return easternDateKey(new Date(iso)) <= easternDateKey(new Date())
}
