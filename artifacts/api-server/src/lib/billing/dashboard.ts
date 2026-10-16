/**
 * Super-admin billing dashboard: business-wide billing health computed from
 * the local billing tables (customers, payment_link_terms, customer_cards,
 * payment_history). `computeBillingDashboard` is pure so the arithmetic can
 * be unit-tested; `getBillingDashboard` feeds it from Postgres.
 */
import { and, desc, eq } from 'drizzle-orm'
import {
  customerCardsTable,
  customersTable,
  db,
  paymentHistoryTable,
  paymentLinkTermsTable,
  type Customer,
  type CustomerCard,
  type PaymentHistory,
  type PaymentLinkTerms,
} from '@workspace/db'

const DAY_MS = 24 * 60 * 60 * 1000
export const UPCOMING_WINDOW_DAYS = 30

/** Stripe subscription statuses that still count toward recurring revenue. */
const MRR_STATUSES = new Set(['active', 'trialing', 'past_due'])

export interface DateRange {
  from: Date
  /** Exclusive upper bound. */
  to: Date
}

export interface RangeQuery {
  from?: string
  to?: string
}

/**
 * Parse ?from=YYYY-MM-DD&to=YYYY-MM-DD (inclusive calendar days, UTC) into a
 * half-open range. Defaults to the last 30 days ending today. A `to` before
 * `from` is swapped so the range is never empty by accident.
 */
export function parseDateRange(query: RangeQuery, now = new Date()): DateRange & { fromDay: string; toDay: string } {
  const today = startOfUtcDay(now)
  const parse = (v: string | undefined): Date | null => {
    if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
    const d = new Date(`${v}T00:00:00.000Z`)
    return Number.isNaN(d.getTime()) ? null : d
  }
  let fromDay = parse(query.from) ?? new Date(today.getTime() - 29 * DAY_MS)
  let toDay = parse(query.to) ?? today
  if (toDay < fromDay) [fromDay, toDay] = [toDay, fromDay]
  return {
    from: fromDay,
    to: new Date(toDay.getTime() + DAY_MS),
    fromDay: dayString(fromDay),
    toDay: dayString(toDay),
  }
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}
function dayString(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null
}

export interface DashboardInput {
  customers: Customer[]
  terms: PaymentLinkTerms[]
  cards: CustomerCard[]
  history: PaymentHistory[]
  range: DateRange
  now: Date
}

export interface CardSummary {
  rank: 'primary' | 'secondary'
  brand: string
  last4: string
  exp_month: number | null
  exp_year: number | null
}

export interface CustomerRow {
  id: string
  full_name: string
  business_name: string
  email: string
  billing_status: string
  billing_issue: string | null
  billing_blocked_at: string | null
  /** The link governing this customer's billing today — the admin "customer record". */
  link_id: string | null
  plan: 'one_time' | 'subscription' | null
  monthly_cents: number
  subscription_status: string | null
  next_payment_at: string | null
  cancel_at: string | null
  cards: CardSummary[]
  /** Sum of invoices that failed and were never paid. */
  outstanding_cents: number
  last_failed_at: string | null
  last_failure_message: string | null
  /** Lifetime net cash from this customer. */
  collected_cents: number
}

export interface UpcomingPayment {
  customer_id: string
  link_id: string
  customer_name: string
  business_name: string
  amount_cents: number
  due_at: string
  subscription_status: string | null
  /** Primary card that will be charged, when on file. */
  card: CardSummary | null
}

export interface FailedPaymentRow {
  id: string
  customer_id: string
  link_id: string | null
  customer_name: string
  business_name: string
  amount_cents: number
  failure_message: string | null
  card_rank: string | null
  card_brand: string | null
  card_last4: string | null
  occurred_at: string
  /** True when a later succeeded row exists for the same invoice. */
  recovered: boolean
}

export interface BillingDashboard {
  metrics: {
    /** Succeeded charges minus refunds in range. */
    collected_cents: number
    gross_cents: number
    refunded_cents: number
    collected_count: number
    refund_count: number
    failed_count: number
    failed_cents: number
    /** Distinct customers with a failed charge in range. */
    failed_customers: number
    /** Recurring revenue right now, from live subscriptions. */
    mrr_cents: number
    mrr_subscriptions: number
    /** Unpaid failed invoices across all customers, right now. */
    outstanding_cents: number
    outstanding_customers: number
    past_due_customers: number
    active_customers: number
    /** Everything due in the next 30 days. */
    upcoming_cents: number
    upcoming_count: number
  }
  upcoming: UpcomingPayment[]
  failed: FailedPaymentRow[]
  pastDue: CustomerRow[]
  customers: CustomerRow[]
}

function inRange(d: Date, range: DateRange): boolean {
  return d >= range.from && d < range.to
}

function toCardSummary(c: CustomerCard): CardSummary {
  return { rank: c.rank, brand: c.brand, last4: c.last4, exp_month: c.expMonth, exp_year: c.expYear }
}

