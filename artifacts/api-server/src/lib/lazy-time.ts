/**
 * Forgiving time-of-day parsing for the call screen. Callers type what they'd
 * say out loud — "9p", "930", "10:30", "1030a", "2 pm", "noon" — and it
 * resolves to a wall-clock hour/minute. Returns null when the text is not yet
 * a valid time so the UI can keep the last good value.
 */
export interface LazyTime {
  hour: number // 0-23
  minute: number // 0-59
}

export function parseLazyTime(raw: string): LazyTime | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, '')
  if (!s) return null
  if (s === 'noon') return { hour: 12, minute: 0 }
  if (s === 'midnight') return { hour: 0, minute: 0 }

  const m = s.match(/^(\d{1,2})(?::?(\d{2}))?\s*(a|am|p|pm)?$/)
  if (!m) return null
  let hour = Number(m[1])
  const minute = m[2] !== undefined ? Number(m[2]) : 0
  const suffix = m[3]

  if (minute > 59) return null
  // Bare 3-4 digit input like "930" / "1030" is handled by the regex via the
  // optional colon: "930" -> 9 + 30, "1030" -> 10 + 30.
  if (suffix) {
    if (hour < 1 || hour > 12) return null
    const isPm = suffix.startsWith('p')
    if (isPm && hour !== 12) hour += 12
    if (!isPm && hour === 12) hour = 0
  } else {
    if (hour > 23) return null
    // No suffix: assume business hours. 1-6 -> afternoon (1p..6p),
    // 7-11 -> morning, 12 -> noon, 13-23 as typed.
    if (hour >= 1 && hour <= 6) hour += 12
  }
  return { hour, minute }
}

/** "9:00 AM" style label */
export function formatLazyTime(t: LazyTime): string {
  const h12 = t.hour % 12 === 0 ? 12 : t.hour % 12
  const mm = String(t.minute).padStart(2, '0')
  return `${h12}:${mm} ${t.hour < 12 ? 'AM' : 'PM'}`
}

/** Snap a parsed time onto a calendar date (local time) */
export function combineDateTime(date: Date, t: LazyTime): Date {
  const d = new Date(date)
  d.setHours(t.hour, t.minute, 0, 0)
  return d
}
