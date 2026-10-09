import { periodAt } from './rules'

export interface LedgerAmount { period: string; kind: string; cents: number }
export interface WireAmount { period: string; amount_cents: number }

/** Shared by profile reports, the worklist and the locked wire validation. */
export function wireableCents(earned: number, throughPeriod: number, paid: number) {
  return Math.max(0, Math.min(earned, throughPeriod) - paid)
}

export function financialReport(entries: LedgerAmount[], payouts: WireAmount[], now = new Date()) {
  const earned = entries.reduce((s, r) => s + r.cents, 0)
  const paid = payouts.reduce((s, r) => s + r.amount_cents, 0)
  const knownPeriods = [...new Set([...entries.map(r => r.period), ...payouts.map(r => r.period)])].sort()
  const periods: string[] = []
  if (knownPeriods.length) {
    let [year, month] = knownPeriods[0]!.split('-').map(Number)
    const end = [periodAt(now), knownPeriods.at(-1)!].sort().at(-1)!
    for (let count = 0; count < 1200; count++) {
      const period = `${year}-${String(month).padStart(2, '0')}`
      if (period > end) break
      periods.push(period)
      if (++month > 12) { month = 1; year++ }
    }
  }
  const periodRows = periods.map(period => {
    const t = monthTotals(entries, payouts, period)
    return { period, gross_cents: t.gross_cents, corrections_cents: t.corrections_cents, net_cents: t.net_cents,
      opening_balance_cents: t.opening_balance_cents, paid_cents: t.paid_cents, remaining_cents: t.remaining_cents,
      state: t.remaining_cents <= 0 ? t.paid_cents > 0 ? 'paid' : 'carry_forward' : t.paid_cents > 0 ? 'partially_paid' : 'unpaid',
      payable_cents: Math.max(0, t.opening_balance_cents + t.net_cents), wireable_cents: t.wireable_cents }
  })
  return { periods: periodRows, earned_cents: earned, paid_cents: paid, balance_cents: earned - paid }
}

export function monthTotals(entries: LedgerAmount[], payouts: WireAmount[], period: string) {
  const sum = (rows: LedgerAmount[]) => rows.reduce((s, e) => s + e.cents, 0)
  const beforePaid = payouts.filter(p => p.period < period).reduce((s, p) => s + p.amount_cents, 0)
  const gross = sum(entries.filter(e => e.period === period && e.kind === 'earning'))
  const corrections = sum(entries.filter(e => e.period === period && e.kind !== 'earning'))
  const paid = payouts.filter(p => p.period === period).reduce((s, p) => s + p.amount_cents, 0)
  const opening = sum(entries.filter(e => e.period < period)) - beforePaid
  const earned = sum(entries)
  const allPaid = payouts.reduce((s, p) => s + p.amount_cents, 0)
  return { gross_cents: gross, corrections_cents: corrections, net_cents: gross + corrections,
    opening_balance_cents: opening, paid_cents: paid, remaining_cents: opening + gross + corrections - paid,
    earned_cents: earned, total_paid_cents: allPaid, balance_cents: earned - allPaid,
    wireable_cents: wireableCents(earned, sum(entries.filter(e => e.period <= period)), allPaid) }
}
