import { pool } from '@workspace/db'
import { activity, enqueue, stop, transaction } from './store'
import { appointments, contact, conversations, messages, notes, SalesProviderError } from './provider'
import { canonicalSmsStatus } from '../sales-inbox/status'
/** Do not retain private attachments, recordings, signed URLs or the raw provider payload. */
export function providerDnd(c: any) {
  return c?.dnd === true || c?.dndSettings?.SMS?.status === 'active' || c?.dndSettings?.CALL?.status === 'active'
}
// Verified against this location's read-only message payloads: TYPE_SMS=2,
// TYPE_CALL=1, TYPE_EMAIL=3. Prefer the explicit symbol, never guess type=1 is SMS.
const smsType = (m: any) => ['SMS','TYPE_SMS','TYPE_CAMPAIGN_SMS','TYPE_CUSTOM_SMS'].includes(m.messageType ?? m.type) || (!m.messageType && m.type === 2)
const callType = (m: any) => ['CALL','TYPE_CALL','TYPE_CAMPAIGN_CALL','TYPE_CUSTOM_CALL','TYPE_IVR_CALL'].includes(m.messageType ?? m.type) || (!m.messageType && m.type === 1)
const emailType = (m: any) => ['EMAIL','TYPE_EMAIL','TYPE_CAMPAIGN_EMAIL'].includes(m.messageType ?? m.type) || (!m.messageType && m.type === 3)
export const safeProviderText = (value: unknown) => String(value ?? '').replace(/https?:\/\/[^\s<>"']+/g, raw => {
  try {
    const url = new URL(raw)
    if (url.username || url.password || [...url.searchParams.keys()].some(k => /token|signature|authorization|credential|key|secret|x-amz|x-goog/i.test(k))) return '[private provider link omitted]'
    return raw
  } catch { return '[invalid link omitted]' }
}).slice(0, 10000)
export function providerContext(remote: any) {
  return {
    providerId: remote.id, providerSource: safeProviderText(remote.source), providerCreatedAt: remote.dateAdded, providerUpdatedAt: remote.dateUpdated,
    firstName: remote.firstName, lastName: remote.lastName, email: remote.email, phone: remote.phone, practiceName: remote.companyName,
    address: remote.address1, city: remote.city, state: remote.state, postalCode: remote.postalCode, country: remote.country,
    tags: (remote.tags ?? []).map(safeProviderText), timezone: remote.timezone, dnd: providerDnd(remote),
    consent: 'unverified — manual only', customFields: (remote.customFields ?? []).map((f: any) => ({ id: f.id, value: safeProviderText(f.value) })),
  }
}
const optout = (s: string) => /^(stop|stopall|unsubscribe|cancel|end|quit)\b/i.test(s.trim())
export async function ingestMessages(leadId: string, rows: any[]) {
  await transaction(async c => {
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`sales-send:${leadId}`])
    const lead = (await c.query('SELECT * FROM sales_leads WHERE id=$1 FOR UPDATE', [leadId])).rows[0]
    if (!lead) return
    for (const m of rows) {
      if (!m.id || !(smsType(m) || callType(m) || emailType(m))) continue
      if ((m.contactId && m.contactId!==lead.ghl_contact_id) ||
        (m.locationId && m.locationId!==process.env.GHL_LOCATION_ID) ||
        (!callType(m) && !['inbound','outbound'].includes(m.direction))) continue
      const occurredAt = Number.isFinite(Date.parse(m.dateAdded)) ? m.dateAdded : undefined
      const inbound = m.direction === 'inbound' && (smsType(m) || emailType(m))
      const kind = callType(m) ? 'provider_call' : `${inbound?'inbound':'outbound'}_${emailType(m)?'email':'sms'}`
      const a = await activity(c, leadId, { kind, body: safeProviderText(m.body ?? m.meta?.callStatus),
        providerId: m.id, status: String(m.status ?? ''), occurredAt, dedupeKey: `ghl-message:${m.id}` })
      if (!a) continue // globally reused provider ID must not affect another lead
      if (smsType(m)) await c.query(`UPDATE sales_inbox_messages SET state=$3,error=NULL
        WHERE lead_id=$1 AND provider_id=$2 AND channel='sms' AND state NOT IN ('delivered','received','read','failed')
        AND $3<>'unknown'`,[leadId,m.id,canonicalSmsStatus(a.status)])
      // Any genuine reply pauses even if duplicate/out-of-order. Old import replies never start automation.
      if (inbound) {
        await c.query(`UPDATE sales_leads SET last_reply_at=GREATEST(COALESCE(last_reply_at,'epoch'::timestamptz),COALESCE($2::timestamptz,now())),
          stage=CASE WHEN stage IN ('New','Attempting Contact','Follow-Up Scheduled') THEN 'Engaged' ELSE stage END,
          dnd=dnd OR $3,revision=revision+1 WHERE id=$1 AND
          (last_reply_at IS NULL OR last_reply_at<COALESCE($2::timestamptz,now()) OR ($3 AND NOT dnd) OR stage IN ('New','Attempting Contact','Follow-Up Scheduled'))`, [leadId, occurredAt ?? null, optout(String(m.body ?? ''))])
        await stop(c, leadId, optout(String(m.body ?? '')) ? 'opted_out' : 'reply_received')
        if (a.inserted && occurredAt && Date.now() - Date.parse(occurredAt) < 24 * 3600000 && lead.assignee_id) {
          await enqueue(c, leadId, 'reply_email', `reply-email:${m.id}:${lead.assignee_id}`, { activityId: a.id, assigneeId: lead.assignee_id })
        }
      }
    }
  })
}
export async function ingestProviderFacts(leadId: string, remote: any, events: any[], deferReconciliation = true) {
  await transaction(async c => {
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`sales-send:${leadId}`])
    const lead = (await c.query('SELECT * FROM sales_leads WHERE id=$1 FOR UPDATE', [leadId])).rows[0]
    if (!lead) return
    const dnd = providerDnd(remote)
    if (dnd) {
      await c.query("UPDATE sales_leads SET dnd=true,revision=revision+1 WHERE id=$1 AND NOT dnd", [leadId])
      await stop(c, leadId, 'provider_dnd')
    }
    // DND=false never clears a locally known refusal. A booking remains a stop
    // even when later cancelled; staff must deliberately decide what happens next.
    const active = events.filter(e => !['cancelled', 'canceled', 'invalid'].includes(String(e.appointmentStatus).toLowerCase()))
      .sort((a, b) => Date.parse(b.startTime ?? b.dateAdded) - Date.parse(a.startTime ?? a.dateAdded))
    for (const e of events) {
      if (!e.id) continue
      await activity(c, leadId, { kind: 'appointment', providerId: e.id, body: `${e.title ?? 'Strategy call'} — ${e.startTime ?? ''}`,
        status: e.appointmentStatus ?? 'booked', occurredAt: Number.isFinite(Date.parse(e.dateAdded)) ? e.dateAdded : undefined, dedupeKey: `ghl-appointment:${e.id}` })
    }
    if (active.length) {
      const status = active[0].appointmentStatus ?? 'booked'
      await c.query(`UPDATE sales_leads SET appointment_status=$2,stage=CASE WHEN stage IN ('Won','Lost/Do Not Contact') THEN stage WHEN $2='noshow' THEN 'No-Show' ELSE 'Strategy Call Booked' END,
        revision=revision+1 WHERE id=$1 AND (appointment_status IS DISTINCT FROM $2 OR stage NOT IN ('Won','Strategy Call Booked','No-Show','Lost/Do Not Contact'))`, [leadId, status])
      await stop(c, leadId, 'appointment_received')
    }
    // Save only shared fields used for conflict detection, never full provider payload.
    const snapshot = { firstName: remote.firstName ?? '', lastName: remote.lastName ?? '', email: remote.email ?? '', phone: remote.phone ?? '', companyName: remote.companyName ?? '' }
    await c.query("UPDATE sales_leads SET provider_snapshot=$2,reconcile_at=CASE WHEN $3 THEN now()+interval '10 minutes' ELSE reconcile_at END WHERE id=$1", [leadId, JSON.stringify(snapshot),deferReconciliation])
  })
}
/** Bounded per-contact reconciliation. Latest page is reread for delivery updates;
 * backfill uses durable lastMessageId cursors and max three pages per pass. */
