import { parts, validTimezone } from '../sales-leads/cadence'
export type ReminderKind = 'day_before' | 'twelve_hours' | 'two_hours' | 'starting'
/** 'final' is the old 30-minute text; kept only so older rows still render. */
export type MessageKind = 'confirmation' | ReminderKind | 'final' | 'rescheduled' | 'cancelled'
export const REMINDER_KINDS: MessageKind[] = ['day_before', 'twelve_hours', 'two_hours', 'starting', 'final']
/** Reminder plan: when (minutes before the call) and whether an email goes with the text. */
export const REMINDERS: { kind: ReminderKind; before: number; email: boolean }[] = [
  { kind: 'day_before', before: 24 * 60, email: true },
  { kind: 'twelve_hours', before: 12 * 60, email: true },
  { kind: 'two_hours', before: 2 * 60, email: true },
  { kind: 'starting', before: 5, email: true },
]
/** Minimum gap between automatic texts. The 5-minute "starting now" text is never held back. */
export const SMS_GAP = 30
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
  REMINDERS.forEach((r, i) => {
    const due = new Date(start.getTime() - r.before * MINUTE)
    if (r.kind === 'starting') {
      // Join-now text: send near the start or not at all, never a late catch-up.
      if (due > now) {
        add('starting', 'sms', due, new Date(start.getTime() + 5 * MINUTE))
        add('starting', 'email', due, new Date(start.getTime() + 5 * MINUTE))
      }
      return
    }
    // No late catch-up, and don't stack a reminder right on top of the confirmation.
    if (due.getTime() - now.getTime() < SMS_GAP * MINUTE) return
    const next = REMINDERS[i + 1]
    // A text that falls at night may wait for 8 AM, but only until the next reminder is due.
    add(r.kind, 'sms', due, new Date(start.getTime() - next.before * MINUTE))
    // Emails have no quiet hours; they go at the exact time or within the hour.
    if (r.email) add(r.kind, 'email', due, new Date(Math.min(due.getTime() + 60 * MINUTE, start.getTime() - next.before * MINUTE)))
  })
  let previous = -Infinity
  return slots.sort((a,b) => +a.dueAt - +b.dueAt).filter(s => {
    if (s.channel !== 'sms') return true
    if (s.kind !== 'starting' && +s.dueAt - previous < SMS_GAP * MINUTE) return false
    previous = +s.dueAt
    return true
  })
}
