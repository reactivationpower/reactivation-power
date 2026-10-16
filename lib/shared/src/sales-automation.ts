/**
 * The single set of rules for turning on automatic texts to unbooked
 * provider-sales leads. The api-server enforces them before enabling, and the
 * Leads settings page uses the same list to disable the button and explain
 * what is still missing. Missing checks always count as not passing.
 */

type Stamp = string | Date | null | undefined

export interface SalesAutomationInput {
  default_assignee_id: string | null | undefined
  approved_at: Stamp
  scope_reviewed_at: Stamp
  capabilities_checked_at: Stamp
  capabilities: Record<string, { state?: string; checkedAt?: string | null } | undefined> | null | undefined
}

export interface SalesAutomationRequirement {
  key: string
  ok: boolean
  /** Plain label shown in the checklist. */
  label: string
  /** What to do, and where, when the requirement is not met. */
  fix: string
  /** Message the server throws when this is the first unmet requirement. */
  error: string
}

export const SALES_AUTOMATION_GHL_CHECKS = ['contacts', 'conversations', 'messages', 'notes', 'appointments'] as const
export const SALES_AUTOMATION_CHECK_MAX_AGE_MS = 24 * 60 * 60_000
const SCHEDULER_MAX_AGE_MS = 10 * 60_000

const GHL_LABELS: Record<typeof SALES_AUTOMATION_GHL_CHECKS[number], string> = {
  contacts: 'Contacts', conversations: 'Conversations', messages: 'Messages', notes: 'Notes', appointments: 'Appointments',
}

function time(v: Stamp) {
  if (!v) return NaN
  return v instanceof Date ? v.getTime() : Date.parse(v)
}

export function schedulerHealthy(capabilities: SalesAutomationInput['capabilities'], now = Date.now()) {
  const wake = capabilities?.scheduler_wake
  const at = Date.parse(wake?.checkedAt ?? '')
  return wake?.state === 'verified' && Number.isFinite(at) && at <= now && now - at < SCHEDULER_MAX_AGE_MS
}

/** Every requirement, in checklist order. The server rejects with the first unmet one. */
export function salesAutomationRequirements(s: SalesAutomationInput, now = Date.now()): SalesAutomationRequirement[] {
  const caps = s.capabilities ?? {}
  const reviewError = 'Review the default assignee, follow-up texts, and eligible new-lead scope first'
  const checkedAt = time(s.capabilities_checked_at)
  const checksRun = Number.isFinite(checkedAt)
  const checksFresh = checksRun && now - checkedAt <= SALES_AUTOMATION_CHECK_MAX_AGE_MS
  const smsState = caps.sms_write?.state
  return [
    { key: 'scheduler', ok: schedulerHealthy(caps, now), label: 'Scheduler running',
      fix: 'The published app must be running. See Scheduler above.',
      error: 'Wait for a healthy scheduled wake on the published app before enabling automation. The Supabase five-minute job must be active.' },
    { key: 'assignee', ok: !!s.default_assignee_id, label: 'Default assignee set',
      fix: 'Pick someone and click Save assignee above.', error: reviewError },
    { key: 'texts', ok: !!s.approved_at, label: 'Texts approved',
      fix: 'Click Approve saved texts above.', error: reviewError },
    { key: 'scope', ok: !!s.scope_reviewed_at, label: 'Scope reviewed',
      fix: 'Click Mark scope reviewed above.', error: reviewError },
    { key: 'checks_fresh', ok: checksFresh, label: 'GoHighLevel checks run in the last 24 hours',
      fix: 'Click Run checks above.', error: 'Recheck capabilities before enabling' },
    ...SALES_AUTOMATION_GHL_CHECKS.map((key) => ({
      key, ok: caps[key]?.state === 'verified', label: `GoHighLevel ${GHL_LABELS[key].toLowerCase()} check passing`,
      fix: checksRun ? 'Fix it in GoHighLevel, then click Run checks above.' : 'Click Run checks above.',
      error: `Verify GoHighLevel ${key} capability first`,
    })),
    { key: 'sms_write', ok: smsState === 'verified' || smsState === 'operator_confirmed', label: 'Texting number confirmed',
      fix: smsState === 'review_required' ? 'Click "Yes, it\'s approved" in GoHighLevel checks above.' : 'Click Run checks above, then confirm your texting number.',
      error: 'Confirm the existing GoHighLevel conversations/message.write permission, SMS-enabled number, and A2P configuration before enabling. No real send was authorized.' },
  ]
}

/** Requirements still missing; empty means automation can be enabled. */
export function salesAutomationMissing(s: SalesAutomationInput, now = Date.now()) {
  return salesAutomationRequirements(s, now).filter((r) => !r.ok)
}
