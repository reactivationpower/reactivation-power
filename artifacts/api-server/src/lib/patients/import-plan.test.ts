import { describe, expect, it } from 'vitest'
import {
  parseDoNotCall, parseLastVisit, planPatientImport, rowFingerprint,
  type ImportContactRecord, type ImportServiceRecord, type ResolvedImportRow,
} from './import-plan'

const contact: ImportContactRecord = {
  id: 'person-a', name: 'Jane Example', phone: '(212) 555-0100', email: 'jane@example.invalid',
  niche_id: 'softwave', service_label: 'SoftWave', original_complaint: 'Knee',
  notes: 'Staff note', do_not_call: false,
}
const service: ImportServiceRecord = {
  contact_id: contact.id, service_key: 'niche:softwave', niche_id: 'softwave',
  service_label: 'SoftWave', original_complaint: 'Knee', source_notes: null, last_visit: '2020-01-01',
}
const row: ResolvedImportRow = {
  row: { name: 'Jane Example', phone: '+1 212 555 0100', email: 'jane@example.invalid', service: 'SoftWave', lastVisit: '1/1/2020' },
  nicheId: 'softwave',
}
function plan(rows: ResolvedImportRow[], extra: Partial<Parameters<typeof planPatientImport>[0]> = {}) {
  return planPatientImport({ source: 'csv', rows, contacts: [contact], sources: [], services: [service], ...extra })
}
describe('CSV patient matching and safe updates', () => {
  it('treats unchanged uploads as unchanged, not new people', () => {
    const p = plan([row, row])
    expect(p.summary).toMatchObject({ imported: 0, updated: 0, unchanged: 2, needsReview: 0 })
    expect(p.inserts).toEqual([])
    expect(p.services).toEqual([])
  })
  it('adds another niche under the same patient without changing the primary script or staff notes', () => {
    const p = plan([{ row: { ...row.row, service: 'ChiroThin', notes: 'CSV note' }, nicheId: 'chirothin' }])
    expect(p.summary).toMatchObject({ imported: 0, updated: 1, servicesAdded: 1 })
    expect(p.updates).toEqual([])
    expect(p.services[0]).toMatchObject({ contact_id: contact.id, niche_id: 'chirothin', source_notes: 'CSV note' })
    expect(contact.notes).toBe('Staff note')
  })
  it('retains newer treatment dates when older or blank reports arrive', () => {
    expect(plan([{ ...row, row: { ...row.row, lastVisit: '2019-01-01' } }]).services).toEqual([])
    expect(plan([{ ...row, row: { ...row.row, lastVisit: '' } }]).services).toEqual([])
    expect(plan([{ ...row, row: { ...row.row, lastVisit: '2021-02-03' } }]).services[0]?.last_visit).toBe('2021-02-03')
  })
  it('matches changed phones using a stable patient ID and preserves the primary niche', () => {
    const p = plan([{ ...row, row: { ...row.row, patientId: 'P100', phone: '2125559999', name: 'Jane Updated' } }], {
      sources: [{ contact_id: contact.id, patient_id: 'P100' }],
    })
    expect(p.updates[0]).toMatchObject({ id: contact.id, phone: '2125559999', name: 'Jane Updated', old_phone: contact.phone, niche_id: 'softwave' })
    expect(p.summary.imported).toBe(0)
  })
  it('holds a different person sharing a phone rather than merging or dropping them', () => {
    const p = plan([{ ...row, row: { ...row.row, name: 'John Example', email: '' } }])
    expect(p.summary.needsReview).toBe(1)
    expect(p.reviews[0]?.candidate_ids).toEqual([contact.id])
    expect(p.inserts).toEqual([])
  })
  it('numbers reviews and invalid rows by their place in the file when the upload arrives in parts', () => {
    const held = { ...row, row: { ...row.row, name: 'John Example', email: '' } }
    const invalid = { ...row, row: { ...row.row, lastVisit: '2/30/2020' } }
    const whole = plan([held, invalid])
    expect(whole.reviews[0]?.row_number).toBe(1)
    expect(whole.summary.invalidRows).toEqual([{ rowNumber: 2, reason: expect.any(String) }])
    const later = plan([held, invalid], { firstRowNumber: 5001 })
    expect(later.reviews[0]?.row_number).toBe(5001)
    expect(later.summary.invalidRows?.[0]?.rowNumber).toBe(5002)
    expect(later.summary).toEqual(whole.summary.invalidRows && { ...whole.summary, invalidRows: later.summary.invalidRows })
  })
  it('holds conflicting emails and patient IDs', () => {
    expect(plan([{ ...row, row: { ...row.row, email: 'other@example.invalid' } }]).summary.needsReview).toBe(1)
    expect(plan([{ ...row, row: { ...row.row, patientId: 'P200' } }], {
      sources: [{ contact_id: contact.id, patient_id: 'P100' }],
    }).summary.needsReview).toBe(1)
  })
  it('never clears opt-outs, and imports explicit opt-outs', () => {
    expect(plan([{ ...row, row: { ...row.row, doNotCall: 'no' } }], { contacts: [{ ...contact, do_not_call: true }] }).updates).toEqual([])
    expect(plan([{ ...row, row: { ...row.row, doNotCall: 'YES' } }]).updates[0]?.do_not_call).toBe(true)
  })
  it('creates a new person only once when the file repeats them with multiple services', () => {
    const p = plan([row, { ...row, nicheId: 'chirothin', row: { ...row.row, service: 'ChiroThin' } }, row], {
      contacts: [], services: [], makeId: () => 'new-person',
    })
    expect(p.summary).toMatchObject({ imported: 1, servicesAdded: 2, unchanged: 1 })
    expect(p.inserts).toHaveLength(1)
    expect(p.services.map(s => s.contact_id)).toEqual(['new-person', 'new-person'])
  })
  it('rejects invalid dates and unknown consent flags without making patient changes', () => {
    expect(plan([{ ...row, row: { ...row.row, lastVisit: '2/30/2020' } }]).summary.skippedInvalid).toBe(1)
    expect(plan([{ ...row, row: { ...row.row, doNotCall: 'unknown' } }]).summary.skippedInvalid).toBe(1)
  })
  it('honors an ignored row on repeated upload', () => {
    const incoming = { ...row, row: { ...row.row, name: 'John Example' } }
    const p = plan([incoming], { previousReviews: [{ fingerprint: rowFingerprint('csv', incoming), decision: 'ignore', contact_id: null }] })
    expect(p.summary).toMatchObject({ unchanged: 1, needsReview: 0, imported: 0 })
  })
  it('allows deliberate separate household members, but not duplicate stable IDs', () => {
    expect(plan([row], { override: { decision: 'create' }, makeId: () => 'separate-person' }).inserts).toHaveLength(1)
    expect(() => plan([{ ...row, row: { ...row.row, patientId: 'P100' } }], {
      sources: [{ contact_id: contact.id, patient_id: 'P100' }], override: { decision: 'create' },
    })).toThrow('already belongs')
  })
  it('keeps source identifiers exact, including leading zeroes', () => {
    const p = plan([{ ...row, row: { ...row.row, patientId: '000123' } }])
    expect(p.sources[0]?.patient_id).toBe('000123')
  })
  it('handles a patient beyond the usual API row limit', () => {
    const contacts = Array.from({ length: 1501 }, (_, i) => ({ ...contact, id: `patient-${i}`, phone: `212${String(i).padStart(7, '0')}`, name: `Patient ${i}`, email: null }))
    const p = plan([{ nicheId: 'chirothin', row: { name: 'Patient 1500', phone: '2120001500', service: 'ChiroThin' } }], { contacts, services: [] })
    expect(p.summary.imported).toBe(0)
    expect(p.services.some(s => s.contact_id === 'patient-1500' && s.niche_id === 'chirothin')).toBe(true)
  })
})
describe('calendar dates and restrictions', () => {
  it('parses ISO and US dates without timezone conversion', () => {
    expect(parseLastVisit('2/29/2020')).toBe('2020-02-29')
    expect(parseLastVisit('2020-02-29')).toBe('2020-02-29')
    expect(parseLastVisit('')).toBeNull()
    expect(() => parseLastVisit('29/2/2020')).toThrow()
    expect(() => parseLastVisit('9999-01-01')).toThrow()
  })
  it('recognizes explicit do-not-call values', () => {
    for (const value of ['true', 'yes', '1', 'Y']) expect(parseDoNotCall(value)).toBe(true)
    for (const value of ['', 'false', 'no', '0']) expect(parseDoNotCall(value)).toBe(false)
  })
})
