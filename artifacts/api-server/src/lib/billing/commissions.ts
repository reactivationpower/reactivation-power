import { randomBytes } from 'crypto'
import { and, desc, eq, inArray, isNull, notInArray, or, sql } from 'drizzle-orm'
import {
  commissionEntriesTable,
  customersTable,
  db,
  paymentHistoryTable,
  paymentLinkTermsTable,
  type CommissionEntry,
  type CommissionSaleType,
  type PaymentHistory,
} from '@workspace/db'

import { logger } from '@/lib/logger'
import { getAdminUserById } from '@/lib/data/admin-users'
import { commissionFor, isCommissionable, saleTypeFor } from './commission-rules'

export { commissionFor, isCommissionable, saleTypeFor } from './commission-rules'

/**
 * Commission ledger generation.
 *
 * Every collected payment in `payment_history` (full-price purchase, setup
 * fee, monthly invoice) produces one commission entry for the rep who created
 * the payment link, at that rep's default rate *at the time of the sale*.
 * Refunds produce a negative entry at the same rate the original sale used,
 * so a clawback always mirrors what was credited. Entries are keyed by the
 * ledger row, so re-running generation is idempotent.
 */

const newId = () => randomBytes(16).toString('hex')

/**
 * The commission entry for the sale a refund reverses (matched on charge,
 * then payment intent, then invoice).
 */
async function originalEntryForRefund(row: PaymentHistory): Promise<CommissionEntry | null> {
  const matchers = [
    row.stripeChargeId ? eq(paymentHistoryTable.stripeChargeId, row.stripeChargeId) : null,
    row.stripePaymentIntentId ? eq(paymentHistoryTable.stripePaymentIntentId, row.stripePaymentIntentId) : null,
    row.stripeInvoiceId ? eq(paymentHistoryTable.stripeInvoiceId, row.stripeInvoiceId) : null,
  ].filter((m): m is NonNullable<typeof m> => Boolean(m))
  if (!matchers.length) return null
  const [original] = await db
    .select({ id: paymentHistoryTable.id })
    .from(paymentHistoryTable)
    .where(and(or(...matchers), eq(paymentHistoryTable.kind, 'invoice_paid'), eq(paymentHistoryTable.status, 'succeeded')))
    .orderBy(desc(paymentHistoryTable.occurredAt))
    .limit(1)
  if (!original) return null
  const [entry] = await db
    .select()
    .from(commissionEntriesTable)
    .where(eq(commissionEntriesTable.paymentHistoryId, original.id))
    .limit(1)
  return entry ?? null
}

export type GenerateResult = { created: true; entry: CommissionEntry } | { created: false; reason: string }

/**
 * Create the commission entry for a ledger row if it does not exist yet.
 * Never throws: commission bookkeeping must not break payment handling.
 */
export async function generateCommissionForHistory(row: PaymentHistory): Promise<GenerateResult> {
  try {
    if (!isCommissionable(row)) return { created: false, reason: 'not a collected payment or refund' }
    const [existing] = await db
      .select({ id: commissionEntriesTable.id })
      .from(commissionEntriesTable)
      .where(eq(commissionEntriesTable.paymentHistoryId, row.id))
      .limit(1)
    if (existing) return { created: false, reason: 'already recorded' }
    if (!row.linkId) return { created: false, reason: 'no payment link on ledger row' }

    const [terms] = await db.select().from(paymentLinkTermsTable).where(eq(paymentLinkTermsTable.linkId, row.linkId)).limit(1)
    if (!terms?.repId) return { created: false, reason: 'link has no sales rep' }
    const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, row.customerId)).limit(1)

    let saleType: CommissionSaleType
    let refundOf: Exclude<CommissionSaleType, 'refund'> | null = null
    let amountCents = row.amountCents
    let ratePercent: number
    let defaultRatePercent: number

    if (row.kind === 'refund') {
      saleType = 'refund'
      amountCents = -Math.abs(row.amountCents)
      const original = await originalEntryForRefund(row)
      if (original) {
        refundOf = original.saleType === 'refund' ? (original.refundOf ?? 'full_price') : original.saleType
        ratePercent = original.ratePercent
        defaultRatePercent = original.defaultRatePercent
      } else {
        refundOf = saleTypeFor(row, terms)
        const rep = await getAdminUserById(terms.repId)
        defaultRatePercent = rep?.defaultCommissionRate ?? 0
        ratePercent = defaultRatePercent
      }
    } else {
      saleType = saleTypeFor(row, terms)
      const rep = await getAdminUserById(terms.repId)
      defaultRatePercent = rep?.defaultCommissionRate ?? 0
      ratePercent = defaultRatePercent
    }

    const [entry] = await db
      .insert(commissionEntriesTable)
      .values({
        id: newId(),
        paymentHistoryId: row.id,
        customerId: row.customerId,
        linkId: row.linkId,
        customerName: customer?.fullName ?? '',
        businessName: customer?.businessName ?? '',
        repId: terms.repId,
        repName: terms.repName ?? '',
        saleType,
        refundOf,
        description: row.description,
        amountCents,
        currency: row.currency,
        defaultRatePercent,
        ratePercent,
        commissionCents: commissionFor(amountCents, ratePercent),
        occurredAt: row.occurredAt,
      })
      .onConflictDoNothing()
      .returning()
    if (!entry) return { created: false, reason: 'already recorded' }
    return { created: true, entry }
  } catch (err) {
    logger.error({ err, historyId: row.id }, 'commission entry could not be generated')
    return { created: false, reason: err instanceof Error ? err.message : 'unknown error' }
  }
}