export async function reconcileLead(leadId: string, messagesOnly = false) {
  const lead = (await pool.query('SELECT * FROM sales_leads WHERE id=$1', [leadId])).rows[0]
  if (!lead?.ghl_contact_id) return
  const remote = await contact(lead.ghl_contact_id)
   if (!remote || remote.id!==lead.ghl_contact_id || remote.locationId !== process.env.GHL_LOCATION_ID) throw new Error('Contact is not in the configured internal sales location')
  const events = messagesOnly ? [] : await appointments(lead.ghl_contact_id)
  await ingestProviderFacts(leadId, remote, events,!messagesOnly)
  const threads = await conversations(lead.ghl_contact_id)
  if (threads.length>1) throw new Error('Multiple provider conversations require identity review')
  for (const thread of threads) {
    if (thread.contactId!==lead.ghl_contact_id || thread.locationId!==process.env.GHL_LOCATION_ID)
      throw new Error('Conversation identity mismatch')
    const latest = await messages(thread.id)
    await ingestMessages(leadId, latest?.messages ?? [])
    let saved:{thread?:string;cursor?:string}|null=null
    try { saved=JSON.parse(lead.reconcile_cursor??'null') } catch { /* legacy unscoped cursor: start a safe new pass */ }
    let cursor = (saved?.thread===thread.id?saved?.cursor:null) || (latest?.nextPage ? latest.lastMessageId : null)
    for (let page = 0; cursor && page < 2; page++) {
      const batch = await messages(thread.id, cursor)
      await ingestMessages(leadId, batch?.messages ?? [])
      cursor = batch?.nextPage ? batch.lastMessageId : null
    }
    await pool.query('UPDATE sales_leads SET reconcile_cursor=$2 WHERE id=$1', [leadId, cursor?JSON.stringify({thread:thread.id,cursor}):null])
  }
  if(messagesOnly) return
  const remoteNotes = await notes(lead.ghl_contact_id)
  await transaction(async c => {
    for (const n of remoteNotes) {
      if (!n.id) continue
      const marker = String(n.body ?? '').match(/\[Patient Pipeline ([\w-]+)\]/)
      if (marker) {
        await c.query("UPDATE sales_jobs SET state='done',finished_at=now(),last_error=NULL WHERE lead_id=$1 AND kind='note_sync' AND payload->>'activityId'=$2", [leadId, marker[1]])
        continue
      }
      await activity(c, leadId, { kind: 'provider_note', body: safeProviderText(n.body), providerId: n.id, authorName: 'GoHighLevel', occurredAt: Number.isFinite(Date.parse(n.dateAdded)) ? n.dateAdded : undefined, dedupeKey: `ghl-note:${n.id}` })
    }
  })
}
/** Durable cross-instance refresh lease, separate from contact-sync state.
 * A done job is metadata only: the sales dispatcher never claims it. */
