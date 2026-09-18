import { eq, inArray } from 'drizzle-orm'
import { commissionEntriesTable, db, type CommissionEntry, type CommissionSaleType } from '@workspace/db'

import { requireAdmin } from '@/lib/auth/admin-session'
import { listAdminUsers } from '@/lib/data/admin-users'
import {
  backfillCommissions,
  commissionFor,
  getCommissionEntries,
  getCommissionEntry,
  listCommissionEntries,
  listCommissionReps,
  type CommissionFilter,
  type CommissionTotals,
} from '@/lib/billing/commissions'

/**
 * Commission report actions. Any active admin can read; sales reps are
 * always scoped to their own entries. Overrides, payout marking and
 * backfill are super-admin only.
 */

type Result<T = Record<string, never>> = ({ ok: true } & T) | { ok: false; error: string }

const SALE_TYPES: CommissionSaleType[] = ['full_price', 'setup_fee', 'monthly', 'refund']

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

export interface CommissionReport {
  entries: CommissionEntryView[]
  totals: CommissionTotals
  reps: { id: string; name: string }[]
  filter: { repId: string | null; from: string | null; to: string | null; paid: 'paid' | 'unpaid' | null; saleType: CommissionSaleType | null }
  canManage: boolean
  viewerId: string
}

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null)

export function toView(e: CommissionEntry): CommissionEntryView {
  return {
    id: e.id,
    paymentHistoryId: e.paymentHistoryId,
    customerId: e.customerId,
    linkId: e.linkId,
    customerName: e.customerName,
    businessName: e.businessName,
    repId: e.repId,
    repName: e.repName,
    saleType: e.saleType,
    refundOf: e.refundOf,
    description: e.description,
    amountCents: e.amountCents,
    currency: e.currency,
    defaultRatePercent: e.defaultRatePercent,
    ratePercent: e.ratePercent,
    commissionCents: e.commissionCents,
    overridden: e.overridden,
    overrideNote: e.overrideNote,
    overriddenByName: e.overriddenByName,
    overriddenAt: iso(e.overriddenAt),
    paidOutAt: iso(e.paidOutAt),
    paidOutByName: e.paidOutByName,
    occurredAt: e.occurredAt.toISOString(),
  }
}

function cleanFilter(input: Partial<CommissionFilter> | undefined): CommissionFilter {
  const f = input ?? {}
  const saleType = f.saleType && SALE_TYPES.includes(f.saleType) ? f.saleType : null
  return {
    repId: typeof f.repId === 'string' && f.repId ? f.repId : null,
    from: typeof f.from === 'string' && f.from ? f.from : null,
    to: typeof f.to === 'string' && f.to ? f.to : null,
    paid: f.paid === 'paid' || f.paid === 'unpaid' ? f.paid : null,
    saleType,
  }
}

/** The report, scoped to the acting admin: reps only ever see their own entries. */
export async function listCommissions(input?: Partial<CommissionFilter>): Promise<CommissionReport> {
  const admin = await requireAdmin()
  const filter = cleanFilter(input)
  const canManage = admin.role === 'super_admin'
  if (!canManage) filter.repId = admin.userId
  const [{ entries, totals }, reps] = await Promise.all([
    listCommissionEntries(filter),
    canManage ? repsForFilter() : Promise.resolve([{ id: admin.userId, name: admin.name || admin.email }]),
  ])
  return {
    entries: entries.map(toView),
    totals,
    reps,
    filter: { repId: filter.repId ?? null, from: filter.from ?? null, to: filter.to ?? null, paid: filter.paid ?? null, saleType: filter.saleType ?? null },
    canManage,
    viewerId: admin.userId,
  }
}

