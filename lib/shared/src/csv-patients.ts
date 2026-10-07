/** CSV contracts shared by the portal and authenticated action server. */
export interface PatientImportRow {
  name: string
  phone: string
  email?: string
  niche?: string
  service?: string
  complaint?: string
  notes?: string
  patientId?: string
  lastVisit?: string
  doNotCall?: string
}

export interface PatientService {
  id: string
  contact_id: string
  niche_id: string | null
  service_label: string | null
  last_visit: string | null
  original_complaint: string | null
  source_notes: string | null
  niche_name: string | null
}

export interface PatientImportSummary {
  imported: number
  updated: number
  servicesAdded: number
  unchanged: number
  needsReview: number
  skippedDuplicate: number
  skippedInvalid: number
  invalidRows?: Array<{ rowNumber: number; reason: string }>
  simulated?: boolean
  unmatchedNiches: string[]
  notEnabledNiches: string[]
  batchId?: string
}

export interface PatientImportReview {
  id: string
  row_number: number
  reason: string
  source_system: string
  row: PatientImportRow
  candidates: Array<{ id: string; name: string; phone: string; email: string | null }>
}
