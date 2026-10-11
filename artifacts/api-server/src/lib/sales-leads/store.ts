import { randomUUID } from 'node:crypto'
import { pool, type PoolClient } from '@workspace/db'
import { validTimezone } from './cadence'
import { nudgeSalesSync } from './dispatch'
const syncTransactions = new WeakSet<PoolClient>()
export const id = () => randomUUID()
export const emailKey = (s: string) => s.trim().toLowerCase()
export function phoneKey(s: string) {
  const digits = s.replace(/\D/g, '')
  if (!digits) return ''
  if (digits.length === 10) return `+1${digits}`
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`
  throw new Error('Enter a valid phone with country code')
}
export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect()
  let committed = false
  try { await c.query('BEGIN'); const value = await fn(c); await c.query('COMMIT'); committed = true; return value }
  catch (e) { await c.query('ROLLBACK'); throw e } finally {
    const sync = syncTransactions.delete(c)
    c.release()
    if (committed && sync) nudgeSalesSync()
  }
}
export async function settings(client: Pick<PoolClient, 'query'> = pool) {
  await client.query("INSERT INTO sales_settings(id) VALUES('internal') ON CONFLICT DO NOTHING")
  return (await client.query("SELECT * FROM sales_settings WHERE id='internal'" + ('release' in client ? ' FOR UPDATE' : ''))).rows[0]
}
export async function activity(c: PoolClient, leadId: string, input: {
  kind: string; body?: string; authorId?: string; authorName?: string; disposition?: string; nextFollowupAt?: string;
  providerId?: string; status?: string; occurredAt?: string; dedupeKey?: string;
}) {
  const activityId = id()
  const row = (await c.query(`INSERT INTO sales_activities(id,lead_id,kind,body,author_id,author_name,disposition,next_followup_at,provider_id,status,occurred_at,dedupe_key)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,COALESCE($11::timestamptz,now()),$12)
    ON CONFLICT(dedupe_key) DO UPDATE SET status=CASE
      WHEN sales_activities.kind IN ('inbound_sms','outbound_sms') AND (
        lower(sales_activities.status) IN ('delivered','received','read','failed','undelivered') OR
        (lower(sales_activities.status)='sent' AND lower(EXCLUDED.status) IN ('accepted','pending','queued','sending','')) OR
        lower(EXCLUDED.status) NOT IN ('accepted','pending','queued','sending','sent','delivered','received','read','failed','undelivered'))
        THEN sales_activities.status
      ELSE COALESCE(EXCLUDED.status,sales_activities.status) END
    WHERE sales_activities.lead_id=EXCLUDED.lead_id AND sales_activities.kind=EXCLUDED.kind
    RETURNING *, (xmax=0) AS inserted`, [activityId, leadId, input.kind, input.body?.slice(0, 10000) ?? '', input.authorId ?? null,
    input.authorName ?? null, input.disposition ?? null, input.nextFollowupAt ?? null, input.providerId ?? null, input.status ?? null,
    input.occurredAt ?? null, input.dedupeKey ?? activityId])).rows[0]
  return row
}
export async function enqueue(c: PoolClient, leadId: string | null, kind: string, dedupe: string, payload: unknown = {}, dueAt?: string) {
  if (kind === 'contact_sync' || kind === 'note_sync') syncTransactions.add(c)
  await c.query(`INSERT INTO sales_jobs(id,lead_id,kind,dedupe_key,payload,due_at) VALUES($1,$2,$3,$4,$5,COALESCE($6::timestamptz,now()))
    ON CONFLICT(dedupe_key) DO UPDATE SET state='pending',due_at=EXCLUDED.due_at,last_error=NULL,finished_at=NULL,claimed_at=NULL
    WHERE sales_jobs.kind='sms' AND sales_jobs.state='cancelled' AND sales_jobs.last_error='Timezone changed' AND EXCLUDED.due_at>now()`,
    [id(), leadId, kind, dedupe, JSON.stringify(payload), dueAt ?? null])
}
export async function stop(c: PoolClient, leadId: string, reason: string) {
  await c.query("UPDATE sales_leads SET automation_state=$2 WHERE id=$1", [leadId, reason])
  await c.query("UPDATE sales_jobs SET state='cancelled',last_error=$2,finished_at=now() WHERE lead_id=$1 AND kind IN ('sms','call_task') AND state='pending'", [leadId, reason])
}
/** A live inquiry can reuse an older lead's phone (often a shared office line) with
 * a different email. That newer lead keeps its own GoHighLevel contact without the
 * phone, so it never takes over the other contact, and automated texts are skipped. */
export async function sharesOlderPhone(c: Pick<PoolClient, 'query'>, lead: { id: string; phone: string; email: string; created_at: Date | string }) {
  if (!lead.phone) return false
  return (await c.query(`SELECT EXISTS(SELECT 1 FROM sales_leads o WHERE o.id<>$1 AND o.phone=$2 AND o.email IS DISTINCT FROM $3
    AND (o.created_at<$4::timestamptz OR (o.created_at=$4::timestamptz AND o.id<$1))) AS shared`,
    [lead.id, lead.phone, lead.email, lead.created_at])).rows[0].shared === true
}
export interface Intake {
  noteBody?: string;
  firstName: string; lastName: string; email: string; phone: string; practiceName: string; source: string; sourcePath: string;
  context: Record<string, unknown>; consentEvidence?: Record<string, unknown>; consent?: boolean; timezone?: string | null;
  affiliateId?: string | null; historical?: boolean; providerId?: string; submittedAt?: string; dedupeKey: string;
}
/** Identity is serialized across all ingestion workers; shared office phones are never blindly merged. */
export async function intake(input: Intake, forceLeadId?: string | null): Promise<{ id: string; review?: boolean }> {
  const email = emailKey(input.email), phone = phoneKey(input.phone)
  return transaction(async c => {
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended('sales-intake',0))")
    const existingSubmission = (await c.query('SELECT lead_id FROM sales_submissions WHERE dedupe_key=$1', [input.dedupeKey])).rows[0]
    if (existingSubmission) return { id: existingSubmission.lead_id }
    const matches = (await c.query(`SELECT * FROM sales_leads WHERE ($1<>'' AND email=$1) OR ($2<>'' AND phone=$2) OR ($3::text IS NOT NULL AND ghl_contact_id=$3) FOR UPDATE`, [email, phone, input.providerId ?? null])).rows
    const exactProvider = matches.find(l => l.ghl_contact_id && l.ghl_contact_id === input.providerId)
    const exactEmail = matches.filter(l => email && l.email === email)
    const ambiguous = !exactProvider && (matches.length > 1 || (matches.length === 1 && email && matches[0].email && email !== matches[0].email))
    // Live visitors must be able to book right away. A matching email is the same
    // person; a phone-only match with a different email becomes its own lead.
    // Imports and multi-email conflicts still go to staff review.
    const separate = forceLeadId === undefined && ambiguous && !input.historical && exactEmail.length === 0
    const byEmail = forceLeadId === undefined && ambiguous && !input.historical && exactEmail.length === 1
    if (forceLeadId === undefined && ambiguous && !separate && !byEmail) {
      const reviewId = id()
      await c.query(`INSERT INTO sales_merge_reviews(id,dedupe_key,candidates,submission) VALUES($1,$2,$3,$4) ON CONFLICT(dedupe_key) DO NOTHING`,
        [reviewId, input.dedupeKey, JSON.stringify(matches.map(l => ({ id: l.id, name: `${l.first_name} ${l.last_name}`, email: l.email, phone: l.phone }))), JSON.stringify(input)])
      return { id: reviewId, review: true }
    }
    let lead = forceLeadId ? (await c.query('SELECT * FROM sales_leads WHERE id=$1 FOR UPDATE', [forceLeadId])).rows[0] :
      forceLeadId === null || separate ? null : exactProvider ?? exactEmail[0] ?? matches[0]
    if (forceLeadId && !lead) throw new Error('Selected lead no longer exists')
    if (!lead) {
      const cfg = await settings(c)
      const zone = validTimezone(input.timezone) ? input.timezone : null
      lead = (await c.query(`INSERT INTO sales_leads(id,first_name,last_name,email,phone,practice_name,source,affiliate_id,assignee_id,
        ghl_contact_id,consent,timezone,timezone_origin,timezone_confirmed_at,historical,created_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,COALESCE($16::timestamptz,now())) RETURNING *`,
      [id(), input.firstName.slice(0, 120), input.lastName.slice(0, 120), email, phone, input.practiceName.slice(0, 200),
        input.source, input.affiliateId ?? null, cfg.default_assignee_id, input.providerId ?? null, Boolean(input.consent && !input.historical),
        zone, zone ? input.historical ? 'provider' : 'browser' : null, zone ? new Date() : null, Boolean(input.historical), input.submittedAt ?? null])).rows[0]
    } else {
      // Do not replace staff-owned fields from repeated submissions or imported stale provider records.
      await c.query(`UPDATE sales_leads SET affiliate_id=COALESCE($2,affiliate_id),ghl_contact_id=COALESCE(ghl_contact_id,$3),
        consent=consent OR $4,timezone=COALESCE($5,timezone),timezone_origin=CASE WHEN $5 IS NOT NULL THEN 'browser' ELSE timezone_origin END,
        timezone_confirmed_at=CASE WHEN $5 IS NOT NULL THEN now() ELSE timezone_confirmed_at END,updated_at=now(),revision=revision+1 WHERE id=$1`,
        [lead.id, input.affiliateId ?? null, input.providerId ?? null, Boolean(input.consent && !input.historical),
          !input.historical && validTimezone(input.timezone) ? input.timezone : null])
    }
    await c.query(`INSERT INTO sales_submissions(id,lead_id,source,source_path,submitted_at,context,consent_evidence,historical,dedupe_key)
      VALUES($1,$2,$3,$4,COALESCE($5::timestamptz,now()),$6,$7,$8,$9) ON CONFLICT(dedupe_key) DO NOTHING`,
      [id(), lead.id, input.source, input.sourcePath, input.submittedAt ?? null, JSON.stringify(input.context),
        JSON.stringify(input.consentEvidence ?? {}), Boolean(input.historical), input.dedupeKey])
    await activity(c, lead.id, { kind: 'submission', body: `${input.source}: ${input.sourcePath}`, dedupeKey: `submission:${input.dedupeKey}`, occurredAt: input.submittedAt })
    if (separate) await activity(c, lead.id, { kind: 'note', dedupeKey: `shared-phone:${input.dedupeKey}`,
      body: `Possible duplicate: this inquiry uses the same phone as ${matches.map(l => `${l.first_name} ${l.last_name}`.trim() || 'another lead').join(', ')} but a different email. It was kept as a separate lead so the visitor could book. Its GoHighLevel contact has no phone, and automated texts are skipped. Merge them if they are the same person.` })
    if (!input.historical) await enqueue(c, lead.id, 'contact_sync', `intake:${input.dedupeKey}`, {
      ...(input.context.legacySourcePath ? { healthcare: {
        postalCode: input.context.zip, city: input.context.city, state: input.context.state,
        interest: input.context.productInterest,
      } } : {}),
    })
    if (!input.historical) {
      const noteId = id()
      await enqueue(c, lead.id, 'note_sync', `submission-note:${input.dedupeKey}`, {
        activityId: noteId,
        body: `[Patient Pipeline ${noteId}] Inquiry ${input.submittedAt ?? new Date().toISOString()} from ${input.sourcePath}\n${input.noteBody ?? JSON.stringify(input.context).slice(0, 4000)}\nConsent: ${JSON.stringify(input.consentEvidence ?? {}).slice(0, 600)}`,
      })
    }
    if (!input.historical && validTimezone(input.timezone) && input.timezone !== lead.timezone) {
      // An updated verified browser timezone invalidates existing SMS slots; planner recalculates only an active sequence.
      await c.query("UPDATE sales_jobs SET state='cancelled',last_error='Timezone changed',finished_at=now() WHERE lead_id=$1 AND kind='sms' AND state='pending'", [lead.id])
    }
    return { id: lead.id }
  })
}