/** Ids of Stripe invoices that have a succeeded row (paid at some point). */
function paidInvoiceIds(history: PaymentHistory[]): Set<string> {
  const paid = new Set<string>()
  for (const h of history) if (h.status === 'succeeded' && h.stripeInvoiceId) paid.add(h.stripeInvoiceId)
  return paid
}

/**
 * Outstanding = latest failed attempt per invoice, for invoices never paid,
 * excluding customers whose subscription has been canceled (Stripe voids the
 * invoice on cancel, so nothing is collectable there).
 */
function outstandingByCustomer(history: PaymentHistory[], paid: Set<string>, canceledCustomers: Set<string>): Map<string, number> {
  const perInvoice = new Map<string, { customerId: string; amount: number; at: number }>()
  const out = new Map<string, number>()
  for (const h of history) {
    if (h.status !== 'failed' || canceledCustomers.has(h.customerId)) continue
    const key = h.stripeInvoiceId ?? h.stripePaymentIntentId ?? h.id
    if (h.stripeInvoiceId && paid.has(h.stripeInvoiceId)) continue
    const at = h.occurredAt.getTime()
    const cur = perInvoice.get(key)
    if (!cur || at > cur.at) perInvoice.set(key, { customerId: h.customerId, amount: h.amountCents, at })
  }
  for (const { customerId, amount } of perInvoice.values()) out.set(customerId, (out.get(customerId) ?? 0) + amount)
  return out
}

/**
 * Rank a link by how much it governs the customer's billing right now:
 * a delinquent subscription beats a live one, which beats a completed
 * agreement (paid one-time or ended subscription), which beats a link that
 * was never completed. Ties go to the newest link. This keeps a repeat
 * customer's row pointing at their real subscription even after a newer
 * pending or one-time link is created for them.
 */
function termsPriority(t: PaymentLinkTerms): number {
  const isSub = t.type === 'subscription' && Boolean(t.stripeSubscriptionId) && !t.canceledAt
  if (isSub && t.subscriptionStatus === 'past_due') return 4
  if (isSub && t.subscriptionStatus && MRR_STATUSES.has(t.subscriptionStatus)) return 3
  if (t.completedAt || t.setupPaidAt) return 2
  return 1
}

export function relevantTermsByCustomer(terms: PaymentLinkTerms[]): Map<string, PaymentLinkTerms> {
  const best = new Map<string, PaymentLinkTerms>()
  for (const t of terms) {
    const cur = best.get(t.customerId)
    if (!cur) { best.set(t.customerId, t); continue }
    const a = termsPriority(t), b = termsPriority(cur)
    if (a > b || (a === b && t.createdAt > cur.createdAt)) best.set(t.customerId, t)
  }
  return best
}

