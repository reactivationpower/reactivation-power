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
    const count = firstDays < 3 ? 2 : eligibleLater !== undefined ? 1 : 0
    if (!count) continue
    if (firstDays < 3) firstDays++
    else usedLater.add(eligibleLater!)
    const windows = [[540, 600], [720, 840], [960, 1020]]
    const rotation = hash(`${seed}:${p.date}`) % 3
    let planned = 0
    for (let w = 0; w < 3 && planned < count; w++) {
      const [lo, hi] = windows[(rotation + w) % 3]!
      const offset = hash(`${seed}:${p.date}:${w}`) % (hi! - lo!)
      const target = lo! + offset
      const slot = new Date(easternNoon + (target - 720) * 60000)
      if (slot < start || parts(slot, ET).date !== p.date || !allowed(slot)) continue
      const kind = planned === 0 ? 'call_task' : 'sms'
      if (kind === 'sms' && !allowed(slot, zone)) continue
      slots.push({ dueAt: slot.toISOString(), kind, day })
      planned++
    }
    // Later attempts alternate call task and SMS, but only eligible SMS windows.
    if (count === 1 && eligibleLater !== undefined && laterDays.indexOf(eligibleLater) % 2 === 1 && slots.at(-1)?.day === day && allowed(new Date(slots.at(-1)!.dueAt), zone)) slots[slots.length - 1]!.kind = 'sms'
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
