import { pool } from '@workspace/db'
import { earnedCents } from './rules'
import { financialReport } from './finance'
import { partner, rulesAt } from './store'

/** Explicit minimum-field projection. Never return a customer/contact or payment_history object. */
export async function affiliateReport(affiliateId: string) {
  const p = await partner(affiliateId)
  if (!p) throw new Error('Affiliate not found')
  const [practices, ledger, wires, rules, collected] = await Promise.all([
    pool.query(`SELECT c.id,c.business_name,c.billing_status,t.type,t.monthly_cents,
      EXISTS(SELECT 1 FROM payment_history h WHERE h.customer_id=c.id AND h.kind='invoice_paid' AND h.status='succeeded' AND h.amount_cents>0) paid
      FROM customers c JOIN LATERAL
       (SELECT affiliate_id FROM affiliate_attributions WHERE customer_id=c.id ORDER BY effective_at DESC,id DESC LIMIT 1) a ON a.affiliate_id=$1
      LEFT JOIN LATERAL (SELECT type,monthly_cents FROM payment_link_terms WHERE customer_id=c.id ORDER BY created_at DESC LIMIT 1) t ON true`,
    [affiliateId]),
    pool.query(`SELECT id,customer_id,kind,cents,collected_cents,period,occurred_at,rule FROM affiliate_ledger
      WHERE affiliate_id=$1 ORDER BY occurred_at DESC,id`, [affiliateId]),
    pool.query(`SELECT id,period,amount_cents,payment_date::text,reference,notification_status,notification_error
      FROM affiliate_payouts WHERE affiliate_id=$1 ORDER BY created_at DESC`, [affiliateId]),
    rulesAt(pool, affiliateId, null, new Date()),
    pool.query(`SELECT h.id,h.customer_id,c.business_name AS practice_name,h.kind,h.amount_cents,h.occurred_at,
      CASE WHEN t.type='one_time' THEN 'one_time' WHEN h.stripe_invoice_id IS NOT NULL THEN 'monthly' ELSE 'setup' END sale_type
      FROM payment_history h JOIN customers c ON c.id=h.customer_id
      LEFT JOIN payment_link_terms t ON t.link_id=h.link_id
      JOIN LATERAL (SELECT affiliate_id FROM affiliate_attributions WHERE customer_id=h.customer_id AND effective_at<=h.occurred_at
        ORDER BY effective_at DESC,id DESC LIMIT 1) a ON true
      WHERE h.status IN ('succeeded','refunded') AND h.kind IN ('invoice_paid','refund')
      AND (a.affiliate_id=$1 OR EXISTS(SELECT 1 FROM affiliate_ledger l WHERE l.source_history_id=h.id AND l.affiliate_id=$1))
      ORDER BY h.occurred_at DESC,h.id`, [affiliateId]),
  ])
  const entries = ledger.rows
  const payouts = wires.rows
  const finances = financialReport(entries, payouts)
  const restrictedPractices = await Promise.all(practices.rows.map(async r => {
    const effectiveRules = await rulesAt(pool, affiliateId, r.id, new Date())
    const active = ['active', 'trialing', 'paid'].includes(r.billing_status)
    return { id: r.id, business_name: r.business_name, active, paid: r.paid,
      rules: effectiveRules,
      estimated_next_commission_cents: active && r.type === 'subscription' ? earnedCents(r.monthly_cents, effectiveRules.monthly) : 0 }
  }))
  return { affiliate: { id: p.id, business_name: p.business_name, referral_code: p.referral_code }, rules,
    practices: restrictedPractices, entries, payments: collected.rows, payouts, ...finances }
}
