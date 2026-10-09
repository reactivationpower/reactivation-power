import { pool } from '@workspace/db'
import { sendEmail } from '@/lib/mail/send'
import { audit, id, transaction } from './store'

export interface WireInput { affiliateId: string; period: string; amountCents: number; paymentDate: string; reference: string; key: string }
function validateWire(input: WireInput) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.period) || !/^\d{4}-\d{2}-\d{2}$/.test(input.paymentDate) ||
    new Date(`${input.paymentDate}T12:00:00Z`).toISOString().slice(0, 10) !== input.paymentDate ||
    !Number.isSafeInteger(input.amountCents) || input.amountCents <= 0 || input.amountCents > 99999999 ||
    typeof input.reference !== 'string' || !input.reference.trim() || input.reference.length > 200 ||
    typeof input.key !== 'string' || input.key.length < 16 || input.key.length > 100) throw new Error('Enter a valid period, wire date, amount, reference and request key')
}
export async function recordWire(input: WireInput, actor: string) {
  validateWire(input)
  const payoutId = await transaction(async client => {
    const p = (await client.query('SELECT id,email,business_name FROM affiliates WHERE id=$1 FOR UPDATE', [input.affiliateId])).rows[0]
    if (!p) throw new Error('Affiliate not found')
    const duplicate = (await client.query('SELECT *,payment_date::text AS paid_date FROM affiliate_payouts WHERE request_key=$1', [input.key])).rows[0]
    if (duplicate) {
      if (duplicate.affiliate_id !== input.affiliateId || duplicate.period !== input.period || duplicate.amount_cents !== input.amountCents ||
        duplicate.paid_date !== input.paymentDate || duplicate.reference !== input.reference.trim()) {
        throw new Error('This request key was already used for a different wire')
      }
      return duplicate.id
    }
    const totals = (await client.query(`SELECT
      COALESCE((SELECT sum(cents) FROM affiliate_ledger WHERE affiliate_id=$1),0)::bigint earned,
      COALESCE((SELECT sum(cents) FROM affiliate_ledger WHERE affiliate_id=$1 AND period<=$2),0)::bigint through_period,
      COALESCE((SELECT sum(amount_cents) FROM affiliate_payouts WHERE affiliate_id=$1),0)::bigint paid`,
    [input.affiliateId, input.period])).rows[0]
    const payable = Math.min(Number(totals.earned), Number(totals.through_period)) - Number(totals.paid)
    if (input.amountCents > payable) throw new Error('Wire exceeds the remaining payable balance after corrections and prior payments')
    const payoutId = id()
    await client.query(`INSERT INTO affiliate_payouts(id,affiliate_id,period,amount_cents,payment_date,reference,request_key,actor,notification_recipient,notification_business_name)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [payoutId, input.affiliateId, input.period, input.amountCents, input.paymentDate, input.reference.trim(), input.key, actor, p.email, p.business_name])
    const available = (await client.query(`SELECT l.id,l.cents-COALESCE(sum(a.cents),0)::int remaining
      FROM affiliate_ledger l LEFT JOIN affiliate_payout_allocations a ON a.earning_id=l.id
      WHERE l.affiliate_id=$1 AND l.cents>0 AND l.period<=$2 GROUP BY l.id ORDER BY l.occurred_at,l.id`,
    [input.affiliateId, input.period])).rows
    let remaining = input.amountCents
    for (const e of available) {
      const amount = Math.min(remaining, e.remaining)
      if (amount > 0) await client.query('INSERT INTO affiliate_payout_allocations(payout_id,earning_id,cents) VALUES($1,$2,$3)', [payoutId, e.id, amount])
      remaining -= Math.max(0, amount)
      if (!remaining) break
    }
    if (remaining !== 0) throw new Error('Earning allocation could not be completed')
    await audit(client, input.affiliateId, 'wire_recorded', actor, input.reference.trim(), null,
      { payoutId, amountCents: input.amountCents, period: input.period, paymentDate: input.paymentDate })
    return payoutId
  })
  // Notification failure cannot roll back the immutable wire.
  return { ok: true as const, payoutId, emailSent: await deliverPayout(payoutId) }
}
export async function deliverPayout(payoutId: string): Promise<boolean> {
  const claim = await transaction(async client => {
    const row = (await client.query(`SELECT p.*,p.payment_date::text AS paid_date FROM affiliate_payouts p
      WHERE p.id=$1 FOR UPDATE`, [payoutId])).rows[0]
    if (!row) throw new Error('Payout not found')
    if (row.notification_status === 'sent') return { sent: true, row: null }
    // A process may die after provider acceptance. A retained delivery log is evidence, not a new send.
    const accepted = (await client.query(`SELECT id FROM email_log WHERE type='affiliate_payout'
      AND metadata->>'payoutId'=$1 AND status IN ('sent','delivered','opened','clicked') LIMIT 1`, [row.id])).rows[0]
    if (accepted) {
      await client.query("UPDATE affiliate_payouts SET notification_status='sent',notification_error=NULL,notification_sent_at=now() WHERE id=$1", [row.id])
      return { sent: true, row: null }
    }
    if (['sending','uncertain'].includes(row.notification_status) && row.notification_started_at) {
      const elapsed = Date.now() - new Date(row.notification_started_at).getTime()
      if (elapsed < 60_000) return { sent: false, row: null }
      if (elapsed > 23 * 3600_000) {
        await client.query(`UPDATE affiliate_payouts SET notification_status='uncertain',
          notification_error='Delivery is uncertain. Check the provider record before sending another notification; automatic retry is blocked to avoid a duplicate.' WHERE id=$1`, [row.id])
        return { sent: false, row: null }
      }
    }
    await client.query(`UPDATE affiliate_payouts SET notification_status='sending',
      notification_started_at=COALESCE(notification_started_at,now()),notification_error=NULL WHERE id=$1`, [row.id])
    return { sent: false, row }
  })
  if (!claim.row) return claim.sent
  const row = claim.row
  // The committed send claim survives crashes. A fixed payload/key makes a retry within 24h safe.
  const result = await sendEmail('affiliate_payout', row.notification_recipient, {
    businessName: row.notification_business_name, period: row.period, amountCents: row.amount_cents,
    paymentDate: row.paid_date, portalUrl: 'https://patientpipeline.app/affiliates/access',
  }, { idempotencyKey: `affiliate-payout/${row.id}`, metadata: { payoutId: row.id, affiliateId: row.affiliate_id } })
  await transaction(async client => {
    await client.query(`UPDATE affiliate_payouts SET notification_status=$2,notification_error=$3,
      notification_sent_at=CASE WHEN $2='sent' THEN now() ELSE NULL END WHERE id=$1`,
    [row.id, result.ok ? 'sent' : result.uncertain ? 'uncertain' : 'failed', result.ok ? null : result.error ?? 'Email delivery failed'])
  })
  return result.ok
}
