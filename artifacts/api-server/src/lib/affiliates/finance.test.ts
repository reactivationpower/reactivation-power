import { describe, expect, it } from 'vitest'
import { financialReport, monthTotals, wireableCents } from './finance'

describe('shared affiliate monthly finances', () => {
  it('matches every profile month and lifetime total with partial wires, later refunds and debt carry', () => {
    const entries = [
      { period: '2026-01', kind: 'earning', cents: 1000 },
      { period: '2026-03', kind: 'clawback', cents: -1000 },
      { period: '2026-06', kind: 'earning', cents: 700 },
      { period: '2026-06', kind: 'adjustment', cents: -50 },
    ]
    const payouts = [{ period: '2026-01', amount_cents: 400 }]
    const report = financialReport(entries, payouts, new Date('2026-07-01'))
    for (const p of report.periods) {
      expect(monthTotals(entries, payouts, p.period)).toMatchObject({
        gross_cents: p.gross_cents, corrections_cents: p.corrections_cents, net_cents: p.net_cents,
        opening_balance_cents: p.opening_balance_cents, paid_cents: p.paid_cents, remaining_cents: p.remaining_cents,
        wireable_cents: p.wireable_cents, balance_cents: report.balance_cents,
        earned_cents: report.earned_cents, total_paid_cents: report.paid_cents,
      })
    }
    expect(monthTotals(entries, payouts, '2026-04')).toMatchObject({ gross_cents: 0, remaining_cents: -400, wireable_cents: 0 })
    expect(monthTotals(entries, payouts, '2026-07')).toMatchObject({ opening_balance_cents: 250, remaining_cents: 250, wireable_cents: 250 })
    expect(monthTotals(entries, payouts, '2026-01').wireable_cents).toBe(250)
  })
  it('keeps zero-activity partners, penny balances and no-activity months valid', () => {
    expect(monthTotals([], [], '2026-01')).toMatchObject({ balance_cents: 0, wireable_cents: 0, remaining_cents: 0 })
    expect(wireableCents(1, 1, 0)).toBe(1)
    expect(wireableCents(-100, 500, 0)).toBe(0)
    expect(wireableCents(100, 50, 40)).toBe(10)
    expect(wireableCents(100, 50, 100)).toBe(0)
  })
})
