import { pool } from '@workspace/db'
import { randomUUID } from 'node:crypto'
import { activity, enqueue, stop, transaction } from '../sales-leads/store'
import { safeProviderText } from '../sales-leads/ingestion'
import { inboxSettings, mailbox, receivingApi } from './store'

/** Webhook only supplies an ID. Retrieve the verified provider record, not client-provided message bodies. */
export async function acceptReceivedEmail(id: string) {
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(id)) throw new Error('Invalid receiving ID')
  await pool.query('INSERT INTO sales_inbox_inbound(id) VALUES($1) ON CONFLICT DO NOTHING', [id])
}
export async function ingestReceivedEmail(id: string, data: any) {
  const cfg = await inboxSettings()
  const recipients = (Array.isArray(data.to) ? data.to : []).map(mailbox)
  const tokens = recipients.filter((r: string) => r.endsWith(`@${cfg.email_domain}`))
    .map((r: string) => r.split('@')[0]).filter((r: string) => /^[a-f0-9]{48}$/.test(r))
  if (!tokens.length) return 'ignored'
  return transaction(async c => {
    const matches = (await c.query(`SELECT l.* FROM sales_inbox_threads t JOIN sales_leads l ON l.id=t.lead_id WHERE t.token=ANY($1)`, [tokens])).rows
    if (matches.length !== 1) return 'review'
    const lead = matches[0]
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`sales-send:${lead.id}`])
    // Recheck under the same lock used by lead edits/sends.
    const current = (await c.query('SELECT * FROM sales_leads WHERE id=$1', [lead.id])).rows[0]
    if (mailbox(data.from) !== mailbox(current.email)) return 'review'
    const text = typeof data.text === 'string' ? data.text : String(data.html ?? '').replace(/<[^>]*>/g, ' ')
    const body = safeProviderText(text) || '[Email contains no readable text. Attachments are not imported.]'
    const created = Number.isFinite(Date.parse(data.created_at)) ? data.created_at : new Date().toISOString()
    await c.query(`INSERT INTO sales_inbox_messages(id,lead_id,channel,direction,subject,body,state,provider_id,created_at)
      VALUES($1,$2,'email','inbound',$3,$4,'received',$5,$6) ON CONFLICT(provider_id) DO NOTHING`,
    [randomUUID(), lead.id, safeProviderText(data.subject).slice(0,200), body, id, created])
    const a = await activity(c, lead.id, { kind:'inbound_email', body, providerId:id, status:'received', occurredAt:created, dedupeKey:`resend-inbound:${id}` })
    await c.query(`UPDATE sales_leads SET last_reply_at=GREATEST(COALESCE(last_reply_at,'epoch'),$2::timestamptz),
      stage=CASE WHEN stage IN ('New','Attempting Contact','Follow-Up Scheduled') THEN 'Engaged' ELSE stage END,
      revision=revision+1 WHERE id=$1`, [lead.id,created])
    await stop(c, lead.id, 'reply_received')
    if(a.inserted && current.assignee_id) await enqueue(c, lead.id, 'reply_email', `inbound-email-notify:${id}:${current.assignee_id}`, {activityId:a.id,assigneeId:current.assignee_id})
    return 'done'
  })
}
export async function runInboxInbound() {
  if (process.env.NODE_ENV !== 'production') return
  const lock = await pool.connect()
  let acquired = false
  try {
    acquired = (await lock.query("SELECT pg_try_advisory_lock(hashtextextended('sales-inbox-receiving',0)) AS ok")).rows[0].ok
    if (!acquired) return
    await lock.query("UPDATE sales_inbox_messages SET state='uncertain',error='Sending was interrupted; check provider before composing another message' WHERE state='sending' AND created_at<now()-interval '15 minutes'")
    const deadline = Date.now() + 30_000
    const rows = (await lock.query("SELECT id FROM sales_inbox_inbound WHERE state='pending' ORDER BY (last_error IS NOT NULL),created_at LIMIT 5")).rows
    for (const row of rows) {
      if (Date.now() >= deadline) break
      try {
        const data = await receivingApi(`/emails/receiving/${encodeURIComponent(row.id)}`)
        const state = await ingestReceivedEmail(row.id, data)
        await lock.query('UPDATE sales_inbox_inbound SET state=$2,last_error=NULL WHERE id=$1',[row.id,state])
      } catch {
        await lock.query("UPDATE sales_inbox_inbound SET last_error='Receiving retrieval failed; check Resend receiving access' WHERE id=$1",[row.id])
      }
    }
  } finally {
    try {
      if(acquired) await lock.query("SELECT pg_advisory_unlock(hashtextextended('sales-inbox-receiving',0))")
      lock.release()
    } catch { lock.release(true) }
  }
}
