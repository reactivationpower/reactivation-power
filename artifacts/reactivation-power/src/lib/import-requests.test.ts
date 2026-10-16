import { describe, expect, it } from 'vitest'
import {
  IMPORT_REQUEST_MAX_BYTES,
  IMPORT_REQUEST_MAX_ROWS,
  jsonBytes,
  mergeImportSummaries,
  partialImportMessage,
  splitImportRows,
} from './import-requests'

const row = (i: number, notes = '') => ({
  name: `Patient ${i}`, phone: `555010${String(i).padStart(4, '0')}`, email: `p${i}@example.invalid`,
  niche: '', service: 'Adjustment', complaint: '', notes, patientId: String(i), lastVisit: '2025-01-01', doNotCall: '',
})

describe('splitImportRows', () => {
  it('keeps every request under the API body limit and in file order', () => {
    expect(IMPORT_REQUEST_MAX_BYTES).toBeLessThan(4 * 1024 * 1024)
    const rows = Array.from({ length: 1200 }, (_, i) => row(i, 'x'.repeat(9000)))
    const groups = splitImportRows(rows)
    expect(groups.length).toBeGreaterThan(1)
    for (const group of groups) expect(jsonBytes(group)).toBeLessThanOrEqual(IMPORT_REQUEST_MAX_BYTES)
    expect(groups.flat()).toEqual(rows)
  })

  it('never sends more rows than the server accepts per request', () => {
    const rows = Array.from({ length: IMPORT_REQUEST_MAX_ROWS * 2 + 1 }, (_, i) => row(i))
    const groups = splitImportRows(rows)
    expect(groups.map((g) => g.length)).toEqual([IMPORT_REQUEST_MAX_ROWS, IMPORT_REQUEST_MAX_ROWS, 1])
  })

  it('sends a small file as a single request and an oversized row by itself', () => {
    expect(splitImportRows([row(1), row(2)])).toEqual([[row(1), row(2)]])
    expect(splitImportRows([])).toEqual([])
    const huge = row(9, 'y'.repeat(100))
    expect(splitImportRows([row(1), huge, row(2)], { maxBytes: 150 })).toEqual([[row(1)], [huge], [row(2)]])
  })
})

describe('mergeImportSummaries', () => {
  it('adds counts, unions niche lists and keeps file row numbers from every request', () => {
    const merged = mergeImportSummaries([
      { imported: 3, updated: 1, servicesAdded: 0, unchanged: 0, needsReview: 1, skippedDuplicate: 0, skippedInvalid: 1,
        invalidRows: [{ rowNumber: 2, reason: 'No phone' }], unmatchedNiches: ['Spine'], notEnabledNiches: [], simulated: false, batchId: 'a' },
      { imported: 0, updated: 2, servicesAdded: 4, unchanged: 5, needsReview: 0, skippedDuplicate: 2, skippedInvalid: 1,
        invalidRows: [{ rowNumber: 5003, reason: 'No name' }], unmatchedNiches: ['Spine', 'Knee'], notEnabledNiches: ['HBOT'], simulated: true, batchId: 'b' },
    ])
    expect(merged).toEqual({
      imported: 3, updated: 3, servicesAdded: 4, unchanged: 5, needsReview: 1, skippedDuplicate: 2, skippedInvalid: 2,
      invalidRows: [{ rowNumber: 2, reason: 'No phone' }, { rowNumber: 5003, reason: 'No name' }],
      unmatchedNiches: ['Spine', 'Knee'], notEnabledNiches: ['HBOT'], simulated: true, batchId: 'b',
    })
  })

  it('explains a failure after some requests succeeded', () => {
    expect(partialImportMessage(5000, 'Server timed out.')).toBe(
      'The first 5,000 rows were saved; the rest were not. Server timed out. Upload the same file again — rows already saved are matched, not duplicated.',
    )
  })
})