/** Every admin account plus any rep that only appears in the ledger (e.g. a deactivated rep). */
async function repsForFilter(): Promise<{ id: string; name: string }[]> {
  const [team, inLedger] = await Promise.all([listAdminUsers(), listCommissionReps()])
  const byId = new Map<string, string>()
  for (const r of inLedger) byId.set(r.id, r.name)
  for (const m of team) byId.set(m.id, m.name || m.email)
  return [...byId.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Super admin: override the rate (recomputes the amount) or set the owed
 * amount directly for one entry. Passing neither clears the override and
 * restores the rep's default rate from the time of the sale.
 */
export async function overrideCommission(input: {
  id: string
  ratePercent?: number | null
  commissionCents?: number | null
  note?: string | null
}): Promise<Result<{ entry: CommissionEntryView }>> {
  const admin = await requireAdmin('super_admin')
  const entry = await getCommissionEntry(input.id)
  if (!entry) return { ok: false, error: 'Commission entry not found.' }
  if (entry.paidOutAt) return { ok: false, error: 'This entry has already been paid out. Unmark it first to change it.' }

  const hasRate = input.ratePercent != null
  const hasAmount = input.commissionCents != null
  let ratePercent = entry.defaultRatePercent
  let commissionCents = commissionFor(entry.amountCents, ratePercent)
  let overridden = false
  if (hasRate && hasAmount) return { ok: false, error: 'Override either the rate or the amount, not both.' }
  if (hasRate) {
    const rate = Number(input.ratePercent)
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) return { ok: false, error: 'Rate must be between 0 and 100 percent.' }
    ratePercent = rate
    commissionCents = commissionFor(entry.amountCents, rate)
    overridden = true
  } else if (hasAmount) {
    const cents = Math.round(Number(input.commissionCents))
    if (!Number.isFinite(cents)) return { ok: false, error: 'Enter a valid commission amount.' }
    if (entry.amountCents >= 0 && cents < 0) return { ok: false, error: 'Commission on a sale cannot be negative.' }
    if (entry.amountCents < 0 && cents > 0) return { ok: false, error: 'A refund adjustment cannot be positive.' }
    commissionCents = cents
    ratePercent = entry.amountCents === 0 ? entry.defaultRatePercent : Math.round((cents / entry.amountCents) * 100 * 1000) / 1000
    overridden = true
  }

  const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim().slice(0, 300) : null
  const now = new Date()
  const [updated] = await db
    .update(commissionEntriesTable)
    .set({
      ratePercent,
      commissionCents,
      overridden,
      overrideNote: overridden ? note : null,
      overriddenById: overridden ? admin.userId : null,
      overriddenByName: overridden ? admin.name || admin.email : null,
      overriddenAt: overridden ? now : null,
      updatedAt: now,
    })
    .where(eq(commissionEntriesTable.id, entry.id))
    .returning()
  return { ok: true, entry: toView(updated!) }
}

/** Super admin: mark entries paid out (or undo). */
export async function setCommissionsPaid(input: { ids: string[]; paid: boolean }): Promise<Result<{ updated: number }>> {
  const admin = await requireAdmin('super_admin')
  const ids = Array.isArray(input.ids) ? [...new Set(input.ids.filter((x): x is string => typeof x === 'string'))] : []
  if (!ids.length) return { ok: false, error: 'Select at least one entry.' }
  const existing = await getCommissionEntries(ids)
  if (existing.length !== ids.length) return { ok: false, error: 'Some entries no longer exist.' }
  const now = new Date()
  const rows = await db
    .update(commissionEntriesTable)
    .set(
      input.paid
        ? { paidOutAt: now, paidOutById: admin.userId, paidOutByName: admin.name || admin.email, updatedAt: now }
        : { paidOutAt: null, paidOutById: null, paidOutByName: null, updatedAt: now },
    )
    .where(inArray(commissionEntriesTable.id, ids))
    .returning({ id: commissionEntriesTable.id })
  return { ok: true, updated: rows.length }
}

/** Super admin: create entries for payments recorded before tracking existed. */
export async function generateMissingCommissions(): Promise<Result<{ scanned: number; created: number; skipped: Record<string, number> }>> {
  await requireAdmin('super_admin')
  const result = await backfillCommissions()
  return { ok: true, ...result }
}
