// Thin client stubs for the server actions in artifacts/api-server/src/actions/commissions.ts
import { action } from '@/lib/api'

export type CommissionSaleType = 'full_price' | 'setup_fee' | 'monthly' | 'refund'

export interface CommissionEntryView {
  id: string
  paymentHistoryId: string
  customerId: string
  linkId: string | null
  customerName: string
  businessName: string
  repId: string
  repName: string
  saleType: CommissionSaleType
  refundOf: Exclude<CommissionSaleType, 'refund'> | null
  description: string
  amountCents: number
  currency: string
  defaultRatePercent: number
  ratePercent: number
  commissionCents: number
  overridden: boolean
  overrideNote: string | null
  overriddenByName: string | null
  overriddenAt: string | null
  paidOutAt: string | null
  paidOutByName: string | null
  occurredAt: string
}

export interface CommissionTotals {
  entries: number
  collectedCents: number
  commissionCents: number
  paidOutCents: number
  unpaidCents: number
}

export interface CommissionReport {
  entries: CommissionEntryView[]
  totals: CommissionTotals
  reps: { id: string; name: string }[]
  filter: { repId: string | null; from: string | null; to: string | null; paid: 'paid' | 'unpaid' | null; saleType: CommissionSaleType | null }
  canManage: boolean
  viewerId: string
}

type Result<T> = ({ ok: true } & T) | { ok: false; error: string }

export const listCommissions = action<CommissionReport>('commissions', 'listCommissions')
export const overrideCommission = action<Result<{ entry: CommissionEntryView }>>('commissions', 'overrideCommission')
export const setCommissionsPaid = action<Result<{ updated: number }>>('commissions', 'setCommissionsPaid')
export const generateMissingCommissions = action<Result<{ scanned: number; created: number; skipped: Record<string, number> }>>(
  'commissions',
  'generateMissingCommissions',
)
