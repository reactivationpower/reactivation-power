import { pool } from '@workspace/db'
import { sendEmail } from '@/lib/mail/send'
import { getAdminUserById } from '@/lib/data/admin-users'
import { activity, enqueue, id, intake, phoneKey, settings, stop, transaction } from './store'
import { allowed, cadence, canAutomate, elapsedDays } from './cadence'
import { schedulerHealthy } from './wake'
import { contact, contactPage, locationId, notes, provider, safeSalesUpsert, SalesProviderError } from './provider'
import { ingestProviderFacts, providerContext, providerDnd, reconcileLead } from './ingestion'
import { salesTiming } from './timing'
function importPhone(value: unknown): string {
  try { return phoneKey(String(value ?? '')) } catch { return '' } // original value remains in submission context for staff review
}

/** An expired dispatch is uncertain, never blindly retried: provider SMS has no
 * documented idempotency guarantee. Reconcile provider facts before resolution. */
export async function recoverClaims() {
  await pool.query(`UPDATE sales_jobs SET state=CASE WHEN kind IN ('sms','reply_email','note_sync','contact_sync') THEN 'uncertain' ELSE 'pending' END,
    last_error='Worker stopped after claiming; inspect provider before retry',claimed_at=NULL
    WHERE state='sending' AND claimed_at<now()-interval '5 minutes'`)
  await pool.query("UPDATE sales_imports SET state='pending',claimed_at=NULL WHERE state='running' AND claimed_at<now()-interval '5 minutes'")
}
export async function importSalesPage() {
  const job = await transaction(async c => (await c.query(`UPDATE sales_imports SET state='running',claimed_at=now()
    WHERE id=(SELECT id FROM sales_imports WHERE state='pending' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`)).rows[0])
  if (!job) return
  try {
    const page = await contactPage(job.scope, job.cursor)
    if (page.total > 1000 || page.total > job.total) throw new Error('Import scope expanded after review; create a new preview before continuing')
    for (const remote of page.contacts) {
      const result = await intake({
        firstName: remote.firstName ?? '', lastName: remote.lastName ?? '', email: remote.email ?? '', phone: importPhone(remote.phone),
        practiceName: remote.companyName ?? '', source: 'gohighlevel', sourcePath: 'GoHighLevel historical import',
        context: { ...providerContext(remote), importScope: job.scope },
        timezone: remote.timezone, providerId: remote.id, historical: true, submittedAt: remote.dateAdded,
        dedupeKey: `ghl-import:${remote.id}`,
      })
      if (!result.review) await ingestProviderFacts(result.id, remote, [])
    }
    const seenIds = [...new Set([...(job.cursor?.seenIds ?? []), ...page.contacts.map((row: any) => row.id)])]
    await pool.query("UPDATE sales_imports SET cursor=$2,imported=$3,state=$4,claimed_at=NULL,last_error=NULL WHERE id=$1",
      [job.id, JSON.stringify({ ...(page.cursor ?? {}), seenIds }), seenIds.length, page.cursor ? 'pending' : 'done'])
  } catch {
    await pool.query("UPDATE sales_imports SET state='failed',last_error='Import paused. Check contacts.readonly, provider availability, and contact format; resume from saved page.',claimed_at=NULL WHERE id=$1", [job.id])
  }
}
async function plan() {
  const cfg = await settings()
  if (!cfg.automation_enabled || !cfg.enabled_at || !schedulerHealthy(cfg.capabilities)) return
  const rows = (await pool.query(`SELECT * FROM sales_leads WHERE historical=false AND created_at>=$1 AND created_at>now()-interval '31 days'
    AND automation_state IN ('manual','active') AND source IN ('website','affiliate')
    ORDER BY updated_at LIMIT 200`, [cfg.enabled_at])).rows
  for (const lead of rows) {
    await transaction(async c => {
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`sales-send:${lead.id}`])
      const fresh = (await c.query('SELECT * FROM sales_leads WHERE id=$1 FOR UPDATE', [lead.id])).rows[0]
      if (!canAutomate(fresh) || elapsedDays(new Date(fresh.created_at), new Date()) >= 30) { await stop(c, lead.id, 'ineligible'); return }
      const slots = cadence(new Date(fresh.created_at), fresh.timezone, fresh.id, cfg.later_days)
      for (const slot of slots) {
        if (Date.parse(slot.dueAt) < Date.now() - 5 * 60000) continue // never replay overdue touches as a burst
        await enqueue(c, fresh.id, slot.kind, `cadence:${fresh.id}:${slot.kind}:${slot.day}:${fresh.timezone}`, { day: slot.day, template: cfg.template }, slot.dueAt)
      }
      await c.query("UPDATE sales_leads SET automation_state='active',updated_at=now() WHERE id=$1", [lead.id])
    })
  }
}
export async function claimSalesJob(syncOnly = false) {
  return transaction(async c => {
    // Serialize the brief selection, not provider work, across all instances.
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended('sales-job-claim',0))")
    return (await c.query(`UPDATE sales_jobs SET state='sending',claimed_at=now(),attempts=attempts+1
    WHERE id=(SELECT j.id FROM sales_jobs j WHERE j.state='pending' AND j.due_at<=now()
      AND NOT EXISTS (SELECT 1 FROM sales_settings WHERE id='internal'
        AND (capabilities->'sync_rate_limit'->>'until')::timestamptz>now())
      AND ($1=false OR j.kind IN ('contact_sync','note_sync'))
      AND NOT EXISTS (SELECT 1 FROM sales_jobs b WHERE b.lead_id=j.lead_id AND b.state='sending')
      AND (j.kind NOT IN ('contact_sync','note_sync') OR NOT EXISTS
        (SELECT 1 FROM sales_jobs b WHERE b.lead_id=j.lead_id AND b.kind='contact_sync' AND b.state='uncertain'))
      AND (j.kind<>'note_sync' OR NOT EXISTS
        (SELECT 1 FROM sales_jobs b WHERE b.lead_id=j.lead_id AND b.kind='contact_sync' AND b.state IN ('pending','sending','failed','uncertain')))
      ORDER BY COALESCE((SELECT max(b.claimed_at) FROM sales_jobs b WHERE b.lead_id=j.lead_id),'-infinity'::timestamptz),
        j.due_at,j.created_at,j.id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`, [syncOnly])).rows[0]
  })
}
export async function drainSalesSync() {
  for (let i = 0; i < 10; i++) {
    const job = await claimSalesJob(true)
    if (!job) return false
    await processSalesJob(job)
  }
  return true
}
async function synchronize(job: any) {
  const original = (await pool.query('SELECT * FROM sales_leads WHERE id=$1', [job.lead_id])).rows[0]
  if (!original) throw new Error('Lead not found')
  const remote = original.ghl_contact_id ? await contact(original.ghl_contact_id) : null
  if (remote) await ingestProviderFacts(original.id, remote, [])
  await transaction(async c => {
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`sales-send:${job.lead_id}`])
    const lead = (await c.query('SELECT * FROM sales_leads WHERE id=$1 FOR UPDATE', [job.lead_id])).rows[0]
    if (job.kind === 'note_sync') {
      if (!lead.ghl_contact_id) throw new Error('Contact sync must finish before notes')
      const existing = await notes(lead.ghl_contact_id)
      const marker = `[Patient Pipeline ${job.payload.activityId}]`
      if (!existing.some((n: any) => String(n.body).includes(marker))) {
        const body = String(job.payload.body).includes(marker) ? job.payload.body : `${marker}\n${job.payload.body}`
        await provider(`/contacts/${encodeURIComponent(lead.ghl_contact_id)}/notes`, 'POST', { body })
      }
      return
    }
    const tags = [...new Set([...(remote?.tags ?? []).filter((t: string) => !t.startsWith('pp-sales-stage:')), `pp-sales-stage:${lead.stage}`, 'patient-pipeline-sales-lead'])]
    const healthcare = job.payload?.healthcare
    if (healthcare) tags.push('reactivation-power-lead', 'healthcare-funnel',
      ...(['reactivation','lead-follow-up','both'].includes(healthcare.interest) ? [`interest-${healthcare.interest}`] : []))
    const body = { firstName: lead.first_name, lastName: lead.last_name, email: lead.email, phone: lead.phone,
      ...(healthcare ? { postalCode:healthcare.postalCode, city:healthcare.city, state:healthcare.state } : {}),
      companyName: lead.practice_name, ...(lead.timezone && ['browser','staff'].includes(lead.timezone_origin) ? { timezone: lead.timezone } : {}), tags }
    let contactId = lead.ghl_contact_id
    if (contactId) await provider(`/contacts/${encodeURIComponent(contactId)}`, 'PUT', { ...body, ...(lead.dnd ? { dnd:true } : {}) })
    else contactId = await safeSalesUpsert({ ...body, source:'Patient Pipeline internal sales' })
    await c.query("UPDATE sales_leads SET ghl_contact_id=$2,reconcile_at=now() WHERE id=$1", [lead.id, contactId])
  })
}
async function sendReplyEmail(job: any) {
  if (Date.now() - new Date(job.created_at).getTime() > 23 * 3600000) throw new Error('Reply notification expired: provider idempotency window must not be exceeded')
  const user = await getAdminUserById(job.payload.assigneeId)
  const pref = (await pool.query('SELECT reply_notifications FROM sales_preferences WHERE admin_id=$1', [job.payload.assigneeId])).rows[0]
  if (!user?.active || pref?.reply_notifications === false) return
  const lead = (await pool.query('SELECT * FROM sales_leads WHERE id=$1', [job.lead_id])).rows[0]
  const result = await sendEmail('sales_lead_reply', user.email, {
    name: user.name ?? 'Team', leadName: `${lead.first_name} ${lead.last_name}`.trim(),
    leadUrl: `https://patientpipeline.app/admin/leads/${encodeURIComponent(lead.id)}`,
  }, { idempotencyKey: `sales-reply-${job.id}`, metadata: { salesLeadId: lead.id, activityId: job.payload.activityId } })
  if (!result.ok) {
    if (result.uncertain) throw new SalesProviderError(0, true)
    throw new Error('Reply notification email failed; check email delivery log')
  }
}
async function dispatchSms(job: any) {
  // Fetch fresh opt-outs, appointments, and replies immediately before reserving a send.
  await reconcileLead(job.lead_id)
  await transaction(async c => {
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`sales-send:${job.lead_id}`])
    const lead = (await c.query('SELECT * FROM sales_leads WHERE id=$1 FOR UPDATE', [job.lead_id])).rows[0]
    const cfg = await settings(c)
    // An enrollment created through another admin screen is still a customer,
    // even if nobody used this CRM's conversion button.
    const customers = lead.email ? (await c.query('SELECT id FROM customers WHERE lower(trim(email))=$1 LIMIT 2',[lead.email])).rows : []
    if (customers.length) {
      if (customers.length === 1) await c.query("UPDATE sales_leads SET customer_id=$2,stage='Won',revision=revision+1 WHERE id=$1",[lead.id,customers[0].id])
      await stop(c,lead.id,customers.length === 1 ? 'converted' : 'customer_identity_review')
      await c.query("UPDATE sales_jobs SET state='cancelled',finished_at=now(),last_error='Customer enrollment exists; automated sales outreach stopped' WHERE id=$1",[job.id])
      return
    }
    const touches = (await c.query(`SELECT count(DISTINCT COALESCE(provider_id,id)) FROM sales_activities WHERE lead_id=$1 AND kind IN ('call','provider_call','outbound_sms','sms_dispatch')
      AND (occurred_at AT TIME ZONE 'America/New_York')::date=(now() AT TIME ZONE 'America/New_York')::date`, [lead.id])).rows[0]
    if (!cfg.automation_enabled || !schedulerHealthy(cfg.capabilities) || !['verified','operator_confirmed'].includes(cfg.capabilities.sms_write?.state) || !canAutomate(lead) || lead.automation_state !== 'active' || !lead.ghl_contact_id ||
      elapsedDays(new Date(lead.created_at), new Date()) >= 30 || !allowed(new Date(), lead.timezone) ||
      Date.now() - new Date(job.due_at).getTime() > 5 * 60000 || Number(touches.count) >= 2) {
      await c.query("UPDATE sales_jobs SET state='cancelled',finished_at=now(),last_error='Eligibility, daily cap, or permitted send window changed' WHERE id=$1", [job.id])
      return
    }
    await activity(c, lead.id, { kind: 'sms_dispatch', status: 'dispatching', body: 'Approved automated follow-up', dedupeKey: `sms-dispatch:${job.id}` })
    // Hold row/advisory lock through dispatch. Local stop cannot pass a completed
    // final eligibility check and then race ahead of the provider request.
    try {
      const result = await provider('/conversations/messages', 'POST', {
        type: 'SMS', contactId: lead.ghl_contact_id,
        message: String(cfg.template).replaceAll('{firstName}', lead.first_name), status: 'pending',
      })
      if (!result.messageId) throw new SalesProviderError(0, true)
      await c.query("UPDATE sales_activities SET provider_id=$2,status='accepted' WHERE dedupe_key=$1", [`sms-dispatch:${job.id}`, result.messageId])
      await c.query("UPDATE sales_jobs SET state='done',finished_at=now(),payload=payload || $2::jsonb WHERE id=$1", [job.id, JSON.stringify({ messageId: result.messageId })])
    } catch (error) {
      if (!(error instanceof SalesProviderError && error.uncertain)) throw error
      // Keep the daily reservation when acceptance is uncertain; no retry.
      await c.query("UPDATE sales_activities SET status='uncertain' WHERE dedupe_key=$1", [`sms-dispatch:${job.id}`])
      await c.query("UPDATE sales_jobs SET state='uncertain',last_error='Provider acceptance uncertain; no automatic retry',finished_at=now() WHERE id=$1", [job.id])
    }
  })
}
export async function processSalesJob(job: any) {
  return salesTiming.run({ providerMs: 0, providerRequests: 0 }, () => processJob(job))
}
async function processJob(job: any) {
  const started = Date.now()
  try {
    // Disposable browser fixtures can exercise local persistence without ever
    // reaching real contacts, emails, or messaging. Intake cannot choose this source.
    if (job.lead_id) {
      const row = (await pool.query('SELECT source FROM sales_leads WHERE id=$1', [job.lead_id])).rows[0]
      if (row?.source === 'test_fixture') {
        await pool.query("UPDATE sales_jobs SET state='cancelled',finished_at=now(),last_error='Test fixture: external delivery blocked' WHERE id=$1", [job.id])
        return
      }
    }
    if (job.kind === 'sms') { await dispatchSms(job); return }
    if (job.kind === 'call_task') {
      await pool.query(`UPDATE sales_leads SET next_followup_at=$2 WHERE id=$1 AND next_followup_at IS NULL AND automation_state='active'`, [job.lead_id, job.due_at])
    } else if (job.kind === 'reply_email') await sendReplyEmail(job)
    else await synchronize(job)
    await pool.query("UPDATE sales_jobs SET state='done',finished_at=now(),last_error=NULL WHERE id=$1", [job.id])
  } catch (e) {
    const uncertain = e instanceof SalesProviderError && e.uncertain
    const state = uncertain ? 'uncertain' : job.attempts >= 5 ? 'failed' : 'pending'
    const error = uncertain ? 'Provider response uncertain. Do not retry until reconciled.' : e instanceof SalesProviderError ? e.message : 'Sync unavailable. Check provider permissions and contact identity before retrying.'
    await pool.query("UPDATE sales_jobs SET state=$2,last_error=$3,due_at=now()+($4 * interval '1 minute'),claimed_at=NULL WHERE id=$1", [job.id, state, error, Math.min(60, 2 ** job.attempts)])
    if (e instanceof SalesProviderError && e.status === 429) {
      const seconds = Math.max(60, e.retryAfterSeconds)
      await pool.query(`UPDATE sales_settings SET capabilities=jsonb_set(capabilities,'{sync_rate_limit}',
        jsonb_build_object('until',GREATEST(now()+($1 * interval '1 second'),
          COALESCE((capabilities->'sync_rate_limit'->>'until')::timestamptz,now())))) WHERE id='internal'`, [seconds])
    }
    if (job.lead_id && ['note_sync', 'contact_sync'].includes(job.kind)) await pool.query("UPDATE sales_leads SET sync_state='failed',sync_error=$2 WHERE id=$1", [job.lead_id, error])
  } finally {
    console.info(JSON.stringify({ event:'sales_job_complete', kind:job.kind,
      queueAgeMs: Math.max(0, started - new Date(job.created_at).getTime()),
      dueWaitMs: Math.max(0, started - new Date(job.due_at).getTime()),
      processingMs: Date.now() - started, ...salesTiming.getStore() }))
  }
}
async function boundedReconciliation() {
  // Claim local contacts before network work, distribute work across instances,
  // and back off individual failures. No full-location sweep every 20 seconds.
  const rows = await transaction(async c => (await c.query(`UPDATE sales_leads SET reconcile_at=now()+interval '10 minutes'
    WHERE id IN (SELECT id FROM sales_leads WHERE source<>'test_fixture' AND ghl_contact_id IS NOT NULL AND reconcile_at<=now()
      ORDER BY reconcile_at FOR UPDATE SKIP LOCKED LIMIT 5) RETURNING id`)).rows)
  for (const row of rows) {
    try { await reconcileLead(row.id) }
    catch { await pool.query("UPDATE sales_leads SET reconcile_at=now()+interval '30 minutes',sync_state='failed',sync_error='Reconciliation unavailable: check contact/message/notes/calendar read permissions' WHERE id=$1", [row.id]) }
  }
}
/** Discover new contacts only inside previously approved query scopes. Each
 * tick reads at most one page. Keep per-scope high-water marks and page cursors;
 * do not sweep the entire location just because a dashboard is open. */
