import { pool } from '@workspace/db'
import { earnedCents, periodAt } from './rules'
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
  const earned = entries.reduce((s, r) => s + r.cents, 0)
  const paid = payouts.reduce((s, r) => s + r.amount_cents, 0)
  const knownPeriods = [...new Set<string>([...entries.map(r => r.period), ...payouts.map(r => r.period)])].sort()
  const periods: string[] = []
  if (knownPeriods.length) {
    let [year, month] = knownPeriods[0]!.split('-').map(Number)
    const end = [periodAt(new Date()), knownPeriods.at(-1)!].sort().at(-1)!
    for (let count = 0; count < 1200; count++) {
      const period = `${year}-${String(month).padStart(2, '0')}`
      if (period > end) break
      periods.push(period)
      if (++month > 12) { month = 1; year++ }
    }
  }
  let carry = 0
  const periodRows = periods.map(period => {
    const rows = entries.filter(e => e.period === period)
    const gross = rows.filter(e => e.kind === 'earning').reduce((s, e) => s + e.cents, 0)
    const corrections = rows.filter(e => e.kind !== 'earning').reduce((s, e) => s + e.cents, 0)
    const paidCents = payouts.filter(e => e.period === period).reduce((s, e) => s + e.amount_cents, 0)
    const opening = carry
    const payable = Math.max(0, opening + gross + corrections)
    carry += gross + corrections - paidCents
    return { period, gross_cents: gross, corrections_cents: corrections, net_cents: gross + corrections,
      opening_balance_cents: opening, paid_cents: paidCents, remaining_cents: carry,
      state: carry <= 0 ? paidCents > 0 ? 'paid' : 'carry_forward' : paidCents > 0 ? 'partially_paid' : 'unpaid',
      payable_cents: payable }
  })
  const restrictedPractices = await Promise.all(practices.rows.map(async r => {
    const effectiveRules = await rulesAt(pool, affiliateId, r.id, new Date())
    const active = ['active', 'trialing', 'paid'].includes(r.billing_status)
    return { id: r.id, business_name: r.business_name, active, paid: r.paid,
      rules: effectiveRules,
      estimated_next_commission_cents: active && r.type === 'subscription' ? earnedCents(r.monthly_cents, effectiveRules.monthly) : 0 }
  }))
  return { affiliate: { id: p.id, business_name: p.business_name, referral_code: p.referral_code }, rules,
    practices: restrictedPractices, entries, payments: collected.rows, payouts, periods: periodRows, earned_cents: earned, paid_cents: paid, balance_cents: earned - paid }
}
