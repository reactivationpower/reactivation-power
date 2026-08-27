export type ContentStatus = 'draft' | 'live'
export type ParticipantRole = 'owner' | 'staff'

/** Industry sector a course/niche belongs to */
export type Sector = 'healthcare' | 'home_services'

export const SECTOR_LABELS: Record<Sector, string> = {
  healthcare: 'Healthcare',
  home_services: 'Home Services',
}

export interface Participant {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  parent_id: string | null
  role: ParticipantRole
  is_active: boolean
  selected_niche_id?: string | null
  practice_name?: string | null
  default_niche_id?: string | null
  /** How many cold-list "initial" calls to keep live in the queue (5/7/10) */
  call_batch_size?: number | null
  created_at: string
}

/** Allowed call-queue batch sizes, and the default for new accounts */
export const CALL_BATCH_SIZES = [5, 7, 10] as const
export const DEFAULT_CALL_BATCH_SIZE = 7

export interface ParticipantAlias {
  id: string
  participant_id: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  ip_address: string | null
  first_seen_at: string
  last_seen_at: string
  login_count: number
}

export interface Course {
  id: string
  title: string
  description: string | null
  slug: string
  thumbnail_url: string | null
  status: ContentStatus
  sort_order: number
  sector: Sector
  created_at: string
}

export interface Module {
  id: string
  course_id: string
  title: string
  description: string | null
  status: ContentStatus
  sort_order: number
  created_at: string
}

export interface Video {
  id: string
  module_id: string
  title: string
  description: string | null
  video_url: string | null
  duration_seconds: number | null
  thumbnail_url: string | null
  status: ContentStatus
  sort_order: number
  created_at: string
}

export interface Attachment {
  id: string
  video_id: string | null
  module_id: string | null
  file_url: string
  file_name: string
  file_size: number | null
  file_type: string | null
  created_at: string
}

export interface Session {
  id: string
  participant_id: string
  ip_address: string | null
  user_agent: string | null
  started_at: string
  last_active_at: string
}

export interface VideoProgress {
  id: string
  participant_id: string
  video_id: string
  seconds_watched: number
  furthest_position: number
  percent_watched: number
  completed: boolean
  completed_at: string | null
  updated_at: string
}

export type ActivityEventType =
  | 'login'
  | 'video_start'
  | 'video_progress'
  | 'video_complete'
  | 'attachment_download'
  | 'module_unlock'

export interface ActivityEvent {
  id: string
  participant_id: string
  session_id: string | null
  course_id: string | null
  module_id: string | null
  video_id: string | null
  event_type: ActivityEventType
  metadata: Record<string, unknown> | null
  ip_address: string | null
  created_at: string
}

/** Video completion threshold (percent watched) */
export const COMPLETION_THRESHOLD = 90
/** Max active staff members per owner participant (disabled staff don't count) */
export const MAX_STAFF = 5

// ---------- Reactivation ----------

export interface Niche {
  id: string
  name: string
  sort_order: number
  is_active: boolean
  sector: Sector
  created_at: string
}

export interface ReactivationScript {
  id: string
  title: string
  body: string
  status: ContentStatus
  updated_at: string
  created_at: string
}

export interface ScriptSection {
  id: string
  niche_id: string
  slot_name: string
  content: string
  updated_at: string
}

export type ScriptFlowVariant = 'default' | 'positive' | 'caution' | 'negative' | 'objection'

/** One screen of the interactive branching call script. niche_id null = general/default */
export interface ScriptFlowStep {
  id: string
  niche_id: string | null
  step_key: string
  title: string
  content: string
  sort_order: number
  updated_at: string
}

/** A clickable "what the patient said" button routing between flow steps */
export interface ScriptFlowChoice {
  id: string
  niche_id: string | null
  from_step_key: string
  label: string
  to_step_key: string | null
  variant: ScriptFlowVariant
  sort_order: number
}

export interface PipelineStage {
  id: string
  owner_id: string | null
  name: string
  sort_order: number
  is_default: boolean
  created_at: string
}

export interface Contact {
  id: string
  owner_id: string
  created_by: string | null
  name: string
  phone: string
  email: string | null
  niche_id: string | null
  stage_id: string | null
  do_not_call: boolean
  notes: string | null
  first_call_at: string | null
  service_label: string | null
  /** What the patient was previously treated for (optional; fills
   * the {{complaint_reference}} script token when present). */
  original_complaint: string | null
  created_at: string
}

/**
 * A practice's learned "service/appointment type -> niche" mapping.
 * Created during CSV import so future uploads classify automatically.
 */
export interface ServiceNicheMapping {
  id: string
  owner_id: string
  service_label: string
  niche_id: string | null
  created_at: string
  updated_at: string
}

export type CallDisposition =
  | 'no_answer'
  | 'voicemail'
  | 'spoke_did_not_schedule'
  | 'spoke_call_back_later'
  | 'scheduled'
  | 'do_not_call'

export interface ReactivationCall {
  id: string
  contact_id: string
  caller_id: string | null
  disposition: CallDisposition
  voicemail_left: boolean
  notes: string | null
  created_at: string
}

export type FollowUpReason =
  | 'retry'
  | 'three_month'
  | 'quarterly'
  | 'manual'
  | 'initial'

export interface FollowUp {
  id: string
  contact_id: string
  due_at: string
  reason: FollowUpReason
  completed_call_id: string | null
  created_at: string
}

export const DISPOSITION_LABELS: Record<CallDisposition, string> = {
  no_answer: 'No Answer',
  voicemail: 'Voicemail',
  spoke_did_not_schedule: 'Spoke — Didn\u2019t Schedule',
  spoke_call_back_later: 'Spoke — Call Back Later',
  scheduled: 'Scheduled',
  do_not_call: 'Do Not Call',
}

/** Months a contact stays in the weekly retry cycle before dropping to quarterly */
export const RETRY_WINDOW_MONTHS = 3
