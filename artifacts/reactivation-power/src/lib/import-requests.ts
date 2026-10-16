import type { PatientImportSummary } from '@workspace/shared/csv-patients'

/**
 * A CSV upload is sent to the server as JSON. A single request must stay
 * under the API's 4 MB body limit (Vercel functions refuse larger bodies at
 * the edge), so the rows are split into consecutive requests of at most this
 * many JSON bytes. Matching is unchanged: each request is applied in file
 * order, and later rows match the people earlier rows created, exactly like
 * uploading the same file twice.
 */
export const IMPORT_REQUEST_MAX_BYTES = 2 * 1024 * 1024
/** Mirrors the server's per-request row cap. */
export const IMPORT_REQUEST_MAX_ROWS = 5000

const encoder = new TextEncoder()
export function jsonBytes(value: unknown): number {
  return encoder.encode(JSON.stringify(value)).length
}

/**
 * Split rows into request-sized groups in file order. Each group fits
 * `maxBytes` of row JSON (a row larger than the budget still travels alone,
 * where the server reports it) and `maxRows` rows.
 */
export function splitImportRows<T>(
  rows: readonly T[],
  { maxBytes = IMPORT_REQUEST_MAX_BYTES, maxRows = IMPORT_REQUEST_MAX_ROWS } = {},
): T[][] {
  const groups: T[][] = []
  let current: T[] = []
  let currentBytes = 0
  for (const row of rows) {
    const bytes = jsonBytes(row) + 1 // the separating comma
    if (current.length > 0 && (currentBytes + bytes > maxBytes || current.length >= maxRows)) {
      groups.push(current)
      current = []
      currentBytes = 0
    }
    current.push(row)
    currentBytes += bytes
  }
  if (current.length > 0) groups.push(current)
  return groups
}

type ImportPart = Partial<PatientImportSummary>
const COUNTS = ['imported', 'updated', 'servicesAdded', 'unchanged', 'needsReview', 'skippedDuplicate', 'skippedInvalid'] as const
const MAX_INVALID_ROWS = 12

/** Combine the summaries of one upload's requests into the single result the dialog shows. */
export function mergeImportSummaries(parts: readonly ImportPart[]): ImportPart {
  const merged: ImportPart = {}
  for (const key of COUNTS) merged[key] = parts.reduce((sum, part) => sum + (part[key] ?? 0), 0)
  merged.invalidRows = parts.flatMap((part) => part.invalidRows ?? []).slice(0, MAX_INVALID_ROWS)
  merged.unmatchedNiches = [...new Set(parts.flatMap((part) => part.unmatchedNiches ?? []))]
  merged.notEnabledNiches = [...new Set(parts.flatMap((part) => part.notEnabledNiches ?? []))]
  if (parts.some((part) => part.simulated)) merged.simulated = true
  const last = parts[parts.length - 1]
  if (last?.batchId) merged.batchId = last.batchId
  return merged
}

/** Error text when a later request of a multi-request upload fails. */
export function partialImportMessage(savedRows: number, reason: string): string {
  return `The first ${savedRows.toLocaleString()} rows were saved; the rest were not. ${reason} Upload the same file again — rows already saved are matched, not duplicated.`
}
