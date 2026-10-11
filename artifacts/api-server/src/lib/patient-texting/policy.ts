export interface TextPolicy {
  handling: 'team' | 'ai'
  afterHours: boolean
  timezone: string
  hours: { day: number; open: string; close: string }[]
  closures: string[]
  provider: 'ghl' | 'independent'
}
export const defaultPolicy: TextPolicy = {
  handling: 'team', afterHours: false, timezone: 'America/Denver',
  hours: [1, 2, 3, 4, 5].map(day => ({ day, open: '09:00', close: '17:00' })),
  closures: [], provider: 'ghl',
}
export function validatePolicy(value: unknown): TextPolicy {
  const v = value as TextPolicy
  if (!v || typeof v.timezone !== 'string' || !v.timezone || !['team', 'ai'].includes(v.handling) || typeof v.afterHours !== 'boolean'
    || !['ghl', 'independent'].includes(v.provider)) throw new Error('Invalid texting settings.')
  try { new Intl.DateTimeFormat('en', { timeZone: v.timezone }).format() } catch { throw new Error('Choose a valid timezone.') }
  if (!Array.isArray(v.hours) || v.hours.length > 7 || new Set(v.hours.map(h => h.day)).size !== v.hours.length
    || v.hours.some(h => !Number.isInteger(h.day) || h.day < 0 || h.day > 6
      || !/^([01]\d|2[0-3]):[0-5]\d$/.test(h.open) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(h.close)
      || h.open >= h.close)) throw new Error('Use one daytime opening interval per day.')
  if (!Array.isArray(v.closures) || v.closures.length > 100 || v.closures.some(d =>
    !/^\d{4}-\d{2}-\d{2}$/.test(d) || new Date(d).toISOString().slice(0, 10) !== d)) throw new Error('Use valid closure dates.')
  return { handling: v.handling, afterHours: v.afterHours, timezone: v.timezone,
    hours: v.hours.map(h => ({ day: h.day, open: h.open, close: h.close })), closures: v.closures, provider: v.provider }
}
const formatters = new Map<string, Intl.DateTimeFormat>()
export function localClock(now: Date, timezone: string) {
  let formatter = formatters.get(timezone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit',
      day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    if (formatters.size > 100) formatters.clear()
    formatters.set(timezone, formatter)
  }
  const parts = formatter.formatToParts(now)
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, day: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(p.weekday),
    time: `${p.hour}:${p.minute}` }
}
export function officeOpen(policy: TextPolicy, now: Date) {
  const c = localClock(now, policy.timezone)
  return !policy.closures.includes(c.date) && policy.hours.some(h => h.day === c.day && c.time >= h.open && c.time < h.close)
}
export function nextOpening(policy: TextPolicy, now: Date): string | null {
  if (!policy.hours.length) return null
  if (officeOpen(policy, now)) return now.toISOString()
  // Iterate instants, not local dates: DST gaps and repeated hours are handled by Intl.
  // At most 100 closure dates plus a week until the next weekly opening.
  const start = Math.ceil(now.getTime() / 60_000) * 60_000
  for (let minute = 0; minute <= 60 * 24 * 108; minute++) {
    const d = new Date(start + minute * 60_000)
    if (officeOpen(policy, d)) return d.toISOString()
  }
  return null
}
export function eligible(consent: boolean, stopped: boolean, timezone: string | null, now: Date) {
  if (!consent || stopped || !timezone) return false
  try { const c = localClock(now, timezone); return c.time >= '09:00' && c.time < '20:00' } catch { return false }
}
export const isStop = (s: string) => /^(stop|stopall|unsubscribe|cancel|end|quit|revoke|opt out)[.! ]*$/i.test(s.trim())
export const asksHuman = (s: string) => /\b(human|person|staff|receptionist|call me|someone call)\b/i.test(s)
