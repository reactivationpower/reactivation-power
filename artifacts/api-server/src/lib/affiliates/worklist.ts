import { pool } from '@workspace/db'
import { monthTotals, type LedgerAmount, type WireAmount } from './finance'

interface PartnerRow { id: string; business_name: string; status: string }
interface EntryRow extends LedgerAmount { affiliate_id: string }
interface PayoutRow extends WireAmount { affiliate_id: string; notification_status: string }
function group<T extends { affiliate_id: string }>(rows: T[]) {
  const map = new Map<string, T[]>()
  for (const row of rows) {
    const list = map.get(row.affiliate_id) ?? []
    list.push(row)
    map.set(row.affiliate_id, list)
  }
  return map
}

/** Read-only snapshot: no commission calculation, balance reset, or transfer. */
export async function monthlyPayoutWorklist(period: string) {
  if (typeof period !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error('Choose a valid earning month')
  const client = await pool.connect()
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    const partners = await client.query<PartnerRow>('SELECT id,business_name,status FROM affiliates ORDER BY business_name,id')
    const ledger = await client.query<EntryRow>('SELECT affiliate_id,period,kind,cents FROM affiliate_ledger')
    const wires = await client.query<PayoutRow>('SELECT affiliate_id,period,amount_cents,notification_status FROM affiliate_payouts')
    await client.query('COMMIT')
    const entriesByPartner = group(ledger.rows), payoutsByPartner = group(wires.rows)
    const rows = partners.rows.map(p => {
      const payouts = payoutsByPartner.get(p.id) ?? []
      const notifications = { pending: 0, sending: 0, failed: 0, uncertain: 0 }
      for (const payout of payouts) {
        const status = payout.notification_status
        if (status in notifications) notifications[status as keyof typeof notifications]++
      }
      return { affiliate: p, ...monthTotals(entriesByPartner.get(p.id) ?? [], payouts, period), notifications }
    })
    const totals = rows.reduce((s, r) => ({
      gross_cents: s.gross_cents + r.gross_cents,
      corrections_cents: s.corrections_cents + r.corrections_cents,
      paid_cents: s.paid_cents + r.paid_cents,
      balance_cents: s.balance_cents + r.balance_cents,
      wireable_cents: s.wireable_cents + r.wireable_cents,
    }), { gross_cents: 0, corrections_cents: 0, paid_cents: 0, balance_cents: 0, wireable_cents: 0 })
    return { period, rows, totals }
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally { client.release() }
}
