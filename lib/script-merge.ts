import type { ScriptSection } from '@/lib/types'

/** Generic lead-in used wherever {{complaint_reference}} appears mid-sentence
 * and no condition is documented, so the script never shows a raw bracket. */
export const COMPLAINT_FALLBACK = 'what you originally came in for'

/** Normalize an office-entered condition into spoken form: lowercase it
 * (unless it looks like an acronym) and prepend "the" when there's no
 * leading article/pronoun, so "Lower Back Pain" reads as
 * "the lower back pain" inside a sentence. */
export function spokenComplaint(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  const isAcronym = /^[A-Z0-9\s]+$/.test(trimmed) && /[A-Z]{2,}/.test(trimmed)
  const text = isAcronym ? trimmed : trimmed.toLowerCase()
  const hasLeadIn =
    /^(the|their|his|her|my|your|a|an|that|this|those|these)\b/i.test(text)
  return hasLeadIn ? text : `the ${text}`
}

/**
 * When no condition is documented, optional "especially with ..." clauses
 * are dropped entirely instead of being filled with a generic phrase, so the
 * opening question reads naturally: "...since you finished your care with us?"
 */
export function stripComplaintClause(body: string): string {
  return body.replace(
    /\s*[,—–-]\s*especially with \{\{\s*complaint_reference\s*\}\}/g,
    '',
  )
}

/** Extract {{slot}} names from a master script body, in order of appearance */
export function extractSlots(body: string): string[] {
  const found: string[] = []
  const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    if (!found.includes(m[1])) found.push(m[1])
  }
  return found
}

/** Merge master script with a niche's sections (and optional contact info) */
export function mergeScript(
  body: string,
  sections: ScriptSection[],
  extras: Record<string, string> = {},
): string {
  const bySlot = new Map(sections.map((s) => [s.slot_name, s.content]))
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, slot) => {
    if (extras[slot] !== undefined) return extras[slot]
    const content = bySlot.get(slot)
    return content !== undefined && content !== ''
      ? content
      : `[${slot.replace(/_/g, ' ').toUpperCase()}]`
  })
}
