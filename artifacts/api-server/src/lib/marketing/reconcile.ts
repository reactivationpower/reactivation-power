import { pool } from '@workspace/db'
import { transaction } from '@/lib/sales-leads/store'
import { touches, trustedConversion } from './store'
import { pastDeadline } from '@/lib/cron/budget'
import { deleteInBatches } from '@/lib/batched-delete'
/**
 * Business tables are the durable delivery queue; analytics never gates their writes.
 * Under a cron time budget the pass stops between items (every item is an
 * idempotent insert) and reports `incomplete: true`; the next pass picks up the rest.
 */
export async function reconcileMarketing(opts:{deadline?:number}={}) {
  return transaction(async c=>{
    if(!(await c.query("SELECT pg_try_advisory_xact_lock(hashtext('marketing-reconcile')) AS locked")).rows[0].locked)return {busy:true}
    let recorded=0
    const out=()=>({recorded,incomplete:true})
    const stop=()=>pastDeadline(opts.deadline,2_000)
    const leads=(await c.query(`SELECT s.* FROM sales_submissions s WHERE NOT s.historical
      AND s.dedupe_key LIKE 'landing:%' AND NOT EXISTS(SELECT 1 FROM marketing_conversions m WHERE m.id='lead:'||substr(s.dedupe_key,9))
      ORDER BY s.submitted_at LIMIT 200`)).rows
    for(const lead of leads){
      if(stop())return out()
      const candidate=lead.context?.marketingVisitorId
      const visitor=typeof candidate==='string'&&/^[a-f0-9-]{36}$/.test(candidate)
        ?(await c.query('SELECT * FROM marketing_visitors WHERE id=$1 AND removed_at IS NULL FOR UPDATE',[candidate])).rows[0]:null
      const eligible=visitor&&(!visitor.lead_id||visitor.lead_id===lead.lead_id)?visitor:null
      if(eligible){
        await c.query('UPDATE marketing_visitors SET lead_id=$2 WHERE id=$1',[eligible.id,lead.lead_id])
        await c.query('UPDATE marketing_sessions SET lead_id=$2 WHERE visitor_id=$1 AND lead_id IS NULL',[eligible.id,lead.lead_id])
      }
      const session=eligible?(await c.query('SELECT * FROM marketing_sessions WHERE visitor_id=$1 AND started_at<=$2 ORDER BY started_at DESC LIMIT 1',[eligible.id,lead.submitted_at])).rows[0]:null
      const snapshot=await touches(c,eligible?.id??null,lead.submitted_at)
      await c.query(`INSERT INTO marketing_conversions(id,kind,lead_id,visitor_id,session_id,funnel,occurred_at,first_touch,last_touch,classification)
        VALUES($1,'lead',$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO NOTHING`,[`lead:${lead.dedupe_key.slice(8)}`,lead.lead_id,eligible?.id??null,session?.id??null,
          session?.funnel??null,lead.submitted_at,JSON.stringify(snapshot.first),JSON.stringify(snapshot.last),eligible?.classification??'observed'])
      recorded++
    }
    const bookings=(await c.query(`SELECT * FROM sales_activities a WHERE kind='appointment' AND status='confirmed'
      AND NOT EXISTS(SELECT 1 FROM marketing_conversions m WHERE m.id='booking:'||COALESCE(a.provider_id,a.id))
      ORDER BY occurred_at LIMIT 200`)).rows
    for(const b of bookings){if(stop())return out();await trustedConversion(c,{id:`booking:${b.provider_id??b.id}`,kind:'booking',leadId:b.lead_id,at:b.occurred_at});recorded++}
    const customers=(await c.query(`SELECT CASE WHEN count(DISTINCT l.id)=1 THEN (array_agg(l.id))[1] ELSE NULL END AS lead_id,
      t.customer_id,min(t.completed_at) AS completed_at FROM payment_link_terms t
      LEFT JOIN sales_leads l ON l.customer_id=t.customer_id WHERE t.completed_at IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM marketing_conversions m WHERE m.id='customer:'||t.customer_id)
      GROUP BY t.customer_id ORDER BY min(t.completed_at) LIMIT 200`)).rows
    for(const row of customers){if(stop())return out();await trustedConversion(c,{id:`customer:${row.customer_id}`,kind:'customer',leadId:row.lead_id,customerId:row.customer_id,at:row.completed_at});recorded++}
    const money=(await c.query(`WITH canonical AS (
      SELECT DISTINCT ON (CASE WHEN h.kind='refund' THEN 'refund:'||COALESCE(h.stripe_refund_id,h.id)
        ELSE 'payment:'||COALESCE(h.stripe_charge_id,h.stripe_payment_intent_id,h.stripe_invoice_id,h.id) END)
        h.*,l.id AS lead_id,CASE WHEN h.kind='refund' THEN 'refund:'||COALESCE(h.stripe_refund_id,h.id)
        ELSE 'payment:'||COALESCE(h.stripe_charge_id,h.stripe_payment_intent_id,h.stripe_invoice_id,h.id) END AS analytics_id
      FROM payment_history h LEFT JOIN LATERAL(SELECT (array_agg(id))[1] AS id FROM sales_leads
        WHERE customer_id=h.customer_id HAVING count(*)=1)l ON true
      WHERE ((h.kind='invoice_paid' AND h.status='succeeded') OR (h.kind='refund' AND h.status='refunded'))
      AND h.amount_cents>0
      ORDER BY CASE WHEN h.kind='refund' THEN 'refund:'||COALESCE(h.stripe_refund_id,h.id)
        ELSE 'payment:'||COALESCE(h.stripe_charge_id,h.stripe_payment_intent_id,h.stripe_invoice_id,h.id) END,h.occurred_at,h.id
    ) SELECT * FROM canonical h WHERE NOT EXISTS(SELECT 1 FROM marketing_conversions m WHERE m.id=h.analytics_id)
      ORDER BY occurred_at LIMIT 300`)).rows
    for(const row of money){if(stop())return out();await trustedConversion(c,{id:row.analytics_id,kind:row.kind==='refund'?'refund':'payment',leadId:row.lead_id,
      customerId:row.customer_id,at:row.occurred_at,amount:row.amount_cents,currency:row.currency});recorded++}
    // Only proven cash movements; overlapping face-value disputes are not extra collected-money losses.
    const disputes=(await c.query(`SELECT d.*,h.customer_id,h.currency,l.id AS lead_id FROM affiliate_disputes d
      JOIN LATERAL(SELECT * FROM payment_history h WHERE h.stripe_charge_id=d.charge_key OR h.stripe_payment_intent_id=d.charge_key ORDER BY occurred_at LIMIT 1)h ON true
      LEFT JOIN LATERAL(SELECT (array_agg(id))[1] AS id FROM sales_leads WHERE customer_id=h.customer_id HAVING count(*)=1)l ON true WHERE d.cash_loss
      AND NOT EXISTS(SELECT 1 FROM marketing_conversions m WHERE m.kind='dispute' AND m.id LIKE 'dispute:'||d.id||':%' AND m.occurred_at=d.updated_event_at)
      ORDER BY d.updated_event_at LIMIT 200`)).rows
    for(const row of disputes){
      if(stop())return out()
      const prior=Number((await c.query("SELECT COALESCE(sum(amount_cents),0) AS amount FROM marketing_conversions WHERE kind='dispute' AND id LIKE $1",[`dispute:${row.id}:%`])).rows[0].amount)
      const current=['won','warning_closed'].includes(row.status)?0:Number(row.amount_cents)
      await trustedConversion(c,{id:`dispute:${row.id}:${row.updated_event_at.toISOString()}`,kind:'dispute',leadId:row.lead_id,customerId:row.customer_id,
        at:row.updated_event_at,amount:current-prior,currency:row.currency})
    }
    return {recorded}
  })
}
/** Rows per statement; the cleanup repeats statements until nothing is left or the deadline is near. */
const CLEANUP_BATCH=5000
/**
 * Retention cleanup under a cron time budget: every statement is a bounded
 * batch, repeated until done; stopping early commits what was done and
 * reports `incomplete: true` so the continuation finishes the rest.
 */
