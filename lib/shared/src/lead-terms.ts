/** This is a checkbox disclosure, not attorney-provided legal content. */
export const LEAD_TERMS_WORDING = 'I agree to the Terms of Service of Beyond Healthcare LLC for Patient Pipeline.'
export interface LeadTermsVersion {
  id: string
  label: string
  content: string
  content_hash: string
  checkbox_wording: string
  published_at: string
}
export type CurrentLeadTerms = { active: false; version: null } | { active: true; version: LeadTermsVersion }
/** Authenticated admin response only; never returned by public document endpoints. */
export interface LeadTermsAcceptance {
  id: string
  submission_id: string
  lead_id: string
  submitted_identity: { firstName: string; lastName: string; email: string; phone: string; practiceName: string }
  accepted_at: string
  version_id: string
  content_hash: string
  checkbox_wording: string
  source_path: string
  ip: string
  user_agent: string
  label: string
}
export function canonicalTerms(content: string): string {
  return content.replace(/\r\n?/g, '\n').trim()
}
export function termsAcceptanceError(current: CurrentLeadTerms, version: unknown, checked: unknown): string | null {
  if (!current.active) return null
  if (version !== current.version.id) return 'The Terms of Service changed. Please review the current terms and check again.'
  if (checked !== true) return 'Please review and accept the Terms of Service.'
  return null
}