export async function refreshLeadMessages(leadId:string, messagesOnly = true) {
  const claimed = await transaction(async c=>{
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`inbox-refresh:${leadId}`])
    const cfg=(await c.query("SELECT capabilities FROM sales_settings WHERE id='internal'")).rows[0]
    if (Date.parse(cfg?.capabilities?.sync_rate_limit?.until)>Date.now()) return false
    const result=await c.query(`INSERT INTO sales_jobs(id,lead_id,kind,dedupe_key,state,due_at,claimed_at)
      VALUES($1,$2,'inbox_refresh',$1,'done',now()+interval '2 minutes',now())
      ON CONFLICT(dedupe_key) DO UPDATE SET due_at=now()+interval '2 minutes',claimed_at=now()
      WHERE sales_jobs.due_at<=now() RETURNING id`,[`inbox-refresh:${leadId}`,leadId])
    return result.rowCount===1
  })
  if (!claimed) return {state:'throttled',reason:'Refresh in progress, recently completed, or provider rate limited',minimumIntervalSeconds:30}
  try {
    await reconcileLead(leadId,messagesOnly)
    await pool.query("UPDATE sales_jobs SET due_at=now()+interval '30 seconds',last_error=NULL WHERE id=$1",[`inbox-refresh:${leadId}`])
    return {state:'current',minimumIntervalSeconds:30}
  } catch(e) {
    const seconds=e instanceof SalesProviderError&&e.status===429?Math.max(60,e.retryAfterSeconds):60
    await pool.query("UPDATE sales_jobs SET due_at=now()+($2 * interval '1 second'),last_error='Provider reconciliation unavailable' WHERE id=$1",[`inbox-refresh:${leadId}`,seconds])
    if(e instanceof SalesProviderError&&e.status===429) await pool.query(`UPDATE sales_settings SET capabilities=jsonb_set(capabilities,'{sync_rate_limit}',
      jsonb_build_object('until',GREATEST(now()+($1 * interval '1 second'),COALESCE((capabilities->'sync_rate_limit'->>'until')::timestamptz,now())))) WHERE id='internal'`,[seconds])
    return {state:'unavailable',reason:'Provider reconciliation unavailable; showing saved history',retryAfterSeconds:seconds}
  }
}