/**
 * Generate entries for every commissionable ledger row that has none yet
 * (payments recorded before commission tracking existed, or rows whose
 * generation failed). Sales are processed before refunds so a refund can
 * find the entry it reverses.
 */
export async function backfillCommissions(): Promise<{ scanned: number; created: number; skipped: Record<string, number> }> {
  const done = db.select({ id: commissionEntriesTable.paymentHistoryId }).from(commissionEntriesTable)
  const rows = await db
    .select()
    .from(paymentHistoryTable)
    .where(
      and(
        or(
          and(eq(paymentHistoryTable.kind, 'invoice_paid'), eq(paymentHistoryTable.status, 'succeeded')),
          and(eq(paymentHistoryTable.kind, 'refund'), eq(paymentHistoryTable.status, 'refunded')),
        ),
        notInArray(paymentHistoryTable.id, done),
      ),
    )
    .orderBy(paymentHistoryTable.occurredAt)
  const ordered = [...rows.filter((r) => r.kind !== 'refund'), ...rows.filter((r) => r.kind === 'refund')]
  let created = 0
  const skipped: Record<string, number> = {}
  for (const row of ordered) {
    const result = await generateCommissionForHistory(row)
    if (result.created) created++
    else skipped[result.reason] = (skipped[result.reason] ?? 0) + 1
  }
  return { scanned: rows.length, created, skipped }
}

// ── Reporting ──────────────────────────────────────────────────────────────

export interface CommissionFilter {
  repId?: string | null
  /** ISO timestamps (inclusive from, exclusive to). */
  from?: string | null
  to?: string | null
  /** "paid" | "unpaid" | undefined for all. */
  paid?: 'paid' | 'unpaid' | null
  saleType?: CommissionSaleType | null
}

export interface CommissionTotals {
  entries: number
  collectedCents: number
  commissionCents: number
  paidOutCents: number
  unpaidCents: number
}

function parseWhen(value: string | null | undefined): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export async function listCommissionEntries(filter: CommissionFilter): Promise<{ entries: CommissionEntry[]; totals: CommissionTotals }> {
  const conditions = []
  if (filter.repId) conditions.push(eq(commissionEntriesTable.repId, filter.repId))
  const from = parseWhen(filter.from)
  const to = parseWhen(filter.to)
  if (from) conditions.push(sql`${commissionEntriesTable.occurredAt} >= ${from}`)
  if (to) conditions.push(sql`${commissionEntriesTable.occurredAt} < ${to}`)
  if (filter.paid === 'paid') conditions.push(sql`${commissionEntriesTable.paidOutAt} is not null`)
  if (filter.paid === 'unpaid') conditions.push(isNull(commissionEntriesTable.paidOutAt))
  if (filter.saleType) conditions.push(eq(commissionEntriesTable.saleType, filter.saleType))

  const entries = await db
    .select()
    .from(commissionEntriesTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(commissionEntriesTable.occurredAt))
  const totals = entries.reduce<CommissionTotals>(
    (acc, e) => {
      acc.entries++
      acc.collectedCents += e.amountCents
      acc.commissionCents += e.commissionCents
      if (e.paidOutAt) acc.paidOutCents += e.commissionCents
      else acc.unpaidCents += e.commissionCents
      return acc
    },
    { entries: 0, collectedCents: 0, commissionCents: 0, paidOutCents: 0, unpaidCents: 0 },
  )
  return { entries, totals }
}

/** Distinct reps that appear in the ledger (for the filter dropdown). */
export async function listCommissionReps(): Promise<{ id: string; name: string }[]> {
  const rows = await db
    .select({ id: commissionEntriesTable.repId, name: sql<string>`max(${commissionEntriesTable.repName})` })
    .from(commissionEntriesTable)
    .groupBy(commissionEntriesTable.repId)
  return rows.map((r) => ({ id: r.id, name: r.name || r.id })).sort((a, b) => a.name.localeCompare(b.name))
}

export async function getCommissionEntry(id: string): Promise<CommissionEntry | null> {
  const [entry] = await db.select().from(commissionEntriesTable).where(eq(commissionEntriesTable.id, id)).limit(1)
  return entry ?? null
}

export async function getCommissionEntries(ids: string[]): Promise<CommissionEntry[]> {
  if (!ids.length) return []
  return db.select().from(commissionEntriesTable).where(inArray(commissionEntriesTable.id, ids))
}