export function computeBillingDashboard(input: DashboardInput): BillingDashboard {
  const { customers, terms, cards, history, range, now } = input
  const customerById = new Map(customers.map((c) => [c.id, c]))

  // The billing record per customer = the link that governs their billing
  // today, not simply the newest one (see `relevantTermsByCustomer`).
  const latestTerms = relevantTermsByCustomer(terms)
  const cardsByCustomer = new Map<string, CardSummary[]>()
  for (const c of cards) {
    if (!c.active) continue
    const list = cardsByCustomer.get(c.customerId) ?? []
    list.push(toCardSummary(c))
    cardsByCustomer.set(c.customerId, list)
  }
  for (const list of cardsByCustomer.values()) list.sort((a, b) => (a.rank === b.rank ? 0 : a.rank === 'primary' ? -1 : 1))

  // ── Range metrics from the ledger ────────────────────────────────────
  let gross = 0, refunded = 0, collectedCount = 0, refundCount = 0, failedCount = 0, failedCents = 0
  const failedCustomerIds = new Set<string>()
  const paid = paidInvoiceIds(history)
  const collectedLifetime = new Map<string, number>()
  const lastFailure = new Map<string, PaymentHistory>()
  const failedRows: FailedPaymentRow[] = []
  for (const h of history) {
    if (h.status === 'succeeded') collectedLifetime.set(h.customerId, (collectedLifetime.get(h.customerId) ?? 0) + h.amountCents)
    if (h.status === 'refunded') collectedLifetime.set(h.customerId, (collectedLifetime.get(h.customerId) ?? 0) - h.amountCents)
    if (h.status === 'failed') {
      const prev = lastFailure.get(h.customerId)
      if (!prev || h.occurredAt > prev.occurredAt) lastFailure.set(h.customerId, h)
    }
    if (!inRange(h.occurredAt, range)) continue
    if (h.status === 'succeeded') { gross += h.amountCents; collectedCount++ }
    else if (h.status === 'refunded') { refunded += h.amountCents; refundCount++ }
    else if (h.status === 'failed') {
      failedCount++; failedCents += h.amountCents; failedCustomerIds.add(h.customerId)
      const customer = customerById.get(h.customerId)
      failedRows.push({
        id: h.id,
        customer_id: h.customerId,
        link_id: h.linkId ?? latestTerms.get(h.customerId)?.linkId ?? null,
        customer_name: customer?.fullName ?? 'Unknown customer',
        business_name: customer?.businessName ?? '',
        amount_cents: h.amountCents,
        failure_message: h.failureMessage,
        card_rank: h.cardRank,
        card_brand: h.cardBrand,
        card_last4: h.cardLast4,
        occurred_at: h.occurredAt.toISOString(),
        recovered: Boolean(h.stripeInvoiceId && paid.has(h.stripeInvoiceId)),
      })
    }
  }
  failedRows.sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1))

  // ── Point-in-time metrics from customers + terms ─────────────────────
  const canceledCustomers = new Set(customers.filter((c) => c.billingStatus === 'canceled').map((c) => c.id))
  const outstanding = outstandingByCustomer(history, paid, canceledCustomers)

  let mrr = 0, mrrSubs = 0
  const upcoming: UpcomingPayment[] = []
  const horizon = new Date(now.getTime() + UPCOMING_WINDOW_DAYS * DAY_MS)
  for (const t of terms) {
    if (t.type !== 'subscription' || !t.stripeSubscriptionId || t.canceledAt) continue
    const live = t.subscriptionStatus ? MRR_STATUSES.has(t.subscriptionStatus) : false
    if (!live) continue
    mrr += t.monthlyCents
    mrrSubs++
    const due = t.nextPaymentAt
    if (!due || due < now || due > horizon) continue
    // A cancellation scheduled before the due date means no charge happens.
    if (t.cancelAt && t.cancelAt <= due) continue
    const customer = customerById.get(t.customerId)
    const primary = (cardsByCustomer.get(t.customerId) ?? []).find((c) => c.rank === 'primary') ?? null
    upcoming.push({
      customer_id: t.customerId,
      link_id: t.linkId,
      customer_name: customer?.fullName ?? 'Unknown customer',
      business_name: customer?.businessName ?? '',
      amount_cents: t.monthlyCents,
      due_at: due.toISOString(),
      subscription_status: t.subscriptionStatus,
      card: primary,
    })
  }
  upcoming.sort((a, b) => (a.due_at < b.due_at ? -1 : 1))

  const rows: CustomerRow[] = customers.map((c) => {
    const t = latestTerms.get(c.id) ?? null
    const failure = lastFailure.get(c.id) ?? null
    return {
      id: c.id,
      full_name: c.fullName,
      business_name: c.businessName,
      email: c.email,
      billing_status: c.billingStatus,
      billing_issue: c.billingIssue,
      billing_blocked_at: iso(c.billingBlockedAt),
      // A customer who owes money is sent to the agreement that declined.
      link_id: (outstanding.get(c.id) ? failure?.linkId : null) ?? t?.linkId ?? null,
      plan: t?.type ?? null,
      monthly_cents: t?.type === 'subscription' ? t.monthlyCents : 0,
      subscription_status: t?.subscriptionStatus ?? null,
      next_payment_at: iso(t?.nextPaymentAt),
      cancel_at: iso(t?.cancelAt),
      cards: cardsByCustomer.get(c.id) ?? [],
      outstanding_cents: outstanding.get(c.id) ?? 0,
      last_failed_at: iso(failure?.occurredAt),
      last_failure_message: failure?.failureMessage ?? null,
      collected_cents: collectedLifetime.get(c.id) ?? 0,
    }
  })
  rows.sort((a, b) => a.full_name.localeCompare(b.full_name))
  const pastDue = rows
    .filter((r) => r.billing_status === 'past_due' || r.outstanding_cents > 0)
    .sort((a, b) => (b.last_failed_at ?? '') < (a.last_failed_at ?? '') ? -1 : 1)

  let outstandingCents = 0
  for (const v of outstanding.values()) outstandingCents += v

  return {
    metrics: {
      collected_cents: gross - refunded,
      gross_cents: gross,
      refunded_cents: refunded,
      collected_count: collectedCount,
      refund_count: refundCount,
      failed_count: failedCount,
      failed_cents: failedCents,
      failed_customers: failedCustomerIds.size,
      mrr_cents: mrr,
      mrr_subscriptions: mrrSubs,
      outstanding_cents: outstandingCents,
      outstanding_customers: outstanding.size,
      past_due_customers: rows.filter((r) => r.billing_status === 'past_due').length,
      active_customers: rows.filter((r) => r.billing_status === 'active' || r.billing_status === 'trialing').length,
      upcoming_cents: upcoming.reduce((sum, u) => sum + u.amount_cents, 0),
      upcoming_count: upcoming.length,
    },
    upcoming,
    failed: failedRows,
    pastDue,
    customers: rows,
  }
}

/** Load every billing table and compute the dashboard for the range. */
export async function getBillingDashboard(range: DateRange, now = new Date()): Promise<BillingDashboard> {
  const [customers, terms, cards, history] = await Promise.all([
    db.select().from(customersTable),
    db.select().from(paymentLinkTermsTable),
    db.select().from(customerCardsTable).where(and(eq(customerCardsTable.active, true))),
    db.select().from(paymentHistoryTable).orderBy(desc(paymentHistoryTable.occurredAt)),
  ])
  return computeBillingDashboard({ customers, terms, cards, history, range, now })
}