export async function cleanupMarketing(opts:{deadline?:number}={}){
  return transaction(async c=>{
    await c.query("SELECT pg_advisory_xact_lock(hashtext('marketing-cleanup'))")
    const stop=()=>pastDeadline(opts.deadline,2_000)
    let aggregateGroups=0
    const retention="(SELECT retention_days FROM marketing_settings WHERE id='marketing')*interval '1 day'"
    // Delete-and-aggregate in one statement prevents retries double-counting.
    for(;;){
      if(stop())return {aggregateGroups,incomplete:true}
      const result=await c.query(`WITH expired AS (
      DELETE FROM marketing_events WHERE id IN (SELECT id FROM marketing_events WHERE received_at<now()-${retention} LIMIT ${CLEANUP_BATCH})
      RETURNING *
    ), totals AS (
      SELECT (e.occurred_at AT TIME ZONE 'UTC')::date AS day,e.page_id,e.kind,v.classification,count(*) AS events
      FROM expired e JOIN marketing_sessions s ON s.id=e.session_id JOIN marketing_visitors v ON v.id=s.visitor_id
      GROUP BY 1,2,3,4
    ) INSERT INTO marketing_daily_totals(day,page_id,kind,classification,events) SELECT * FROM totals
      ON CONFLICT(day,page_id,kind,classification) DO UPDATE SET events=marketing_daily_totals.events+EXCLUDED.events RETURNING events`)
      aggregateGroups+=result.rowCount??0
      const expired=Number((await c.query('SELECT count(*) AS n FROM marketing_events WHERE received_at<now()-'+retention)).rows[0].n)
      if(expired===0)break
    }
    const state={incomplete:false}
    await deleteInBatches(c,'marketing_sessions',`last_at<now()-${retention}
      AND NOT EXISTS(SELECT 1 FROM marketing_events WHERE session_id=marketing_sessions.id)`,opts.deadline,state,CLEANUP_BATCH)
    await deleteInBatches(c,'marketing_touches',`occurred_at<now()-${retention}`,opts.deadline,state,CLEANUP_BATCH)
    await deleteInBatches(c,'marketing_visitors',`expires_at<now() AND NOT EXISTS(
      SELECT 1 FROM marketing_sessions s JOIN marketing_events e ON e.session_id=s.id WHERE s.visitor_id=marketing_visitors.id)`,opts.deadline,state,CLEANUP_BATCH)
    if(state.incomplete)return {aggregateGroups,incomplete:true}
    await c.query(`UPDATE marketing_conversions SET visitor_id=NULL,session_id=NULL,funnel=NULL,
      first_touch='{"source":"unattributed"}',last_touch='{"source":"unattributed"}'
      WHERE visitor_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM marketing_sessions s WHERE s.visitor_id=marketing_conversions.visitor_id)`)
    await c.query("DELETE FROM marketing_limits WHERE window_at<now()-interval '1 day'")
    return {aggregateGroups}
  })
}
/** Retain business evidence, never retain erased behavioral joins/snapshots. */
export async function eraseMarketingHistory(leadId:string,actor:string){
  return transaction(async c=>{
    await c.query('SELECT id FROM marketing_visitors WHERE lead_id=$1 FOR UPDATE',[leadId])
    await c.query('DELETE FROM marketing_sessions WHERE lead_id=$1',[leadId])
    await c.query('UPDATE marketing_visitors SET removed_at=now() WHERE lead_id=$1',[leadId])
    await c.query(`UPDATE marketing_conversions SET visitor_id=NULL,session_id=NULL,funnel=NULL,
      first_touch='{"source":"unattributed"}',last_touch='{"source":"unattributed"}' WHERE lead_id=$1`,[leadId])
    await c.query("INSERT INTO marketing_audit(actor,entity,entity_id,after_value) VALUES($1,'behavioral_removal',$2,'{}')",[actor,leadId])
  })
}
