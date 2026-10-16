/**
 * CSV plumbing shared by every list upload in the portal (contacts, campaign
 * leads). Each dialog brings its own column targets and header patterns;
 * the parser and the two-pass header detection are the same everywhere so
 * an office gets one consistent "we found your columns" experience.
 */

// ---------- tiny CSV parser (handles quoted fields, CRLF) ----------

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.some((f) => f.trim() !== '')) rows.push(row)
      row = []
    } else {
      field += ch
    }
  }
  row.push(field)
  if (row.some((f) => f.trim() !== '')) rows.push(row)
  return rows
}

// ---------- column auto-detection ----------

export type HeaderPatterns<T extends string> = Array<[T, RegExp]>

/**
 * Header detection runs in two passes so that precise headings always win
 * over loose ones no matter what order the export put them in. `strict`
 * holds unambiguous full-heading matches, `loose` the "contains" fallbacks.
 * Every column can still be remapped by hand on the columns step.
 */
export function detectColumnsWith<T extends string>(
  headers: string[],
  strict: HeaderPatterns<T>,
  loose: HeaderPatterns<T>,
): Partial<Record<T, number>> {
  const map: Partial<Record<T, number>> = {}
  const claimed = new Set<number>()

  for (const patterns of [strict, loose]) {
    for (const [target, pattern] of patterns) {
      if (map[target] !== undefined) continue
      for (let idx = 0; idx < headers.length; idx++) {
        if (claimed.has(idx)) continue
        if (pattern.test(headers[idx].trim())) {
          map[target] = idx
          claimed.add(idx)
          break
        }
      }
    }
  }
  return map
}

/** A full-name column is redundant when first/last both came through. */
export function dropRedundantFullName<T extends string>(
  map: Partial<Record<T | 'name' | 'firstName' | 'lastName', number>>,
): void {
  if (map.name !== undefined && map.firstName !== undefined && map.lastName !== undefined) {
    delete map.name
  }
}

// Name patterns are identical for every upload: people are people.
export const NAME_STRICT_PATTERNS: HeaderPatterns<'firstName' | 'lastName' | 'name'> = [
  // "First Name", "Patient First", "Pt First Name", "Given Name", "FName"
  [
    'firstName',
    /^((patient|pt|client|customer|contact|lead)[\s_-]?)?(first[\s_-]?name|fname|first|given[\s_-]?name)$/i,
  ],
  [
    'lastName',
    /^((patient|pt|client|customer|contact|lead)[\s_-]?)?(last[\s_-]?name|lname|last|surname|family[\s_-]?name)$/i,
  ],
  [
    'name',
    /^((full|patient|client|customer|contact|display|lead)[\s_-]?)?name$|^(patient|client|customer|lead)$|^name[\s_-]?of[\s_-]?patient$|^patient[\s_-]?full[\s_-]?name$/i,
  ],
]

export const NAME_LOOSE_PATTERNS: HeaderPatterns<'firstName' | 'lastName' | 'name'> = [
  ['firstName', /first[\s_-]?name|\bfirst\b/i],
  // A bare "last" is a surname unless it's clearly a date or service
  // ("Last Visit", "Last Service", "Last Appt Date")
  [
    'lastName',
    /last[\s_-]?name|\blast\b(?![\s_-]?(visit|service|seen|appt|appointment|date|call|contact|treatment|procedure|attempt))/i,
  ],
  ['name', /\bname\b/i],
]
