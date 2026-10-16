import { pool, db, paymentHistoryTable, type PaymentHistory, type PoolClient } from '@workspace/db'
import { eq } from 'drizzle-orm'
import type Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { id, transaction } from './store'
import { eligibleRelationship, reversalTarget } from './policy'
import { periodAt } from '@/lib/affiliates/rules'

const keyFor = (r: PaymentHistory) => r.stripeChargeId ?? r.stripePaymentIntentId ?? r.stripeInvoiceId ?? `history:${r.id}`
/** Allocate collected invoice money to recurring lines; no presumed catalog amounts. */
export function recurringCollected(invoice: {
  total: number; lines: { data: { amount: number; parent?: { subscription_item_details?: unknown } | null; type?: string }[]; has_more?: boolean }
}, collected: number) {
  if (invoice.lines.has_more) throw new Error('Invoice lines must be fully loaded before commission calculation.')
  const eligible = invoice.lines.data.filter(l => Boolean(l.parent?.subscription_item_details) || l.type === 'subscription')
    .reduce((sum,l) => sum + l.amount,0)
  const subtotal = invoice.lines.data.reduce((sum,l) => sum + l.amount,0)
  if (subtotal <= 0 || eligible <= 0 || collected <= 0) return 0
  return Math.min(collected, Math.round(collected * Math.min(subtotal,eligible) / subtotal))
}
async function canonical(client: Pick<PoolClient,'query'>, row: PaymentHistory) {
  const old = (await client.query(`SELECT l.charge_key FROM reseller_ledger l JOIN payment_history h ON h.id=l.source_history_id
    WHERE l.kind='earning' AND h.customer_id=$1 AND
    ((h.stripe_charge_id IS NOT NULL AND h.stripe_charge_id=$2) OR
    (h.stripe_payment_intent_id IS NOT NULL AND h.stripe_payment_intent_id=$3) OR
    (h.stripe_invoice_id IS NOT NULL AND h.stripe_invoice_id=$4)) LIMIT 1`,
  [row.customerId,row.stripeChargeId,row.stripePaymentIntentId,row.stripeInvoiceId])).rows[0]
  return old?.charge_key ?? keyFor(row)
}
async function reconcile(client: PoolClient, chargeKey: string) {
  const r = (await client.query('SELECT * FROM reseller_reversals WHERE charge_key=$1 FOR UPDATE',[chargeKey])).rows[0]
  const e = (await client.query(`SELECT l.*,c.activated_at,c.terminated_at FROM reseller_ledger l
    JOIN reseller_companies c ON c.id=l.company_id WHERE l.charge_key=$1 AND l.kind='earning'`,[chargeKey])).rows[0]
  if (!r || !e) return
  await client.query('SELECT id FROM reseller_companies WHERE id=$1 FOR UPDATE',[e.company_id])
  const state = (await client.query(`SELECT eligible FROM reseller_subscription_states WHERE link_id=$1 AND effective_at<=$2
    ORDER BY effective_at DESC,source_key DESC LIMIT 1`,[e.link_id,e.occurred_at])).rows[0]
  const target = !eligibleRelationship(e,new Date(e.occurred_at)) || state?.eligible === false ? e.cents :
    reversalTarget(e.cents,e.source_total_cents,r.refund_cents,r.dispute_cents,r.proven_dispute_cents)
  const delta = r.applied_cents-target
  if (!delta) return
  await client.query(`INSERT INTO reseller_ledger(id,company_id,customer_id,link_id,source_key,charge_key,kind,cents,
    earning_id,reason,occurred_at,period) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
  [id(),e.company_id,e.customer_id,e.link_id,`reversal:${chargeKey}:${r.revision+1}`,chargeKey,
    delta<0?'clawback':'recovery',delta,e.id,'Cumulative source-linked commission reversal',r.occurred_at,periodAt(r.occurred_at)])
  await client.query('UPDATE reseller_reversals SET applied_cents=$2,revision=revision+1 WHERE charge_key=$1',[chargeKey,target])
}
export async function processResellerHistory(row: PaymentHistory) {
  if (!((row.kind==='invoice_paid' && row.status==='succeeded') || (row.kind==='refund' && row.status==='refunded'))) return
  const sale = row.linkId ? (await pool.query('SELECT * FROM reseller_sales WHERE link_id=$1',[row.linkId])).rows[0] : null
  if (!sale && row.kind!=='refund') return
  let eligibleCents = row.amountCents
  if (sale && row.kind==='invoice_paid') {
    const terms = (await pool.query('SELECT type FROM payment_link_terms WHERE link_id=$1',[row.linkId])).rows[0]
    if (terms.type!=='one_time') {
      if (!row.stripeInvoiceId) return // initial setup payment, never commissionable
      const invoice = await stripe.invoices.retrieve(row.stripeInvoiceId)
      if (invoice.lines.has_more) {
        const lines = []
        for await (const line of stripe.invoices.listLineItems(row.stripeInvoiceId,{limit:100})) lines.push(line)
        invoice.lines.data = lines; invoice.lines.has_more=false
      }
      eligibleCents = recurringCollected(invoice as unknown as Parameters<typeof recurringCollected>[0],row.amountCents)
    }
  }
  await transaction(async client => {
    await client.query('SELECT id FROM customers WHERE id=$1 FOR UPDATE',[row.customerId])
    const key = await canonical(client,row)
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`reseller-charge:${key}`])
    const refunds = (await client.query(`SELECT COALESCE(sum(amount_cents),0)::int cents FROM payment_history
      WHERE customer_id=$1 AND kind='refund' AND status='refunded' AND
      ((stripe_charge_id IS NOT NULL AND stripe_charge_id=$2) OR (stripe_payment_intent_id IS NOT NULL AND stripe_payment_intent_id=$3))`,
    [row.customerId,row.stripeChargeId,row.stripePaymentIntentId])).rows[0].cents
    await client.query(`INSERT INTO reseller_reversals(charge_key,refund_cents,occurred_at) VALUES($1,$2,$3)
      ON CONFLICT(charge_key) DO UPDATE SET refund_cents=GREATEST(reseller_reversals.refund_cents,excluded.refund_cents),
      occurred_at=GREATEST(reseller_reversals.occurred_at,excluded.occurred_at)`,[key,refunds,row.occurredAt])
    if (row.kind==='refund') { await reconcile(client,key); return }
    if (!sale || row.currency!=='usd' || eligibleCents<=0) return
    const company = (await client.query('SELECT * FROM reseller_companies WHERE id=$1 FOR UPDATE',[sale.company_id])).rows[0]
    const state = (await client.query(`SELECT eligible FROM reseller_subscription_states WHERE link_id=$1 AND effective_at<=$2
      ORDER BY effective_at DESC,source_key DESC LIMIT 1`,[row.linkId,row.occurredAt])).rows[0]
    if (!eligibleRelationship(company,row.occurredAt) || +row.occurredAt < +new Date(sale.created_at) || state?.eligible===false) return
    await client.query(`INSERT INTO reseller_ledger(id,company_id,customer_id,link_id,source_key,source_history_id,
      charge_key,kind,cents,collected_cents,source_total_cents,reason,occurred_at,period)
      VALUES($1,$2,$3,$4,$5,$6,$7,'earning',$8,$9,$10,$11,$12,$13) ON CONFLICT DO NOTHING`,
    [id(),sale.company_id,row.customerId,row.linkId,`earning:${row.stripeInvoiceId ?? `sale:${row.linkId}`}`,row.id,key,
      Math.round(eligibleCents*0.2),eligibleCents,row.amountCents,'20% of eligible collected revenue, excluding setup',row.occurredAt,periodAt(row.occurredAt)])
    // Out-of-order reversal aliases become attached to the canonical collected source.
    for (const alias of [row.stripePaymentIntentId,row.stripeChargeId,row.stripeInvoiceId].filter(a=>a && a!==key)) {
      const prior = (await client.query('SELECT * FROM reseller_reversals WHERE charge_key=$1 FOR UPDATE',[alias])).rows[0]
      if (prior && prior.applied_cents===0) {
        await client.query(`UPDATE reseller_reversals SET refund_cents=GREATEST(refund_cents,$2),occurred_at=GREATEST(occurred_at,$3) WHERE charge_key=$1`,
        [key,prior.refund_cents,prior.occurred_at])
        await client.query('DELETE FROM reseller_reversals WHERE charge_key=$1',[alias])
      }
      await client.query('UPDATE reseller_disputes SET charge_key=$2 WHERE charge_key=$1',[alias,key])
    }
    await refreshDisputes(client,key,row.occurredAt)
    await reconcile(client,key)
  })
}
async function refreshDisputes(client: PoolClient, key: string, at: Date) {
  const totals = (await client.query(`SELECT
    COALESCE(sum(amount_cents) FILTER(WHERE NOT cash_loss AND status NOT IN ('won','warning_closed')),0)::int disputed,
    COALESCE(sum(amount_cents) FILTER(WHERE cash_loss),0)::int proven FROM reseller_disputes WHERE charge_key=$1`,[key])).rows[0]
  await client.query(`INSERT INTO reseller_reversals(charge_key,dispute_cents,proven_dispute_cents,occurred_at) VALUES($1,$2,$3,$4)
    ON CONFLICT(charge_key) DO UPDATE SET dispute_cents=$2,proven_dispute_cents=$3,
    occurred_at=GREATEST(reseller_reversals.occurred_at,$4)`,[key,totals.disputed,totals.proven,at])
}
export async function processResellerDispute(dispute: Stripe.Dispute, at: Date) {
  const chargeId = typeof dispute.charge==='string' ? dispute.charge : dispute.charge?.id
  if (!chargeId) return
  const charge = await stripe.charges.retrieve(chargeId)
  const pi = typeof charge.payment_intent==='string' ? charge.payment_intent : charge.payment_intent?.id
  await transaction(async client => {
    const history = (await client.query(`SELECT id FROM payment_history WHERE stripe_charge_id=$1 OR stripe_payment_intent_id=$2
      ORDER BY occurred_at LIMIT 1`,[chargeId,pi])).rows[0]
    const earning = history ? (await client.query(`SELECT charge_key FROM reseller_ledger WHERE source_history_id=$1 AND kind='earning'`,[history.id])).rows[0] : null
    const key = earning?.charge_key ?? chargeId
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`reseller-charge:${key}`])
    const movements=dispute.balance_transactions ?? []
    const proven=movements.length>0 && movements.every(t=>Number.isSafeInteger(t.amount))
    const loss=['won','warning_closed'].includes(dispute.status)?0:proven?Math.max(0,-movements.reduce((s,t)=>s+t.amount,0)):dispute.amount
    await client.query(`INSERT INTO reseller_disputes(id,charge_key,amount_cents,cash_loss,status,updated_event_at)
      VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET charge_key=$2,amount_cents=$3,cash_loss=$4,status=$5,updated_event_at=$6
      WHERE excluded.updated_event_at>reseller_disputes.updated_event_at OR
      (excluded.updated_event_at=reseller_disputes.updated_event_at AND excluded.status IN ('won','warning_closed'))`,
    [dispute.id,key,loss,proven,dispute.status,at])
    await client.query(`INSERT INTO reseller_reversals(charge_key,refund_cents,occurred_at) VALUES($1,$2,$3)
      ON CONFLICT(charge_key) DO UPDATE SET refund_cents=GREATEST(reseller_reversals.refund_cents,$2),
      occurred_at=GREATEST(reseller_reversals.occurred_at,$3)`,[key,charge.amount_refunded,at])
    await refreshDisputes(client,key,at)
    await reconcile(client,key)
  })
}
/** Keep cumulative Stripe refund evidence even when its collection arrives later. */
export async function processResellerRefundedCharge(charge: Stripe.Charge, at: Date) {
  const pi=typeof charge.payment_intent==='string'?charge.payment_intent:charge.payment_intent?.id
  await transaction(async client=>{
    const e=(await client.query(`SELECT l.charge_key FROM reseller_ledger l JOIN payment_history h ON h.id=l.source_history_id
      WHERE l.kind='earning' AND (h.stripe_charge_id=$1 OR h.stripe_payment_intent_id=$2) LIMIT 1`,[charge.id,pi])).rows[0]
    const key=e?.charge_key??charge.id
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`reseller-charge:${key}`])
    await client.query(`INSERT INTO reseller_reversals(charge_key,refund_cents,occurred_at) VALUES($1,$2,$3)
      ON CONFLICT(charge_key) DO UPDATE SET refund_cents=GREATEST(reseller_reversals.refund_cents,$2),
      occurred_at=GREATEST(reseller_reversals.occurred_at,$3)`,[key,charge.amount_refunded,at])
    await reconcile(client,key)
  })
}
export async function recordResellerEligibility(linkId: string, eligible: boolean, at: Date, sourceKey: string) {
  if (!(await pool.query('SELECT 1 FROM reseller_sales WHERE link_id=$1',[linkId])).rowCount) return
  await transaction(async client => {
    await client.query('INSERT INTO reseller_subscription_states(source_key,link_id,eligible,effective_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
      [sourceKey,linkId,eligible,at])
    const earnings=(await client.query("SELECT charge_key FROM reseller_ledger WHERE link_id=$1 AND kind='earning'",[linkId])).rows
    for (const e of earnings) {
      await client.query(`INSERT INTO reseller_reversals(charge_key,occurred_at) VALUES($1,$2)
        ON CONFLICT(charge_key) DO UPDATE SET occurred_at=GREATEST(reseller_reversals.occurred_at,$2)`,[e.charge_key,at])
      await reconcile(client,e.charge_key)
    }
    await client.query(`UPDATE reseller_history_work SET completed_at=NULL WHERE history_id IN
      (SELECT id FROM payment_history WHERE link_id=$1 AND occurred_at>=$2)`,[linkId,at])
  })
}
export async function queueResellerHistory(row: PaymentHistory) {
  // No non-reseller work is enrolled. Refunds match only a previously attributed link.
  if (!row.linkId || !(await pool.query('SELECT 1 FROM reseller_sales WHERE link_id=$1',[row.linkId])).rowCount) return
  await pool.query('INSERT INTO reseller_history_work(history_id) VALUES($1) ON CONFLICT DO NOTHING',[row.id])
  await processResellerHistory(row)
  await pool.query('UPDATE reseller_history_work SET completed_at=now(),error=NULL WHERE history_id=$1',[row.id])
}
export async function retryResellerHistory() {
  await pool.query(`INSERT INTO reseller_history_work(history_id) SELECT h.id FROM payment_history h
    JOIN reseller_sales s ON s.link_id=h.link_id WHERE h.occurred_at>=s.created_at AND
    NOT EXISTS(SELECT 1 FROM reseller_history_work w WHERE w.history_id=h.id) ORDER BY h.occurred_at LIMIT 500 ON CONFLICT DO NOTHING`)
  const rows=(await pool.query('SELECT history_id FROM reseller_history_work WHERE completed_at IS NULL ORDER BY created_at LIMIT 500')).rows
  for (const r of rows) {
    const [history]=await db.select().from(paymentHistoryTable).where(eq(paymentHistoryTable.id,r.history_id))
    if (history) await queueResellerHistory(history)
  }
  return { processed: rows.length }
}
