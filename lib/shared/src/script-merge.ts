import type { ScriptSection, Sector } from './types.ts'

/** Generic lead-in used wherever {{complaint_reference}} appears mid-sentence
 * and no condition is documented, so the script never shows a raw bracket.
 * This is the healthcare phrasing (the patient came in to the practice). */
export const COMPLAINT_FALLBACK = 'what you originally came in for'

/** Home-services phrasing: the technician went out to the customer's house,
 * so "came in for" reads wrong — the company "came out for" the job. */
export const HOME_SERVICES_COMPLAINT_FALLBACK = 'what we originally came out for'

/** Pick the generic {{complaint_reference}} phrase for a niche's sector.
 * Unknown/missing sectors keep the healthcare wording. */
export function complaintFallbackFor(sector?: Sector | null): string {
  return sector === 'home_services'
    ? HOME_SERVICES_COMPLAINT_FALLBACK
    : COMPLAINT_FALLBACK
}

/** True when a spoken concern is one of the generic fallback phrases rather
 * than a real complaint, regardless of sector. */
export function isComplaintFallback(spoken: string | undefined | null): boolean {
  return (
    spoken === COMPLAINT_FALLBACK || spoken === HOME_SERVICES_COMPLAINT_FALLBACK
  )
}

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
  return body.replace(
    /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
    (_match, slot, offset: number) => {
      let value: string
      if (extras[slot] !== undefined) value = extras[slot]
      else {
        const content = bySlot.get(slot)
        value =
          content !== undefined && content !== ''
            ? content
            : `[${slot.replace(/_/g, ' ').toUpperCase()}]`
      }
      // The provider fallback ("the whole office") is lower-case; give it a
      // capital when the token opens a sentence or a paragraph. Every other
      // value (names, brands, practice names) is inserted verbatim.
      return slot === 'provider_name' && startsSentence(body, offset)
        ? capitalize(value)
        : value
    },
  )
}

function startsSentence(body: string, offset: number): boolean {
  const before = body.slice(0, offset).replace(/[\s("\u201c]+$/, '')
  return before === '' || /[.!?]["\u201d)]?$/.test(before)
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