async function discoverScopedContacts() {
  const cfg = await transaction(async c => (await c.query(`UPDATE sales_settings SET poll_at=now()+interval '10 minutes'
    WHERE id='internal' AND poll_at<=now() RETURNING *`)).rows[0])
  if (!cfg) return
  const scopeRows = (await pool.query("SELECT scope,min(created_at) AS approved_at FROM sales_imports WHERE state='done' GROUP BY scope ORDER BY scope LIMIT 20")).rows
  const scopes = scopeRows.map(r => r.scope as string)
  if (!scopes.length) return
  let state: any = {}
  try { state = JSON.parse(cfg.poll_cursor || '{}') } catch { /* first scope review */ }
  const index = (Number(state.index) || 0) % scopes.length, scope = scopes[index]!
  const progress = state.scopes?.[scope] ?? { since: new Date(scopeRows[index]!.approved_at).toISOString(), cursor: {}, scanStartedAt: new Date().toISOString() }
  try {
    const page = await contactPage(scope, progress.cursor)
    let reachedWatermark = false
    for (const remote of page.contacts) {
      const created = Date.parse(remote.dateAdded)
      if (!Number.isFinite(created) || created <= Date.parse(progress.since)) { reachedWatermark = true; continue }
      // Discovery can capture context and DND, but never infers consent.
      const result = await intake({
        firstName: remote.firstName ?? '', lastName: remote.lastName ?? '', email: remote.email ?? '', phone: importPhone(remote.phone),
        practiceName: remote.companyName ?? '', source: 'gohighlevel', sourcePath: 'GoHighLevel scoped discovery',
        context: { ...providerContext(remote), scope },
        providerId: remote.id, historical: true, submittedAt: remote.dateAdded, timezone: remote.timezone, dedupeKey: `ghl-import:${remote.id}`,
      })
      if (!result.review) await ingestProviderFacts(result.id, remote, [])
    }
    const continuation = page.cursor && !reachedWatermark
    const next = continuation ? { ...progress, cursor: page.cursor } :
      { since: progress.scanStartedAt, cursor: {}, scanStartedAt: new Date().toISOString() }
    state = { index: continuation ? index : index + 1, scopes: { ...(state.scopes ?? {}), [scope]: next } }
    await pool.query("UPDATE sales_settings SET poll_cursor=$1,poll_error=NULL WHERE id='internal'", [JSON.stringify(state)])
  } catch {
    await pool.query("UPDATE sales_settings SET poll_error='Scoped discovery unavailable; check contacts.readonly',poll_at=now()+interval '30 minutes' WHERE id='internal'")
  }
}
let busy = false
export async function runSalesWorker() {
  if (busy) return
  busy = true
  try {
    await recoverClaims()
    await drainSalesSync()
    await importSalesPage()
    await discoverScopedContacts()
    await boundedReconciliation()
    await plan()
    for (let i = 0; i < 10; i++) { const job = await claimSalesJob(); if (!job) break; await processSalesJob(job) }
  } finally { busy = false }
}
