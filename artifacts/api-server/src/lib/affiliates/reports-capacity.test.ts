import { expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ active: 0, peak: 0, fail: false }))
vi.mock('@workspace/db', () => ({ pool: { query: vi.fn(async (sql: string) => {
  state.active++; state.peak = Math.max(state.peak, state.active)
  try {
    await new Promise(resolve => setTimeout(resolve, 1))
    if (state.fail) throw Object.assign(new Error('busy'), { code: '53300' })
    if (sql.includes('c.billing_status')) return { rows: [{ id: 'c', business_name: 'Practice', billing_status: 'active', type: 'subscription', monthly_cents: 10000, paid: true }] }
    return { rows: [] }
  } finally { state.active-- }
}) } }))
vi.mock('./store', () => ({
  partner: vi.fn(() => { throw new Error('Redundant partner read') }),
  rulesAt: vi.fn(async () => ({ monthly: { kind: 'percent', value: 1000 }, setup: { kind: 'flat', value: 0 }, oneTime: { kind: 'flat', value: 0 } })),
}))
import { affiliateReport } from './reports'
import type { Partner } from './store'
it('loads with one in-flight query, reuses the authorized partner, and recovers on explicit retry', async () => {
  const partner = { id: 'a', business_name: 'Partner', referral_code: 'code' } as Partner
  state.fail = true
  await expect(affiliateReport('a', partner)).rejects.toThrow('busy')
  state.fail = false
  const result = await affiliateReport('a', partner)
  expect(result.affiliate.id).toBe('a')
  expect(result.practices).toHaveLength(1)
  expect(result.practices[0].estimated_next_commission_cents).toBe(1000)
  expect(state.peak).toBe(1)
  expect(state.active).toBe(0)
})
