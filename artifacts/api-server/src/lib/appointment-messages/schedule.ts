import { parts, validTimezone } from '../sales-leads/cadence'
export type MessageKind = 'confirmation' | 'day_before' | 'final' | 'rescheduled' | 'cancelled'
export type MessageSlot = { kind: MessageKind; channel: 'email' | 'sms'; dueAt: Date; expiresAt: Date }
export const MINUTE = 60_000
export const DAY = 1440 * MINUTE
export function smsAllowed(now: Date, zone: string | null): boolean {
  if (!validTimezone(zone)) return false
  const minute = parts(now, zone).minute
  return minute >= 480 && minute < 1200
}
/** Search real instants rather than adding fixed UTC offsets; handles DST. */
export function nextSmsWindow(now: Date, zone: string | null): Date | null {
  if (!validTimezone(zone)) return null
  if (smsAllowed(now, zone)) return now
  const first = Math.ceil(now.getTime() / MINUTE) * MINUTE
  for (let t = first; t <= first + 26 * 60 * MINUTE; t += MINUTE) {
    if (smsAllowed(new Date(t), zone)) return new Date(t)
  }
  return null
}
export function scheduleMessages(now: Date, start: Date, zone: string | null, kind: 'confirmation' | 'rescheduled' | 'cancelled'): MessageSlot[] {
  const slots: MessageSlot[] = []
  const expiry = kind === 'cancelled' ? new Date(now.getTime() + DAY) : start
  const add = (k: MessageKind, channel: 'email' | 'sms', due: Date, expires: Date) => {
    const target = channel === 'sms' ? nextSmsWindow(due, zone) : due
    if (target && target < expires) slots.push({ kind: k, channel, dueAt: target, expiresAt: expires })
  }
  add(kind, 'email', now, expiry)
  add(kind, 'sms', now, expiry)
  if (kind === 'cancelled') return slots
  const dayBefore = new Date(start.getTime() - DAY)
  // No late catch-up, and don't put a reminder within an hour of confirmation.
  if (dayBefore.getTime() - now.getTime() >= 60 * MINUTE) {
    add('day_before', 'email', dayBefore, new Date(dayBefore.getTime() + 60 * MINUTE))
    add('day_before', 'sms', dayBefore, new Date(start.getTime() - 60 * MINUTE))
  }
  const final = new Date(start.getTime() - 30 * MINUTE)
  if (final > now && smsAllowed(final, zone)) add('final', 'sms', final, new Date(start.getTime() - 5 * MINUTE))
  // Preserve the confirmation, suppress clustered texts (including morning deferrals).
  let previous = -Infinity
  return slots.sort((a,b) => +a.dueAt - +b.dueAt).filter(s => {
    if (s.channel !== 'sms') return true
    if (+s.dueAt - previous < 60 * MINUTE) return false
    previous = +s.dueAt
    return true
  })
}
