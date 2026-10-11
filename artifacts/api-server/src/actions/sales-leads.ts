import { pool } from '@workspace/db'
import { requireAdmin } from '@/lib/auth/admin-session'
import { listAdminUsers, getAdminUserById } from '@/lib/data/admin-users'
import { resolveQualifiedReferral } from '@/lib/affiliates/attribution'
import { SALES_STAGES, SALES_DISPOSITIONS, type SalesDisposition, type SalesStage } from '@workspace/shared/sales-leads'
import { activity, emailKey, enqueue, id, intake, phoneKey, settings, stop, transaction, type Intake } from '@/lib/sales-leads/store'
import { allowed, cadence, suggestedFollowup, validTimezone } from '@/lib/sales-leads/cadence'
import { contactPage, contactUrl, verifyCapabilities } from '@/lib/sales-leads/provider'
import { runSalesWorker } from '@/lib/sales-leads/worker'
import { schedulerHealthy } from '@/lib/sales-leads/wake'
import { withSyncState } from '@/lib/sales-leads/sync-state'
import { assignTextNumbers, followupTexts, validateFollowupTexts } from '@/lib/sales-leads/followup-texts'
const safeText = (s: unknown, max = 200) => typeof s === 'string' ? s.trim().slice(0, max) : ''
function email(s: unknown) {
  const value = emailKey(safeText(s, 254))
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error('Enter a valid email')
  return value
}
async function assignee(value: string | null) {
  if (!value) return null
  const user = await getAdminUserById(value)
  if (!user?.active || !user.confirmedAt) throw new Error('Choose an active, verified staff account')
  return user.id
}
export async function listSalesLeads(input: { query?: string; stage?: string; source?: string; assignee?: string; page?: number } = {}) {
  const admin = await requireAdmin()
  const values = [`%${safeText(input.query, 100).replace(/[%_]/g, '')}%`, safeText(input.stage), safeText(input.source), safeText(input.assignee)]
  const where = `WHERE (concat_ws(' ',first_name,last_name,email,phone,practice_name) ILIKE $1)
    AND ($2='' OR stage=$2) AND ($3='' OR source=$3) AND ($4='' OR assignee_id=$4)`
  const [rows, count, team, cfg, preference] = await Promise.all([
    pool.query(`SELECT * FROM sales_leads ${where} ORDER BY created_at DESC LIMIT 25 OFFSET $5`, [...values, (Math.max(1, Number(input.page) || 1) - 1) * 25]),
    pool.query(`SELECT count(*) FROM sales_leads ${where}`, values), listAdminUsers(), settings(),
    pool.query('SELECT reply_notifications FROM sales_preferences WHERE admin_id=$1', [admin.userId]),
  ])
  return { leads: await withSyncState(rows.rows), total: Number(count.rows[0].count), team: team.filter(u => u.active && u.confirmedAt).map(u => ({ id: u.id, name: u.name, email: u.email, active: u.active })),
    settings: cfg, reply_notifications: preference.rows[0]?.reply_notifications !== false, admin_id: admin.userId, super_admin: admin.role === 'super_admin' }
}
export async function getSalesLead(leadId: string) {
  await requireAdmin()
  const lead = (await pool.query('SELECT * FROM sales_leads WHERE id=$1', [leadId])).rows[0]
  if (!lead) throw new Error('Lead not found')
  const [activities, submissions, jobs] = await Promise.all([
    pool.query('SELECT * FROM sales_activities WHERE lead_id=$1 ORDER BY occurred_at DESC LIMIT 500', [leadId]),
    pool.query('SELECT * FROM sales_submissions WHERE lead_id=$1 ORDER BY submitted_at DESC', [leadId]),
    pool.query('SELECT id,kind,state,attempts,last_error,due_at FROM sales_jobs WHERE lead_id=$1 ORDER BY created_at DESC LIMIT 100', [leadId]),
  ])
  return { lead: (await withSyncState([lead]))[0], activities: activities.rows, submissions: submissions.rows, jobs: jobs.rows, contact_url: contactUrl(lead.ghl_contact_id), suggested_followup: suggestedFollowup(new Date(), leadId) }
}
export async function createSalesLead(input: { firstName: string; lastName: string; email: string; phone: string; practiceName: string; notes?: string; affiliateId?: string }) {
  const admin = await requireAdmin(), leadEmail = email(input.email), phone = phoneKey(safeText(input.phone, 32))
  if (!safeText(input.firstName)) throw new Error('First name is required')
  const attribution = await resolveQualifiedReferral({ email: leadEmail, phone, practiceName: safeText(input.practiceName), affiliateId: input.affiliateId ?? null })
  const result = await intake({ firstName: safeText(input.firstName), lastName: safeText(input.lastName), email: leadEmail, phone,
    practiceName: safeText(input.practiceName), source: input.affiliateId ? 'affiliate' : 'manual', sourcePath: '/admin/leads',
    context: { notes: safeText(input.notes, 10000), author: admin.name || admin.email }, affiliateId: attribution.affiliateId, dedupeKey: id() })
  if (result.review) throw new Error('Submission saved for identity review. Resolve it under Leads → Import before contacting.')
  if (input.notes?.trim()) await addSalesNote(result.id, input.notes)
  void runSalesWorker().catch(() => {})
  return result
}
export async function updateSalesLead(leadId: string, input: {
  revision: number; stage?: SalesStage; assigneeId?: string | null; firstName?: string; lastName?: string;
  email?: string; phone?: string; practiceName?: string; timezone?: string; consentEvidence?: string; nextFollowupAt?: string | null;
}) {
  const admin = await requireAdmin()
  if (input.stage && !SALES_STAGES.includes(input.stage)) throw new Error('Invalid stage')
  const assignment = input.assigneeId !== undefined ? await assignee(input.assigneeId) : undefined
  if (input.timezone !== undefined && !validTimezone(input.timezone)) throw new Error('Enter a verified IANA timezone, such as America/New_York')
  if (input.nextFollowupAt && (!Number.isFinite(Date.parse(input.nextFollowupAt)) || Date.parse(input.nextFollowupAt) <= Date.now() || !allowed(new Date(input.nextFollowupAt)))) throw new Error('Follow-up must be in the future, Monday–Friday 9 AM–5 PM Eastern')
  const mapping: Record<string, unknown> = {}
  for (const [key, val] of Object.entries({ first_name: input.firstName, last_name: input.lastName, practice_name: input.practiceName })) {
    if (val !== undefined) mapping[key] = safeText(val)
  }
  if (input.email !== undefined) mapping.email = email(input.email)
  if (input.phone !== undefined) mapping.phone = phoneKey(input.phone)
  if (input.stage) mapping.stage = input.stage
  if (assignment !== undefined) mapping.assignee_id = assignment
  if (input.nextFollowupAt !== undefined) mapping.next_followup_at = input.nextFollowupAt
  if (input.timezone) { mapping.timezone = input.timezone; mapping.timezone_origin = 'staff'; mapping.timezone_confirmed_at = new Date() }
  if (input.consentEvidence !== undefined && safeText(input.consentEvidence, 3000).length < 20) throw new Error('Record verifiable consent evidence, including date and source')
  await transaction(async c => {
    // Shared lock with dispatch and ingestion linearizes stops against a send's final eligibility check.
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`sales-send:${leadId}`])
    const lead = (await c.query('SELECT * FROM sales_leads WHERE id=$1 FOR UPDATE', [leadId])).rows[0]
    if (!lead) throw new Error('Lead not found')
    if (admin.role !== 'super_admin' && assignment !== undefined && assignment !== lead.assignee_id)
      throw new Error('Only a super admin can change lead ownership')
    if (lead.revision !== input.revision) {
      await c.query("UPDATE sales_leads SET sync_state='conflict',sync_error='Another update changed this lead; reload before saving' WHERE id=$1", [leadId])
      return { conflict: true }
    }
    if (input.consentEvidence) {
      if (lead.dnd) throw new Error('Opted-out contact cannot be re-enabled by editing consent. Establish consent through the provider first.')
      mapping.consent = true
      await activity(c, leadId, { kind: 'consent', body: input.consentEvidence, authorId: admin.userId, authorName: admin.name || admin.email })
    }
    const entries = Object.entries(mapping)
    if (entries.length) await c.query(`UPDATE sales_leads SET ${entries.map(([key], i) => `"${key}"=$${i + 2}`).join(',')},revision=revision+1,updated_at=now(),sync_state='pending',sync_error=NULL WHERE id=$1`, [leadId, ...entries.map(([, v]) => v)])
    await activity(c, leadId, { kind: 'edit', body: `Changed: ${entries.map(([k]) => k).join(', ')}`, authorId: admin.userId, authorName: admin.name || admin.email })
    if (input.stage && ['Engaged', 'Strategy Call Booked', 'Won', 'Not Now', 'Lost/Do Not Contact'].includes(input.stage)) await stop(c, leadId, 'paused_by_staff')
    if (input.stage === 'Lost/Do Not Contact') await c.query('UPDATE sales_leads SET dnd=true WHERE id=$1', [leadId])
    if (input.timezone && input.timezone !== lead.timezone) await c.query("UPDATE sales_jobs SET state='cancelled',last_error='Timezone changed',finished_at=now() WHERE lead_id=$1 AND kind='sms' AND state='pending'", [leadId])
    if (Object.prototype.hasOwnProperty.call(input, 'nextFollowupAt')) await stop(c, leadId, 'manual_followup')
    await enqueue(c, leadId, 'contact_sync', `edit:${leadId}:${lead.revision + 1}`)
    return { conflict: false }
  }).then(result => { if (result.conflict) throw new Error('Another update changed this lead. Reload before saving; your edit was not applied.') })
}
export async function addSalesNote(leadId: string, body: string) {
  const admin = await requireAdmin()
  if (!safeText(body, 10000)) throw new Error('Enter a note')
  await transaction(async c => {
    const a = await activity(c, leadId, { kind: 'note', body, authorId: admin.userId, authorName: admin.name || admin.email })
    await enqueue(c, leadId, 'note_sync', `note:${a.id}`, { activityId: a.id, body: `[Patient Pipeline ${a.id}] ${body.slice(0, 4500)}` })
    await c.query("UPDATE sales_leads SET sync_state='pending' WHERE id=$1", [leadId])
  })
}
export async function logSalesCall(leadId: string, input: { disposition: SalesDisposition; notes: string; nextFollowupAt?: string; confirmedSuggestedSlot?: boolean }) {
  const admin = await requireAdmin()
  if (!SALES_DISPOSITIONS.includes(input.disposition)) throw new Error('Select a disposition before logging a call')
  const terminal = ['Booked', 'Wrong Number', 'Do Not Contact'].includes(input.disposition)
  const next = input.nextFollowupAt || (input.confirmedSuggestedSlot ? suggestedFollowup(new Date(), leadId) : null)
  if (!terminal && !next) throw new Error('Choose a next follow-up or explicitly confirm the suggested slot')
  if (next && (!Number.isFinite(Date.parse(next)) || Date.parse(next) <= Date.now() || !allowed(new Date(next)))) throw new Error('Follow-up must be Monday–Friday 9 AM–5 PM Eastern, in the future')
  await transaction(async c => {
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`sales-send:${leadId}`])
    const lead = (await c.query('SELECT * FROM sales_leads WHERE id=$1 FOR UPDATE', [leadId])).rows[0]
    if (!lead) throw new Error('Lead not found')
    const stage = input.disposition === 'Booked' ? 'Strategy Call Booked' : ['Wrong Number', 'Do Not Contact'].includes(input.disposition) ? 'Lost/Do Not Contact' :
      input.disposition === 'Not Now' ? 'Not Now' : ['No Answer', 'Voicemail'].includes(input.disposition) ? 'Attempting Contact' : 'Follow-Up Scheduled'
    await c.query(`UPDATE sales_leads SET stage=$2,next_followup_at=$3,dnd=dnd OR $4,revision=revision+1,updated_at=now(),sync_state='pending' WHERE id=$1`,
      [leadId, stage, terminal ? null : next, ['Do Not Contact', 'Wrong Number'].includes(input.disposition)])
    const a = await activity(c, leadId, { kind: 'call', body: input.notes, disposition: input.disposition, nextFollowupAt: terminal ? undefined : next!, authorId: admin.userId, authorName: admin.name || admin.email })
    await enqueue(c, leadId, 'note_sync', `call-note:${a.id}`, { activityId: a.id, body: `[Patient Pipeline ${a.id}] Call outcome: ${input.disposition}\n${input.notes}\nNext follow-up: ${terminal ? 'none' : next}` })
    await enqueue(c, leadId, 'contact_sync', `call:${a.id}`)
    if (!['No Answer', 'Voicemail'].includes(input.disposition)) await stop(c, leadId, 'call_outcome')
    // Logging is a staff assertion, not a browser telephony event. Every call counts toward the shared daily cap.
    await c.query("UPDATE sales_jobs SET state='done',finished_at=now() WHERE lead_id=$1 AND kind='call_task' AND state='pending' AND due_at::date<=now()::date", [leadId])
  })
}
export async function saveSalesSettings(input: { defaultAssigneeId?: string; followupTexts?: string[]; laterDays?: number[]; approveTemplate?: boolean; reviewScope?: boolean; confirmSmsConfiguration?: boolean; enableAutomation?: boolean }) {
  const admin = await requireAdmin('super_admin')
  const assignment = input.defaultAssigneeId !== undefined ? await assignee(input.defaultAssigneeId) : undefined
  const texts = input.followupTexts !== undefined ? validateFollowupTexts(input.followupTexts) : undefined
  if (input.laterDays && (input.laterDays.length !== 6 || input.laterDays.some((n, i, a) => !Number.isInteger(n) || n < 5 || n >= 30 || (i > 0 && n <= a[i - 1]!)))) throw new Error('Choose six increasing elapsed calendar days between 5 and 29')
  await transaction(async c => {
    const cfg = await settings(c)
    await c.query("SELECT id FROM sales_settings WHERE id='internal' FOR UPDATE")
    const update: Record<string, unknown> = {}
    if (assignment !== undefined) update.default_assignee_id = assignment
    if (texts && JSON.stringify(texts) !== JSON.stringify(followupTexts(cfg))) { update.followup_texts = JSON.stringify(texts); update.approved_at = null; update.automation_enabled = false }
    if (input.laterDays) { update.later_days = JSON.stringify(input.laterDays); update.approved_at = null; update.automation_enabled = false }
    if (input.approveTemplate) update.approved_at = new Date()
    if (input.reviewScope) update.scope_reviewed_at = new Date()
    if (input.confirmSmsConfiguration) {
      if (!cfg.capabilities_checked_at) throw new Error('Run read-only capability checks before confirming SMS configuration')
      update.capabilities = JSON.stringify({ ...cfg.capabilities, sms_write: {
        state: 'operator_confirmed', requirement: 'Administrator confirmed conversations/message.write, SMS-enabled sender and A2P/consent configuration in the existing GoHighLevel location. No real send was tested.',
        confirmedAt: new Date().toISOString(), confirmedBy: admin.userId,
      } })
    }
    if (input.enableAutomation) {
      const caps = cfg.capabilities
      if (!schedulerHealthy(caps)) throw new Error('Wait for a healthy scheduled wake on the published app before enabling automation. The Supabase five-minute job must be active.')
      if (!(assignment ?? cfg.default_assignee_id) || !(update.approved_at ?? cfg.approved_at) || !(update.scope_reviewed_at ?? cfg.scope_reviewed_at)) throw new Error('Review the default assignee, follow-up texts, and eligible new-lead scope first')
      // No read-only probe can prove SMS write permission, number/A2P configuration, or delivery.
      // Do not let a checkbox bypass missing verification; operator review is explicit and auditable.
      if (!['verified', 'operator_confirmed'].includes(caps.sms_write?.state)) throw new Error('Confirm the existing GoHighLevel conversations/message.write permission, SMS-enabled number, and A2P configuration before enabling. No real send was authorized.')
      for (const key of ['contacts', 'conversations', 'messages', 'notes', 'appointments']) if (caps[key]?.state !== 'verified') throw new Error(`Verify GoHighLevel ${key} capability first`)
      if (!cfg.capabilities_checked_at || Date.now() - new Date(cfg.capabilities_checked_at).getTime() > 86400000) throw new Error('Recheck capabilities before enabling')
      update.enabled_at = new Date(); update.automation_enabled = true
    } else if (input.enableAutomation === false) update.automation_enabled = false
    const entries = Object.entries(update)
    if (entries.length) await c.query(`UPDATE sales_settings SET ${entries.map(([k], i) => `"${k}"=$${i + 1}`).join(',')} WHERE id='internal'`, entries.map(([, v]) => v))
    if (update.automation_enabled === false) await c.query("UPDATE sales_jobs SET state='cancelled',last_error='Automation disabled' WHERE kind='sms' AND state='pending'")
  })
}
export async function saveSalesReplyPreference(enabled: boolean) {
  const admin = await requireAdmin()
  if (typeof enabled !== 'boolean') throw new Error('Invalid preference')
  await pool.query('INSERT INTO sales_preferences(admin_id,reply_notifications) VALUES($1,$2) ON CONFLICT(admin_id) DO UPDATE SET reply_notifications=$2', [admin.userId, enabled])
}
export async function verifySalesCapabilities() {
  await requireAdmin('super_admin')
  await settings()
  const result = await verifyCapabilities()
  await pool.query("UPDATE sales_settings SET capabilities=capabilities||$1::jsonb,capabilities_checked_at=now() WHERE id='internal'", [JSON.stringify(result)])
}
/** A narrowed provider text query, never empty/all/* or an unreviewed whole-account import. */
export async function previewSalesImport(scope: string) {
  const admin = await requireAdmin('super_admin')
  scope = safeText(scope, 100).replace(/^query:/i, '').trim()
  if (scope.length < 3 || /^(all|\*|tag:)/i.test(scope)) throw new Error('Enter a narrowed name/email/phone query (at least 3 characters). Tag searches are not verified for this API.')
  const page = await contactPage(scope, {}, 10)
  if (page.total > 1000) throw new Error('More than 1,000 matches: narrow the query before reviewing import')
  const previewId = id(), expiresAt = new Date(Date.now() + 30 * 60000)
  const sample = page.contacts.map((c: any) => ({ id: c.id, name: [c.firstName, c.lastName].filter(Boolean).join(' '), source: c.source ?? '', dateAdded: c.dateAdded ?? null }))
  await pool.query('INSERT INTO sales_imports(id,scope,total,sample,actor_id,expires_at) VALUES($1,$2,$3,$4,$5,$6)', [previewId, scope, page.total, JSON.stringify(sample), admin.userId, expiresAt])
  return { total: page.total, sample, scope, preview_id: previewId, expires_at: expiresAt.toISOString() }
}
export async function startSalesImport(previewId: string) {
  await requireAdmin('super_admin')
  const job = (await pool.query("UPDATE sales_imports SET state='pending' WHERE id=$1 AND state='preview' AND expires_at>now() RETURNING *", [previewId])).rows[0]
  if (!job) throw new Error('Preview expired or already started; preview the scope again')
  void runSalesWorker().catch(() => {})
  return { id: previewId }
}
export async function getSalesImport(importId?: string) {
  await requireAdmin('super_admin')
  const row = (await pool.query("SELECT * FROM sales_imports WHERE state<>'preview' AND ($1::text IS NULL OR id=$1) ORDER BY created_at DESC LIMIT 1", [importId ?? null])).rows[0]
  const reviews = (await pool.query("SELECT * FROM sales_merge_reviews WHERE state='pending' ORDER BY created_at LIMIT 100")).rows.map(r => ({ ...r, name: `${r.submission.firstName} ${r.submission.lastName}`, email: r.submission.email }))
  return row ? { ...row, error: row.last_error, reviews } : { state: 'not_started', reviews }
}
export async function resumeSalesImport(importId: string) {
  await requireAdmin('super_admin')
  await pool.query("UPDATE sales_imports SET state='pending',last_error=NULL,claimed_at=NULL WHERE id=$1 AND (state='failed' OR (state='running' AND claimed_at<now()-interval '5 minutes'))", [importId])
  void runSalesWorker().catch(() => {})
}
export async function resolveSalesMerge(reviewId: string, leadId: string | null) {
  await requireAdmin('super_admin')
  const review = (await pool.query("SELECT * FROM sales_merge_reviews WHERE id=$1 AND state='pending'", [reviewId])).rows[0]
  if (!review) throw new Error('Review was already resolved')
  if (leadId && !review.candidates.some((c: any) => c.id === leadId)) throw new Error('Choose a listed candidate')
  await intake(review.submission as Intake, leadId)
  await pool.query("UPDATE sales_merge_reviews SET state='resolved',resolved_at=now() WHERE id=$1", [reviewId])
}
export async function convertSalesLead(leadId: string) {
  await requireAdmin()
  const lead = (await pool.query('SELECT * FROM sales_leads WHERE id=$1', [leadId])).rows[0]
  if (!lead) throw new Error('Lead not found')
  if (lead.customer_id) return { customerId: lead.customer_id, enrollmentUrl: `/admin/customers/${encodeURIComponent(lead.customer_id)}` }
  if (lead.stage === 'Lost/Do Not Contact') throw new Error('This lead is closed to enrollment')
  return { customerId: '', enrollmentUrl: `/admin/payments?lead=${encodeURIComponent(leadId)}` }
}
export async function retrySalesSync(leadId: string) {
  await requireAdmin()
  await transaction(async c => {
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`sales-send:${leadId}`])
    const uncertain = (await c.query("SELECT id FROM sales_jobs WHERE lead_id=$1 AND state='uncertain' AND kind IN ('contact_sync','note_sync')", [leadId])).rows
    if (uncertain.length) throw new Error('A note may already exist in GoHighLevel. Reconciliation must confirm it before retrying.')
    await c.query("UPDATE sales_jobs SET state='pending',due_at=now(),attempts=0,last_error=NULL WHERE lead_id=$1 AND state='failed' AND kind IN ('contact_sync','note_sync')", [leadId])
    await enqueue(c, leadId, 'contact_sync', `retry:${id()}`)
    await c.query("UPDATE sales_leads SET sync_state='pending',sync_error=NULL WHERE id=$1", [leadId])
  })
  void runSalesWorker().catch(() => {})
}
export async function salesCadencePreview(timezone: string) {
  await requireAdmin()
  if (!validTimezone(timezone)) throw new Error('Enter a verified IANA timezone')
  return assignTextNumbers(cadence(new Date(), timezone, 'preview', (await settings()).later_days))
}
export async function getSalesMedia(leadId: string, activityId: string) {
  await requireAdmin('super_admin')
  const row = (await pool.query('SELECT l.ghl_contact_id,a.kind,a.status FROM sales_leads l JOIN sales_activities a ON a.lead_id=l.id WHERE l.id=$1 AND a.id=$2', [leadId, activityId])).rows[0]
  if (!row) throw new Error('Call activity not found')
  return { state: row.status === 'pending' ? 'pending' : row.ghl_contact_id ? 'authenticated_link' : 'unavailable',
    contactUrl: contactUrl(row.ghl_contact_id),
    explanation: 'Open the authenticated GoHighLevel contact to access existing call recordings and transcriptions. The provider controls pending, unavailable, expired and permission states. No recording is enabled here.' }
}
