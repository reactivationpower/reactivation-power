import { DEFAULT_FOLLOWUP_TEXTS } from '@workspace/db/schema'

export const FOLLOWUP_TEXT_COUNT = 6

/** Saved texts, or the defaults when the row is missing or malformed. */
export function followupTexts(cfg: { followup_texts?: unknown } | null | undefined): string[] {
  const saved = cfg?.followup_texts
  return Array.isArray(saved) && saved.length === FOLLOWUP_TEXT_COUNT && saved.every(t => typeof t === 'string' && t.trim())
    ? saved as string[] : DEFAULT_FOLLOWUP_TEXTS
}

export function validateFollowupTexts(texts: unknown): string[] {
  if (!Array.isArray(texts) || texts.length !== FOLLOWUP_TEXT_COUNT) throw new Error(`Enter all ${FOLLOWUP_TEXT_COUNT} texts`)
  return texts.map((t, i) => {
    const text = typeof t === 'string' ? t.trim() : ''
    if (text.length < 20 || text.length > 1000 || !text.includes('STOP')) throw new Error(`Text ${i + 1} must be 20–1000 characters and include STOP opt-out language`)
    return text
  })
}

/**
 * Which text each SMS touch uses. Touches go in order (Text 1, 2, 3…), but the
 * final SMS touch always uses Text 6, the "last text", even when quiet hours
 * removed some earlier touches. Input must be the full cadence for the lead.
 */
export function assignTextNumbers<T extends { kind: string }>(slots: T[]): Array<T & { textNumber?: number }> {
  const sms = slots.filter(s => s.kind === 'sms')
  return slots.map(s => {
    if (s.kind !== 'sms') return s
    const i = sms.indexOf(s)
    return { ...s, textNumber: i === sms.length - 1 ? FOLLOWUP_TEXT_COUNT : Math.min(i + 1, FOLLOWUP_TEXT_COUNT - 1) }
  })
}

export function renderFollowupText(texts: string[], textNumber: unknown, lead: { first_name?: string | null; practice_name?: string | null }) {
  const n = Number.isInteger(textNumber) && (textNumber as number) >= 1 && (textNumber as number) <= texts.length ? textNumber as number : 1
  const practice = String(lead.practice_name ?? '').trim() || 'your practice'
  return texts[n - 1]!.replaceAll('{firstName}', String(lead.first_name ?? '').trim() || 'there').replaceAll('{practiceName}', practice)
}
