import type { CommissionSaleType, PaymentHistory, PaymentLinkTerms } from '@workspace/db'

/**
 * Pure commission rules (no database), unit-tested separately from the
 * ledger plumbing in ./commissions.ts.
 */

/** Round half away from zero so negative refunds mirror positive sales exactly. */
export function commissionFor(amountCents: number, ratePercent: number): number {
  const raw = (amountCents * ratePercent) / 100
  return Math.sign(raw) * Math.round(Math.abs(raw))
}

/** Only collected payments and refunds earn (or claw back) commission. */
export function isCommissionable(row: Pick<PaymentHistory, 'kind' | 'status'>): boolean {
  return (row.kind === 'invoice_paid' && row.status === 'succeeded') || (row.kind === 'refund' && row.status === 'refunded')
}

/** Which kind of sale a ledger row represents, given its link terms. */
export function saleTypeFor(
  row: Pick<PaymentHistory, 'stripeInvoiceId'>,
  terms: Pick<PaymentLinkTerms, 'type'> | null,
): Exclude<CommissionSaleType, 'refund'> {
  if (!terms || terms.type === 'one_time') return 'full_price'
  // Subscription links: recurring invoices are monthly; the one-off intent
  // that opened the subscription is the setup fee.
  return row.stripeInvoiceId ? 'monthly' : 'setup_fee'
}
