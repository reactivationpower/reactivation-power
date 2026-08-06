import type { ScriptSection } from '@/lib/types'

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
