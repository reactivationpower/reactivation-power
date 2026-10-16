import { pool, db, paymentHistoryTable, type PoolClient, type PaymentHistory } from '@workspace/db'
import { pastDeadline } from '@/lib/cron/budget'
import { eq } from 'drizzle-orm'
import type Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { lockConversion } from './attribution'
import { clawbackCents, earnedCents, periodAt, type Rule } from './rules'
import { audit, id, rulesAt, transaction } from './store'

const chargeKey = (r: PaymentHistory) => r.stripeChargeId ?? r.stripePaymentIntentId ?? r.stripeInvoiceId ?? `history:${r.id}`
async function canonicalChargeKey(client: PoolClient, row: PaymentHistory) {
  const original = (await client.query(`SELECT l.charge_key FROM affiliate_ledger l JOIN payment_history h ON h.id=l.source_history_id
    WHERE l.kind='earning' AND h.customer_id=$1 AND
    ((h.stripe_charge_id IS NOT NULL AND h.stripe_charge_id=$2) OR
     (h.stripe_payment_intent_id IS NOT NULL AND h.stripe_payment_intent_id=$3) OR
     (h.stripe_invoice_id IS NOT NULL AND h.stripe_invoice_id=$4))
    ORDER BY h.occurred_at LIMIT 1`, [row.customerId, row.stripeChargeId, row.stripePaymentIntentId, row.stripeInvoiceId])).rows[0]
  return original?.charge_key ?? chargeKey(row)
}
export async function processAffiliateHistory(row: PaymentHistory) {
  if (!((row.kind === 'invoice_paid' && row.status === 'succeeded') || (row.kind === 'refund' && row.status === 'refunded'))) return
  await transaction(async client => {
    await client.query('SELECT id FROM customers WHERE id=$1 FOR UPDATE', [row.customerId])
    const key = await canonicalChargeKey(client, row)
    if (row.kind === 'refund') {
      // Retryable even if refund arrives before its original payment.
      const refunds = (await client.query(`SELECT COALESCE(sum(amount_cents),0)::int cents FROM payment_history
        WHERE customer_id=$1 AND kind='refund' AND status='refunded' AND
        ((stripe_charge_id IS NOT NULL AND stripe_charge_id=$2) OR
         (stripe_payment_intent_id IS NOT NULL AND stripe_payment_intent_id=$3))`,
      [row.customerId, row.stripeChargeId, row.stripePaymentIntentId])).rows[0].cents
      await client.query(`INSERT INTO affiliate_reversals(charge_key,customer_id,refund_cents,refund_at) VALUES($1,$2,$3,$4)
        ON CONFLICT(charge_key) DO UPDATE SET refund_cents=GREATEST(affiliate_reversals.refund_cents,excluded.refund_cents),
        refund_at=GREATEST(affiliate_reversals.refund_at,excluded.refund_at)`, [key, row.customerId, refunds, row.occurredAt])
      await reconcileReversal(client, key)
      return
    }
    await lockConversion(client, row.customerId, row.occurredAt)
    if (row.amountCents <= 0 || row.currency !== 'usd' || !row.linkId) return
    const terms = (await client.query('SELECT * FROM payment_link_terms WHERE link_id=$1', [row.linkId])).rows[0]
    if (!terms) return
    if ((await client.query('SELECT 1 FROM reseller_sales WHERE link_id=$1', [row.linkId])).rowCount) return
    const saleType = terms.type === 'one_time' ? 'one_time' : row.stripeInvoiceId ? 'monthly' : 'setup'
    if (saleType === 'setup') return
    const attribution = (await client.query(`SELECT a.*,c.email FROM affiliate_attributions a JOIN customers c ON c.id=a.customer_id
      WHERE a.customer_id=$1 AND a.effective_at<=$2 ORDER BY a.effective_at DESC,a.id DESC LIMIT 1`,
    [row.customerId, row.occurredAt])).rows[0]
    if (!attribution?.affiliate_id) return
    const p = (await client.query(`SELECT a.email,r.status FROM affiliates a JOIN LATERAL
      (SELECT status FROM affiliate_rules WHERE affiliate_id=a.id AND customer_id IS NULL AND effective_at<=$2
      ORDER BY effective_at DESC,id DESC LIMIT 1) r ON true WHERE a.id=$1`, [attribution.affiliate_id, row.occurredAt])).rows[0]
    if (p && (p.status !== 'approved' || p.email.toLowerCase() === attribution.email.toLowerCase())) return
    if (!p) {
      const historicalAuthorization = (await client.query(`SELECT id FROM affiliate_rules WHERE affiliate_id=$1
        AND customer_id=$2 AND effective_at<=$3 AND status='approved' LIMIT 1`, [attribution.affiliate_id, row.customerId, row.occurredAt])).rows[0]
      if (!historicalAuthorization) return
    }
    const state = (await client.query(`SELECT eligible FROM affiliate_customer_states WHERE customer_id=$1 AND effective_at<=$2
      ORDER BY effective_at DESC,id DESC LIMIT 1`, [row.customerId, row.occurredAt])).rows[0]
    // Cancellation timestamps are transaction-time facts; never use current screen billing status.
    const ineligible = state?.eligible === false
    if (ineligible) return
    const rules = await rulesAt(client, attribution.affiliate_id, row.customerId, row.occurredAt)
    const rule: Rule = rules[saleType]
    const cents = earnedCents(row.amountCents, rule)
    // One source per closed sale/monthly invoice, independent of Stripe event id.
    const sourceKey = `earning:${saleType === 'one_time' ? `sale:${row.linkId}` : row.stripeInvoiceId}`
    await client.query(`INSERT INTO affiliate_ledger
      (id,affiliate_id,customer_id,source_key,source_history_id,charge_key,kind,cents,collected_cents,rule,occurred_at,period)
      VALUES($1,$2,$3,$4,$5,$6,'earning',$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING`,
    [id(), attribution.affiliate_id, row.customerId, sourceKey, row.id, key, cents, row.amountCents, JSON.stringify({ ...rule, saleType }), row.occurredAt, periodAt(row.occurredAt)])
    for (const alias of [row.stripePaymentIntentId, row.stripeInvoiceId].filter((a): a is string => Boolean(a && a !== key))) {
      const prior = (await client.query('SELECT * FROM affiliate_reversals WHERE charge_key=$1 FOR UPDATE', [alias])).rows[0]
      if (prior && prior.applied_cents === 0) {
        await client.query(`INSERT INTO affiliate_reversals(charge_key,customer_id,refund_cents,refund_at,dispute_cents,dispute_at)
          VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(charge_key) DO UPDATE SET
          refund_cents=GREATEST(affiliate_reversals.refund_cents,excluded.refund_cents),refund_at=GREATEST(affiliate_reversals.refund_at,excluded.refund_at),
          dispute_cents=GREATEST(affiliate_reversals.dispute_cents,excluded.dispute_cents),dispute_at=GREATEST(affiliate_reversals.dispute_at,excluded.dispute_at)`,
        [key, row.customerId, prior.refund_cents, prior.refund_at, prior.dispute_cents, prior.dispute_at])
        await client.query('DELETE FROM affiliate_reversals WHERE charge_key=$1', [alias])
      }
    }
    // Disputes retained before payment delivery are attached now, without depending on current screen state.
    if (row.stripeChargeId) {
      await client.query(`UPDATE affiliate_disputes SET charge_key=$2 WHERE charge_key=$1`, [row.stripeChargeId, key])
      const disputes = (await client.query(`SELECT COALESCE(sum(amount_cents) FILTER(WHERE NOT cash_loss AND status NOT IN ('won','warning_closed')),0)::int cents,
        COALESCE(sum(amount_cents) FILTER(WHERE cash_loss),0)::int proven_cents,
        max(updated_event_at) at FROM affiliate_disputes WHERE charge_key=$1`, [key])).rows[0]
      if (disputes.at) await client.query(`INSERT INTO affiliate_reversals(charge_key,customer_id,dispute_cents,dispute_at,proven_dispute_cents)
        VALUES($1,$2,$3,$4,$5) ON CONFLICT(charge_key) DO UPDATE SET dispute_cents=excluded.dispute_cents,
        proven_dispute_cents=excluded.proven_dispute_cents,
        dispute_at=GREATEST(affiliate_reversals.dispute_at,excluded.dispute_at)`, [key, row.customerId, disputes.cents, disputes.at, disputes.proven_cents])
    }
    await reconcileReversal(client, key)
  })
}
/** Cumulative target, never independently subtract both overlapping refund and dispute amounts. */
export async function reconcileReversal(client: PoolClient, key: string) {
  const reversal = (await client.query('SELECT * FROM affiliate_reversals WHERE charge_key=$1 FOR UPDATE', [key])).rows[0]
  if (!reversal) return
  const earning = (await client.query("SELECT * FROM affiliate_ledger WHERE charge_key=$1 AND kind='earning'", [key])).rows[0]
  if (!earning) return
  const target = clawbackCents(earning.cents, earning.collected_cents,
    reversal.ineligible ? earning.collected_cents : Math.max(
      reversal.refund_cents + reversal.proven_dispute_cents, reversal.dispute_cents))
  const delta = reversal.applied_cents - target
  if (delta === 0) return
  const revision = reversal.revision + 1
  const occurred = new Date(Math.max(
    reversal.refund_at ? new Date(reversal.refund_at).getTime() : 0,
    reversal.dispute_at ? new Date(reversal.dispute_at).getTime() : 0,
    reversal.eligibility_at ? new Date(reversal.eligibility_at).getTime() : 0,
  ))
  await client.query(`INSERT INTO affiliate_ledger
    (id,affiliate_id,customer_id,source_key,charge_key,kind,cents,earning_id,reason,occurred_at,period)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
  [id(), earning.affiliate_id, earning.customer_id, `reversal:${key}:${revision}`, key,
    delta < 0 ? 'clawback' : 'recovery', delta, earning.id,
    'Cumulative refund/dispute reversal of associated commission; overlapping losses counted once', occurred, periodAt(occurred)])
  await client.query('UPDATE affiliate_reversals SET applied_cents=$2,revision=$3 WHERE charge_key=$1', [key, target, revision])
}
export async function processAffiliateDispute(dispute: Stripe.Dispute, eventAt: Date) {
  const stripeChargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id
  if (!stripeChargeId) return
  const charge = await stripe.charges.retrieve(stripeChargeId)
  // The principal amount excludes Stripe fees. Proven unique cash movements also distinguish
  // a partial refund plus a separate partial chargeback from overlapping face-value reports.
  const movements = dispute.balance_transactions ?? []
  const proven = movements.length > 0 && movements.every(t => Number.isSafeInteger(t.amount))
  const loss = ['won', 'warning_closed'].includes(dispute.status) ? 0
    : proven ? Math.max(0, -movements.reduce((sum, t) => sum + t.amount, 0)) : dispute.amount
  const intentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id
  const payment = (await pool.query(`SELECT * FROM payment_history WHERE kind='invoice_paid' AND status='succeeded'
    AND (stripe_charge_id=$1 OR stripe_payment_intent_id=$2) ORDER BY occurred_at LIMIT 1`, [stripeChargeId, intentId])).rows[0]
  // Durable dispute receipt can arrive before enrollment history; later reconciliation finds it.
  const key = payment?.stripe_charge_id ?? payment?.stripe_payment_intent_id ?? stripeChargeId
  await transaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [key])
    await client.query(`INSERT INTO affiliate_disputes(id,charge_key,amount_cents,status,occurred_at,updated_event_at,cash_loss)
      VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET status=excluded.status,charge_key=excluded.charge_key,
      amount_cents=excluded.amount_cents,cash_loss=excluded.cash_loss,updated_event_at=excluded.updated_event_at
      WHERE excluded.updated_event_at>affiliate_disputes.updated_event_at OR
        (excluded.updated_event_at=affiliate_disputes.updated_event_at AND
          (affiliate_disputes.status NOT IN ('won','lost','warning_closed') OR excluded.status IN ('won','warning_closed')))`,
    [dispute.id, key, loss, dispute.status, new Date(dispute.created * 1000), eventAt, proven])
    if (!payment) return
    const lost = (await client.query(`SELECT
      COALESCE(sum(amount_cents) FILTER(WHERE NOT cash_loss AND status NOT IN ('won','warning_closed')),0)::int cents,
      COALESCE(sum(amount_cents) FILTER(WHERE cash_loss),0)::int proven_cents
      FROM affiliate_disputes WHERE charge_key=$1`, [key])).rows[0]
    await client.query(`INSERT INTO affiliate_reversals(charge_key,customer_id,dispute_cents,dispute_at,refund_cents,refund_at,proven_dispute_cents)
      VALUES($1,$2,$3,$4,$5,$4,$6) ON CONFLICT(charge_key) DO UPDATE SET
      dispute_cents=excluded.dispute_cents,dispute_at=GREATEST(affiliate_reversals.dispute_at,excluded.dispute_at),
      proven_dispute_cents=excluded.proven_dispute_cents,
      refund_cents=GREATEST(affiliate_reversals.refund_cents,excluded.refund_cents)`,
    [key, payment.customer_id, lost.cents, eventAt, charge.amount_refunded, lost.proven_cents])
    await reconcileReversal(client, key)
  })
}
export async function recordAffiliateEligibility(customerId: string, eligible: boolean, at: Date, sourceKey: string) {
  await transaction(async client => {
    await client.query('SELECT id FROM customers WHERE id=$1 FOR UPDATE', [customerId])
    await client.query(`INSERT INTO affiliate_customer_states(id,customer_id,eligible,effective_at,source_key)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT(source_key) DO NOTHING`, [id(), customerId, eligible, at, sourceKey])
    const earnings = (await client.query(`SELECT l.*,s.eligible FROM affiliate_ledger l LEFT JOIN LATERAL
      (SELECT eligible FROM affiliate_customer_states WHERE customer_id=l.customer_id AND effective_at<=l.occurred_at
       ORDER BY effective_at DESC,id DESC LIMIT 1) s ON true WHERE l.customer_id=$1 AND l.kind='earning'`, [customerId])).rows
    for (const e of earnings) {
      await client.query(`INSERT INTO affiliate_reversals(charge_key,customer_id,ineligible,eligibility_at) VALUES($1,$2,$3,$4)
        ON CONFLICT(charge_key) DO UPDATE SET ineligible=excluded.ineligible,eligibility_at=excluded.eligibility_at`,
      [e.charge_key, customerId, e.eligible === false, at])
      await reconcileReversal(client, e.charge_key)
    }
  })
  // Late active-state events may make an earlier suppressed, genuinely collected payment eligible.
  await calculateHistory(customerId, at)
}
/** Explicit customer-scoped action only; caller already recorded an audited historical assignment. */
export async function calculateHistory(customerId: string, from: Date) {
  const rows = await pool.query('SELECT id FROM payment_history WHERE customer_id=$1 AND occurred_at>=$2 ORDER BY occurred_at', [customerId, from])
  for (const r of rows.rows) {
    const [history] = await db.select().from(paymentHistoryTable).where(eq(paymentHistoryTable.id, r.id))
    if (history) await processAffiliateHistory(history)
  }
  return rows.rowCount ?? 0
}
/** Durable retry inbox, populated only by actual billing recording, never by scanning old unassigned sales. */
export async function queueAffiliateHistory(row: PaymentHistory) {
  const { queueResellerHistory } = await import('@/lib/resellers/ledger')
  await queueResellerHistory(row)
  await pool.query('INSERT INTO affiliate_history_work(history_id) VALUES($1) ON CONFLICT DO NOTHING', [row.id])
  try {
    await processAffiliateHistory(row)
    await pool.query('UPDATE affiliate_history_work SET completed_at=now(),error=NULL WHERE history_id=$1', [row.id])
  } catch (error) {
    await pool.query('UPDATE affiliate_history_work SET error=$2 WHERE history_id=$1', [row.id, 'Affiliate ledger processing failed; retry required'])
    throw error
  }
}
/** Stops between rows at the deadline (`incomplete: true`); every row is a durable work item, so the continuation picks up the rest. */
export async function retryAffiliateHistory(opts: { deadline?: number } = {}) {
  const { retryResellerHistory } = await import('@/lib/resellers/ledger')
  const resellers = await retryResellerHistory(opts)
  if (resellers.incomplete) return { processed: 0, resellers: resellers.processed, incomplete: true }
  // Repair a process crash between the billing write and its retry-inbox insertion.
  // Existing attribution must already have been effective at the transaction time.
  await pool.query(`INSERT INTO affiliate_history_work(history_id)
    SELECT h.id FROM payment_history h WHERE
      ((h.kind='invoice_paid' AND h.status='succeeded') OR (h.kind='refund' AND h.status='refunded'))
      AND EXISTS(SELECT 1 FROM affiliate_attributions a WHERE a.customer_id=h.customer_id AND a.effective_at<=h.occurred_at)
      AND NOT EXISTS(SELECT 1 FROM affiliate_history_work w WHERE w.history_id=h.id)
      ORDER BY h.occurred_at LIMIT 500 ON CONFLICT DO NOTHING`)
  const pending = (await pool.query('SELECT history_id FROM affiliate_history_work WHERE completed_at IS NULL ORDER BY created_at LIMIT 500')).rows
  let processed = 0
  for (const work of pending) {
    if (pastDeadline(opts.deadline, 5_000)) return { processed, resellers: resellers.processed, incomplete: true }
    const [row] = await db.select().from(paymentHistoryTable).where(eq(paymentHistoryTable.id, work.history_id))
    if (row) { await queueAffiliateHistory(row); processed++ }
  }
  return { processed, resellers: resellers.processed }
}
