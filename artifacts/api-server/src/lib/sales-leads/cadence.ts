/** All business scheduling is calendar-based Eastern, not elapsed 24h chunks. */
export const ET = 'America/New_York'
export function validTimezone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || zone.length > 80 || (zone !== 'UTC' && !zone.includes('/'))) return false
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(); return true } catch { return false }
}
export function parts(date: Date, zone: string) {
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map(p => [p.type, p.value]))
  return { date: `${values.year}-${values.month}-${values.day}`, weekday: values.weekday, minute: Number(values.hour) * 60 + Number(values.minute) }
}
export function allowed(date: Date, zone?: string | null) {
  const business = parts(date, ET)
  if (['Sat', 'Sun'].includes(business.weekday!) || business.minute < 540 || business.minute >= 1020) return false
  if (zone !== undefined) {
    if (!validTimezone(zone)) return false
    const local = parts(date, zone)
    if (local.minute < 480 || local.minute >= 1200) return false
  }
  return true
}
/**
 * Automated follow-up texts follow the lead's own clock only: Monday–Friday,
 * 8 AM–8 PM in their verified time zone. Eastern business hours apply to
 * staff call reminders, not to texts.
 */
export function textAllowed(date: Date, zone: string | null | undefined) {
  if (!validTimezone(zone)) return false
  const local = parts(date, zone)
  return !['Sat', 'Sun'].includes(local.weekday!) && local.minute >= 480 && local.minute < 1200
}
/** The instant a wall-clock minute happens on a calendar date in a zone. */
function localInstant(date: string, minute: number, zone: string) {
  const guess = Date.parse(`${date}T00:00:00Z`) + minute * 60000
  const seen = parts(new Date(guess), zone)
  const offset = (calendarDay(seen.date) - calendarDay(date)) * 1440 + seen.minute - minute
  return new Date(guess - offset * 60000)
}
const calendarDay = (day: string) => Date.parse(`${day}T12:00:00Z`) / 86400000
export function elapsedDays(start: Date, end: Date) { return Math.round(calendarDay(parts(end, ET).date) - calendarDay(parts(start, ET).date)) }
const hash = (s: string) => [...s].reduce((h, c) => ((h * 31 + c.charCodeAt(0)) >>> 0), 0)
export function cadence(start: Date, zone: string | null, seed: string, laterDays: number[] = [5, 7, 10, 14, 21, 28]) {
  const slots: Array<{ dueAt: string; kind: string; day: number }> = []
  let firstDays = 0
  const usedLater = new Set<number>()
  const origin = Date.parse(`${parts(start, ET).date}T12:00:00Z`)
  for (let day = 0; day < 30; day++) {
    const utcNoon = new Date(origin + day * 86400000)
    const p = parts(utcNoon, ET)
    // Noon is outside the DST transition hour: resolve Eastern offset for
    // this calendar day rather than reusing the starting day's UTC offset.
    const easternNoon = utcNoon.getTime() + (720 - p.minute) * 60000
    if (['Sat', 'Sun'].includes(p.weekday!) || easternNoon + 300 * 60000 <= start.getTime()) continue
    const eligibleLater = laterDays.find(d => d <= day && !usedLater.has(d))
    const first = firstDays < 3
    if (!first && eligibleLater === undefined) continue
    if (first) firstDays++
    else usedLater.add(eligibleLater!)
    const rotation = hash(`${seed}:${p.date}`) % 3
    // Staff call reminders: Eastern business-hour windows.
    const planCall = () => {
      const windows = [[540, 600], [720, 840], [960, 1020]]
      for (let w = 0; w < 3; w++) {
        const [lo, hi] = windows[(rotation + w) % 3]!
        const slot = new Date(easternNoon + (lo! + hash(`${seed}:${p.date}:${w}`) % (hi! - lo!) - 720) * 60000)
        if (slot < start || parts(slot, ET).date !== p.date || !allowed(slot)) continue
        slots.push({ dueAt: slot.toISOString(), kind: 'call_task', day })
        return true
      }
      return false
    }
    // Texts: 8 AM–8 PM on the lead's own clock, same calendar date. Start one
    // window later than the call so the two touches are spread across the day.
    const planText = () => {
      if (!validTimezone(zone)) return false
      const windows = [[480, 720], [720, 960], [960, 1190]]
      for (let w = 0; w < 3; w++) {
        const [lo, hi] = windows[(rotation + 1 + w) % 3]!
        const slot = localInstant(p.date, lo! + hash(`${seed}:${p.date}:sms:${w}`) % (hi! - lo!), zone)
        if (slot < start || parts(slot, zone).date !== p.date || !textAllowed(slot, zone)) continue
        slots.push({ dueAt: slot.toISOString(), kind: 'sms', day })
        return true
      }
      return false
    }
    if (first) { planCall(); planText() }
    // Later attempts alternate call reminder and text; a text that cannot be
    // placed falls back to a call reminder.
    else if (laterDays.indexOf(eligibleLater!) % 2 === 1) { if (!planText()) planCall() }
    else planCall()
  }
  return slots.sort((a, b) => a.dueAt.localeCompare(b.dueAt))
}
export function suggestedFollowup(now: Date, seed: string) {
  return cadence(new Date(now.getTime() + 60_000), null, seed)[0]?.dueAt ?? null
}
export function canAutomate(lead: any) {
  return !lead.historical && lead.consent && !lead.dnd && validTimezone(lead.timezone) && !lead.last_reply_at && !lead.customer_id &&
    !['Strategy Call Booked', 'Engaged', 'Won', 'Not Now', 'Lost/Do Not Contact'].includes(lead.stage) && !lead.appointment_status
}
