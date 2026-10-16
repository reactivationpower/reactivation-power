import { createHash, randomUUID } from 'node:crypto'
import type { PatientImportRow, PatientImportSummary } from '@workspace/shared/csv-patients'

export function normalizePatientPhone(value: string): string {
  const digits = value.replace(/\D/g, '')
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
}
const normalize = (value: string | null | undefined) => (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase()

/** Dates are calendar dates, never inferred from upload time or timezone. */
export function parseLastVisit(value: string | undefined): string | null {
  if (!value?.trim()) return null
  const text = value.trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text)
  if (!iso && !us) throw new Error('Last visit must be YYYY-MM-DD or M/D/YYYY')
  const [year, month, day] = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : [Number(us![3]), Number(us![1]), Number(us![2])]
  const date = new Date(Date.UTC(year, month - 1, day))
  if (year < 1900 || date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day)
    throw new Error('Invalid last visit date')
  if (`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` > new Date().toISOString().slice(0, 10))
    throw new Error('Last visit cannot be in the future')
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function parseDoNotCall(value: string | undefined): boolean {
  const v = normalize(value)
  if (['true', 'yes', 'y', '1', 'do not call'].includes(v)) return true
  if (['', 'false', 'no', 'n', '0'].includes(v)) return false
  throw new Error('Do not call must be true/yes/1 or false/no/0')
}

export interface ImportContactRecord {
  id: string
  name: string
  phone: string
  email: string | null
  niche_id: string | null
  service_label: string | null
  original_complaint: string | null
  notes: string | null
  do_not_call: boolean
}
export interface ImportSourceRecord { contact_id: string; patient_id: string }
export interface ImportServiceRecord {
  contact_id: string
  service_key: string
  niche_id: string | null
  service_label: string | null
  last_visit: string | null
  original_complaint: string | null
  source_notes: string | null
}
export interface ResolvedImportRow { row: PatientImportRow; nicheId: string | null }
export interface PreviousReview { fingerprint: string; decision: string | null; contact_id: string | null }
export interface ReviewWrite {
  row_number: number
  fingerprint: string
  incoming: ResolvedImportRow
  reason: string
  candidate_ids: string[]
}
export const serviceKey = (nicheId: string | null, label: string | null | undefined) =>
  nicheId ? `niche:${nicheId}` : normalize(label) ? `service:${normalize(label)}` : 'unclassified'

export function rowFingerprint(source: string, incoming: ResolvedImportRow): string {
  const r = incoming.row
  return createHash('sha256').update(JSON.stringify([
    source, normalize(r.name), normalizePatientPhone(r.phone), normalize(r.email),
    r.patientId?.trim() ?? '', incoming.nicheId, normalize(r.service),
    r.lastVisit?.trim() ?? '', normalize(r.doNotCall), r.complaint?.trim() ?? '', r.notes?.trim() ?? '',
  ])).digest('hex')
}

export class PatientIndex {
  contacts = new Map<string, ImportContactRecord>()
  phones = new Map<string, Set<string>>()
  emails = new Map<string, Set<string>>()
  patientIds = new Map<string, string>()
  sourceByContact = new Map<string, string>()
  constructor(contacts: ImportContactRecord[], sources: ImportSourceRecord[]) {
    for (const c of contacts) this.put({ ...c })
    for (const s of sources) {
      this.patientIds.set(s.patient_id, s.contact_id)
      this.sourceByContact.set(s.contact_id, s.patient_id)
    }
  }
  put(c: ImportContactRecord) {
    const before = this.contacts.get(c.id)
    if (before) {
      this.phones.get(normalizePatientPhone(before.phone))?.delete(c.id)
      this.emails.get(normalize(before.email))?.delete(c.id)
    }
    this.contacts.set(c.id, c)
    for (const [map, key] of [[this.phones, normalizePatientPhone(c.phone)], [this.emails, normalize(c.email)]] as const) {
      if (!key) continue
      if (!map.has(key)) map.set(key, new Set())
      map.get(key)!.add(c.id)
    }
  }
  match(row: PatientImportRow): { id?: string; reason?: string; candidates: string[] } {
    const patientId = row.patientId?.trim()
    const exact = patientId ? this.patientIds.get(patientId) : undefined
    const phone = [...(this.phones.get(normalizePatientPhone(row.phone)) ?? [])]
    const email = [...(this.emails.get(normalize(row.email)) ?? [])]
    const candidates = [...new Set([...phone, ...email])]
    if (exact && this.contacts.has(exact)) return { id: exact, candidates: [exact] }
    if (candidates.length === 0) return { candidates: [] }
    const sameName = candidates.filter(id => normalize(this.contacts.get(id)!.name) === normalize(row.name))
    if (sameName.length !== 1)
      return { reason: 'Shared contact details or multiple possible patients. Confirm identity before importing.', candidates }
    const id = sameName[0]!
    const c = this.contacts.get(id)!
    if (phone.length && email.length && !phone.includes(id))
      return { reason: 'Phone and email point to different patients.', candidates }
    if (email.some(other => other !== id))
      return { reason: 'Email is also attached to another patient. Confirm identity.', candidates }
    if (normalize(row.email) && normalize(c.email) && normalize(row.email) !== normalize(c.email))
      return { reason: 'Email conflicts with the existing patient.', candidates }
    if (patientId && this.sourceByContact.has(id) && this.sourceByContact.get(id) !== patientId)
      return { reason: 'Patient ID conflicts with the existing source identifier.', candidates }
    return { id, candidates }
  }
}

export function planPatientImport(options: {
  source: string
  rows: ResolvedImportRow[]
  contacts: ImportContactRecord[]
  sources: ImportSourceRecord[]
  services: ImportServiceRecord[]
  previousReviews?: PreviousReview[]
  /** Only set by the authenticated, tenant-checked review resolver. */
  override?: { decision: 'match' | 'create'; contactId?: string }
  makeId?: () => string
}) {
  const makeId = options.makeId ?? randomUUID
  const index = new PatientIndex(options.contacts, options.sources)
  const originals = new Map(options.contacts.map(c => [c.id, c]))
  const services = new Map(options.services.map(s => [`${s.contact_id}/${s.service_key}`, { ...s }]))
  const reviews = new Map((options.previousReviews ?? []).map(r => [r.fingerprint, r]))
  const insertIds = new Set<string>()
  const updatedIds = new Set<string>()
  const serviceWrites = new Map<string, ImportServiceRecord>()
  const sourceWrites = new Map<string, ImportSourceRecord>()
  const reviewWrites: ReviewWrite[] = []
  const summary: PatientImportSummary = {
    imported: 0, updated: 0, servicesAdded: 0, unchanged: 0, needsReview: 0,
    skippedDuplicate: 0, skippedInvalid: 0, unmatchedNiches: [], notEnabledNiches: [],
    invalidRows: [],
  }
  // Also covers manually added contacts and demo seeds made after migration.
  for (const c of options.contacts) {
    const key = `${c.id}/${serviceKey(c.niche_id, c.service_label)}`
    if (!services.has(key)) {
      const s: ImportServiceRecord = { contact_id: c.id, service_key: serviceKey(c.niche_id, c.service_label), niche_id: c.niche_id,
        service_label: c.service_label, last_visit: null, original_complaint: c.original_complaint, source_notes: null }
      services.set(key, s)
      serviceWrites.set(key, s)
    }
  }
  for (const [rowIndex, incoming] of options.rows.entries()) {
    const r = incoming.row
    let lastVisit: string | null
    let doNotCall: boolean
    try {
      if (!r.name?.trim() || normalizePatientPhone(r.phone ?? '').length < 7) throw new Error('Missing name or phone')
      lastVisit = parseLastVisit(r.lastVisit)
      doNotCall = parseDoNotCall(r.doNotCall)
    } catch (error) {
      summary.skippedInvalid++
      if (summary.invalidRows!.length < 12) summary.invalidRows!.push({ rowNumber: rowIndex + 1, reason: (error as Error).message })
      continue
    }
    const fingerprint = rowFingerprint(options.source, incoming)
    const previous = reviews.get(fingerprint)
    if (!options.override && previous?.decision === 'ignore') {
      summary.unchanged++
      continue
    }
    let match = index.match(r)
    if (options.override?.decision === 'create') match = { candidates: [] }
    else if (options.override?.contactId) match = { id: options.override.contactId, candidates: [options.override.contactId] }
    else if (previous?.contact_id && index.contacts.has(previous.contact_id)) match = { id: previous.contact_id, candidates: [previous.contact_id] }
    if (match.id && !index.contacts.has(match.id)) throw new Error('Patient no longer exists')
    if (options.override?.decision === 'create' && r.patientId?.trim() && index.patientIds.has(r.patientId.trim()))
      throw new Error('This patient ID already belongs to another person. Correct the ID before creating a separate person.')
    if (match.id && r.patientId?.trim()) {
      const assigned = index.sourceByContact.get(match.id)
      const other = index.patientIds.get(r.patientId.trim())
      if ((assigned && assigned !== r.patientId.trim()) || (other && other !== match.id)) {
        if (options.override) throw new Error('Patient ID conflicts with an existing identity. Correct the CSV rather than merging.')
        match = { reason: 'Patient ID conflicts with an existing identity.', candidates: match.candidates }
      }
    }
    if (match.reason) {
      summary.needsReview++
      reviewWrites.push({ row_number: rowIndex + 1, fingerprint, incoming, reason: match.reason, candidate_ids: match.candidates })
      continue
    }
    const isNew = !match.id
    const id = match.id ?? makeId()
    const before = index.contacts.get(id)
    const stableMatch = r.patientId?.trim() && index.patientIds.get(r.patientId.trim()) === id
    const after: ImportContactRecord = before ? {
      ...before,
      // Only a stable ID (or explicit human confirmation) can change identity fields.
      name: stableMatch || options.override?.decision === 'match' ? r.name.trim() : before.name,
      phone: stableMatch || options.override?.decision === 'match' ? r.phone.trim() : before.phone,
      email: r.email?.trim() && (stableMatch || options.override?.decision === 'match' || !before.email) ? r.email.trim() : before.email,
      do_not_call: before.do_not_call || doNotCall,
    } : {
      id, name: r.name.trim(), phone: r.phone.trim(), email: r.email?.trim() || null,
      niche_id: incoming.nicheId, service_label: r.service?.trim() || null,
      original_complaint: r.complaint?.trim() || null, notes: r.notes?.trim() || null, do_not_call: doNotCall,
    }
    index.put(after)
    let changed = isNew || JSON.stringify(before) !== JSON.stringify(after)
    if (isNew) insertIds.add(id)
    if (r.patientId?.trim() && !index.sourceByContact.has(id)) {
      const source = { contact_id: id, patient_id: r.patientId.trim() }
      sourceWrites.set(id, source)
      index.patientIds.set(source.patient_id, id)
      index.sourceByContact.set(id, source.patient_id)
      changed = true
    }
    const key = `${id}/${serviceKey(incoming.nicheId, r.service)}`
    const oldService = services.get(key)
    const service: ImportServiceRecord = {
      contact_id: id, service_key: serviceKey(incoming.nicheId, r.service), niche_id: incoming.nicheId,
      service_label: oldService?.service_label || r.service?.trim() || null,
      last_visit: oldService?.last_visit && (!lastVisit || oldService.last_visit >= lastVisit) ? oldService.last_visit : lastVisit,
      original_complaint: oldService?.original_complaint || r.complaint?.trim() || null,
      source_notes: oldService?.source_notes || r.notes?.trim() || null,
    }
    if (!oldService || (Object.keys(service) as Array<keyof ImportServiceRecord>).some(k => oldService[k] !== service[k])) {
      if (!oldService) summary.servicesAdded++
      services.set(key, service)
      serviceWrites.set(key, service)
      changed = true
    }
    if (changed && !insertIds.has(id)) updatedIds.add(id)
    if (!changed) summary.unchanged++
  }
  summary.imported = insertIds.size
  summary.updated = updatedIds.size
  summary.skippedDuplicate = summary.unchanged // compatibility only; no phone-based dropping
  return {
    summary,
    inserts: [...insertIds].map(id => index.contacts.get(id)!),
    updates: [...updatedIds].filter(id => {
      const before = originals.get(id)!
      const after = index.contacts.get(id)!
      return before.name !== after.name || before.phone !== after.phone || before.email !== after.email || before.do_not_call !== after.do_not_call
    }).map(id => ({
      ...index.contacts.get(id)!,
      old_name: originals.get(id)!.name,
      old_phone: originals.get(id)!.phone,
      old_email: originals.get(id)!.email,
    })),
    services: [...serviceWrites.values()],
    sources: [...sourceWrites.values()],
    reviews: reviewWrites,
  }
}
