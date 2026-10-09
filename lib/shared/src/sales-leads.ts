/** Internal provider-sales CRM. Never use these types for practice patient queues. */
export const SALES_STAGES = ['New', 'Attempting Contact', 'Engaged', 'Follow-Up Scheduled', 'Strategy Call Booked', 'No-Show', 'Won', 'Not Now', 'Lost/Do Not Contact'] as const
export const SALES_DISPOSITIONS = ['No Answer', 'Voicemail', 'Spoke–Did Not Schedule', 'Follow-Up Requested', 'Not Now', 'Booked', 'Wrong Number', 'Do Not Contact'] as const
export type SalesStage = typeof SALES_STAGES[number]
export type SalesDisposition = typeof SALES_DISPOSITIONS[number]
export interface SalesLead {
  id: string; first_name: string; last_name: string; email: string; phone: string; practice_name: string;
  source: string; stage: SalesStage; affiliate_id: string | null; assignee_id: string | null;
  ghl_contact_id: string | null; customer_id: string | null; consent: boolean; dnd: boolean;
  timezone: string | null; timezone_origin: string | null; timezone_confirmed_at: string | null;
  next_followup_at: string | null; appointment_status: string | null;
  automation_state: string; sync_state: string; created_at: string; updated_at: string;
  last_reply_at: string | null; historical: boolean; revision: number; sync_error: string | null;
}
export interface SalesActivity {
  id: string; lead_id: string; kind: string; body: string; occurred_at: string; author_name: string | null;
  disposition: string | null; next_followup_at: string | null; provider_id: string | null; status: string | null;
}
export interface SalesSubmission {
  id: string; lead_id: string; source: string; source_path: string; submitted_at: string;
  context: Record<string, unknown>; consent_evidence: Record<string, unknown>; historical: boolean;
}
export interface SalesSettings {
  default_assignee_id: string | null; automation_enabled: boolean; approved_at: string | null;
  template: string; later_days: number[]; capabilities: Record<string, { state: string; requirement: string; checkedAt?:string|null }>;
  capabilities_checked_at: string | null; scope_reviewed_at: string | null;
}
export interface SalesTeamMember { id: string; name: string | null; email: string; active: boolean }
export interface SalesDashboard {
  leads: SalesLead[]; total: number; team: SalesTeamMember[]; settings: SalesSettings;
  reply_notifications: boolean; admin_id: string; super_admin: boolean;
}
export interface SalesDetail {
  lead: SalesLead; activities: SalesActivity[]; submissions: SalesSubmission[];
  contact_url: string | null; suggested_followup: string | null;
  jobs: Array<{ id: string; kind: string; state: string; attempts: number; last_error: string | null; due_at: string }>;
}
export interface SalesImportPreview {
  total: number; sample: Array<{ id: string; name: string; source: string; dateAdded: string | null }>;
  scope: string; preview_id: string; expires_at: string;
}
