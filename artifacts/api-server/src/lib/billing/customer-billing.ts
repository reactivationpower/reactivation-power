import { randomBytes } from 'crypto'
import type Stripe from 'stripe'
import { and, desc, eq, gt } from 'drizzle-orm'
import {
  billingLinksTable,
  customerCardsTable,
  customersTable,
  db,
  paymentLinkTermsTable,
  type BillingLink,
  type BillingLinkPurpose,
  type Customer,
  type CustomerCard,
  type NewPaymentHistory,
  type PaymentLinkTerms,
} from '@workspace/db'

import { stripe } from '@/lib/stripe'
import { logger } from '@/lib/logger'
import { appOrigin } from '@/lib/app-origin'
import { getAdminClient } from '@/lib/supabase/admin'
import { contextForTerms, payInvoiceWith, recordHistory, restoreAccess, type SubscriptionContext } from './dunning'
import { isSameCard, remainingObligation, type RemainingObligation } from './rules'

/**
 * Customer-facing billing: what the owner sees on the portal Billing page and
 * on the public tokenized page (/billing/:token), plus the shared operations
 * behind both — settling the outstanding balance, adding a card, and the
 * expiring links that let a locked-out customer reach the page.
 *
 * Everything here is keyed on our own customer + agreement (payment link
 * terms) records; the browser only ever sends a token or a session cookie.
 */

export const BILLING_LINK_DAYS = 14

const newId = () => randomBytes(16).toString('hex')

// ── Resolving the customer ─────────────────────────────────────────────────

/** The customer record behind a portal owner (null when the owner never bought through a link). */
export async function customerForOwner(ownerParticipantId: string): Promise<Customer | null> {
  const [byParticipant] = await db
    .select()
    .from(customersTable)
    .where(eq(customersTable.participantId, ownerParticipantId))
    .limit(1)
  if (byParticipant) return byParticipant
  // Older accounts: resolve through the paid link and backfill the id.
  const { data: links } = await getAdminClient()
    .from('payment_links')
    .select('id')
    .eq('participant_id', ownerParticipantId)
    .limit(20)
  for (const link of links ?? []) {
    const [terms] = await db
      .select({ customerId: paymentLinkTermsTable.customerId })
      .from(paymentLinkTermsTable)
      .where(eq(paymentLinkTermsTable.linkId, String(link.id)))
      .limit(1)
    if (!terms) continue
    const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, terms.customerId)).limit(1)
    if (customer) {
      if (!customer.participantId) {
        await db.update(customersTable).set({ participantId: ownerParticipantId }).where(eq(customersTable.id, customer.id))
      }
      return customer
    }
  }
  return null
}

/**
 * The agreement that governs this customer's billing: the most recent
 * subscription that is not fully canceled, else the most recent subscription,
 * else the most recent link of any kind.
 */
export async function currentTermsForCustomer(customerId: string): Promise<PaymentLinkTerms | null> {
  const rows = await db
    .select()
    .from(paymentLinkTermsTable)
    .where(eq(paymentLinkTermsTable.customerId, customerId))
    .orderBy(desc(paymentLinkTermsTable.createdAt))
  const subs = rows.filter((r) => r.type === 'subscription' && r.stripeSubscriptionId)
  return subs.find((r) => r.subscriptionStatus !== 'canceled') ?? subs[0] ?? rows[0] ?? null
}

// ── Overview ───────────────────────────────────────────────────────────────

export interface OpenInvoiceSummary {
  id: string
  amountDueCents: number
  description: string
  dueAt: string | null
  hostedInvoiceUrl: string | null
}

export interface CardSummary {
  id: string
  brand: string
  last4: string
  exp_month: number | null
  exp_year: number | null
  rank: 'primary' | 'secondary'
  active: boolean
  added_at: string
}

export interface BillingOverview {
  customer: {
    id: string
    full_name: string
    business_name: string
    email: string
    billing_status: string
    billing_issue: string | null
    billing_blocked_at: string | null
  }
  agreement: {
    link_id: string
    type: 'one_time' | 'subscription'
    monthly_cents: number
    term_months: number
    setup_fee_cents: number
    subscription_status: string | null
    next_payment_at: string | null
    agreement_start: string | null
    agreement_end: string | null
    cancel_at: string | null
    canceled_at: string | null
  } | null
  /** Open (unpaid) invoices in Stripe, oldest first. */
  balance: { total_cents: number; invoices: OpenInvoiceSummary[]; stripe_error: string | null }
  cards: CardSummary[]
  /** What is still owed under the term if the customer cancels today. */
  obligation: { payments: number; total_cents: number; monthly_cents: number; agreement_end: string | null; dates: string[] }
  access_blocked: boolean
}

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null)

export function toCardSummary(c: CustomerCard): CardSummary {
  return {
    id: c.id,
    brand: c.brand,
    last4: c.last4,
    exp_month: c.expMonth,
    exp_year: c.expYear,
    rank: c.rank,
    active: c.active,
    added_at: c.createdAt.toISOString(),
  }
}

/** Every card ever entered for this agreement (active first, primary before secondary). */
export async function cardsForAgreement(customerId: string, linkId: string | null): Promise<CustomerCard[]> {
  const rows = await db
    .select()
    .from(customerCardsTable)
    .where(eq(customerCardsTable.customerId, customerId))
    .orderBy(desc(customerCardsTable.active), customerCardsTable.rank, desc(customerCardsTable.createdAt))
  const scoped = linkId ? rows.filter((c) => c.linkId === linkId) : rows
  return scoped.length ? scoped : rows
}

export async function openInvoicesFor(terms: PaymentLinkTerms | null): Promise<BillingOverview['balance']> {
  if (!terms?.stripeSubscriptionId) return { total_cents: 0, invoices: [], stripe_error: null }
  try {
    const list = await stripe.invoices.list({ subscription: terms.stripeSubscriptionId, status: 'open', limit: 20 })
    const invoices = list.data
      .sort((a, b) => a.created - b.created)
      .map((inv) => ({
        id: inv.id,
        amountDueCents: inv.amount_due,
        description: invoiceLabel(inv),
        dueAt: inv.due_date ? new Date(inv.due_date * 1000).toISOString() : new Date(inv.created * 1000).toISOString(),
        hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
      }))
    return { total_cents: invoices.reduce((sum, i) => sum + i.amountDueCents, 0), invoices, stripe_error: null }
  } catch (err) {
    logger.warn({ err, subscriptionId: terms.stripeSubscriptionId }, 'billing overview: could not list open invoices')
    return { total_cents: 0, invoices: [], stripe_error: 'We could not reach Stripe to check your balance. Please refresh in a moment.' }
  }
}

function invoiceLabel(invoice: Stripe.Invoice): string {
  const line = invoice.lines?.data?.[0]
  const period = line?.period
  if (period?.start && period?.end) {
    const fmt = (s: number) => new Date(s * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    return `Monthly access · ${fmt(period.start)} – ${fmt(period.end)}`
  }
  return invoice.description || 'Monthly access'
}

export function obligationFor(terms: PaymentLinkTerms | null, now = new Date()): RemainingObligation {
  if (!terms || terms.type !== 'subscription' || terms.subscriptionStatus === 'canceled') {
    return { payments: 0, totalCents: 0, dates: [], agreementEnd: terms?.agreementEnd ?? null }
  }
  return remainingObligation({
    nextPaymentAt: terms.nextPaymentAt,
    agreementEnd: terms.agreementEnd,
    monthlyCents: terms.monthlyCents,
    now,
  })
}

export async function buildOverview(customer: Customer, terms: PaymentLinkTerms | null): Promise<BillingOverview> {
  const [balance, cards] = await Promise.all([openInvoicesFor(terms), cardsForAgreement(customer.id, terms?.linkId ?? null)])
  const obligation = obligationFor(terms)
  return {
    customer: {
      id: customer.id,
      full_name: customer.fullName,
      business_name: customer.businessName,
      email: customer.email,
      billing_status: customer.billingStatus,
      billing_issue: customer.billingIssue,
      billing_blocked_at: iso(customer.billingBlockedAt),
    },
    agreement: terms
      ? {
          link_id: terms.linkId,
          type: terms.type,
          monthly_cents: terms.monthlyCents,
          term_months: terms.termMonths,
          setup_fee_cents: terms.setupFeeCents,
          subscription_status: terms.subscriptionStatus,
          next_payment_at: iso(terms.nextPaymentAt),
          agreement_start: iso(terms.agreementStart),
          agreement_end: iso(terms.agreementEnd),
          cancel_at: iso(terms.cancelAt),
          canceled_at: iso(terms.canceledAt),
        }
      : null,
    balance,
    cards: cards.map(toCardSummary),
    obligation: {
      payments: obligation.payments,
      total_cents: obligation.totalCents,
      monthly_cents: terms?.monthlyCents ?? 0,
      agreement_end: iso(obligation.agreementEnd),
      dates: obligation.dates.map((d) => d.toISOString()),
    },
    access_blocked: customer.billingStatus === 'past_due' || customer.billingStatus === 'canceled',
  }
}

// ── Paying the outstanding balance ─────────────────────────────────────────

export interface CollectResult {
  ok: boolean
  paidCents: number
  remainingCents: number
  message: string | null
}

/**
 * Try every open invoice on the cards on file (primary, then secondary, then
 * any card the caller asks to try first). Access is restored by
 * payInvoiceWith as soon as one invoice goes through.
 */
export async function collectOpenInvoices(
  ctx: SubscriptionContext,
  source: NewPaymentHistory['source'],
  preferred?: CustomerCard | null,
): Promise<CollectResult> {
  if (!ctx.terms.stripeSubscriptionId) return { ok: false, paidCents: 0, remainingCents: 0, message: 'No subscription on file.' }
  const open = (await stripe.invoices.list({ subscription: ctx.terms.stripeSubscriptionId, status: 'open', limit: 20 })).data.sort(
    (a, b) => a.created - b.created,
  )
  if (open.length === 0) {
    // Nothing owed — make sure a stale block is lifted.
    try {
      const sub = await stripe.subscriptions.retrieve(ctx.terms.stripeSubscriptionId)
      if (sub.status === 'active' || sub.status === 'trialing') await restoreAccess(ctx.customer.id, sub.status)
    } catch (err) {
      logger.warn({ err }, 'collect: could not check subscription')
    }
    return { ok: true, paidCents: 0, remainingCents: 0, message: null }
  }
  const order: CustomerCard[] = []
  if (preferred) order.push(preferred)
  for (const c of ctx.cards) if (!order.some((o) => o.id === c.id)) order.push(c)
  if (order.length === 0) return { ok: false, paidCents: 0, remainingCents: open.reduce((s, i) => s + i.amount_due, 0), message: 'There is no card on file to charge.' }

  let paidCents = 0
  let remainingCents = 0
  let lastMessage: string | null = null
  for (const invoice of open) {
    let paid = false
    for (const card of order) {
      const outcome = await payInvoiceWith(invoice, card, ctx, source)
      if (outcome.ok) {
        paid = true
        paidCents += invoice.amount_due
        break
      }
      lastMessage = outcome.message
    }
    if (!paid) remainingCents += invoice.amount_due
  }
  return { ok: remainingCents === 0, paidCents, remainingCents, message: remainingCents === 0 ? null : lastMessage }
}

// ── Adding a card ──────────────────────────────────────────────────────────

export const cardOf = (pm: Stripe.PaymentMethod) => ({
  brand: pm.card?.brand ?? 'card',
  last4: pm.card?.last4 ?? '',
  fingerprint: pm.card?.fingerprint ?? null,
  expMonth: pm.card?.exp_month ?? null,
  expYear: pm.card?.exp_year ?? null,
})

/** Stripe Customer for our record, created on first use. */
export async function ensureStripeCustomerFor(customer: Customer, terms: PaymentLinkTerms | null): Promise<string> {
  if (customer.stripeCustomerId) return customer.stripeCustomerId
  const created = await stripe.customers.create(
    {
      name: customer.fullName,
      email: customer.email,
      phone: customer.phone || undefined,
      description: customer.businessName || undefined,
      metadata: { rp_customer_id: customer.id, business_name: customer.businessName },
    },
    { idempotencyKey: `cus-${customer.id}-${Math.floor(Date.now() / 600000)}` },
  )
  await db.update(customersTable).set({ stripeCustomerId: created.id, updatedAt: new Date() }).where(eq(customersTable.id, customer.id))
  if (terms) await db.update(paymentLinkTermsTable).set({ stripeCustomerId: created.id }).where(eq(paymentLinkTermsTable.linkId, terms.linkId))
  return created.id
}

const REUSABLE = new Set(['requires_payment_method', 'requires_confirmation', 'requires_action', 'processing'])

/** A SetupIntent for a new card; reuses one that is still open. */
export async function setupIntentForNewCard(
  customer: Customer,
  terms: PaymentLinkTerms | null,
  existingId: string | null,
  metadata: Record<string, string>,
): Promise<Stripe.SetupIntent> {
  if (existingId) {
    try {
      const existing = await stripe.setupIntents.retrieve(existingId)
      if (REUSABLE.has(existing.status)) return existing
    } catch (err) {
      logger.warn({ err, existingId }, 'add card: could not reuse setup intent')
    }
  }
  const stripeCustomerId = await ensureStripeCustomerFor(customer, terms)
  return stripe.setupIntents.create({
    customer: stripeCustomerId,
    payment_method_types: ['card'],
    usage: 'off_session',
    metadata: { rp_customer_id: customer.id, rp_link_id: terms?.linkId ?? '', ...metadata },
  })
}

export interface AddCardOptions {
  /** Stop using the card being replaced (it stays on file, marked inactive). */
  retirePrevious: boolean
  actor: { source: NewPaymentHistory['source']; adminId?: string | null; adminName?: string | null }
}

export type AddCardResult =
  | { ok: true; card: CardSummary; collected: CollectResult | null }
  | { ok: false; error: string; duplicate?: boolean }

/**
 * Record a card whose SetupIntent has succeeded:
 *   - rejected when Stripe reports the same fingerprint as a card already in
 *     use for this agreement (the new payment method is detached again);
 *   - otherwise it becomes the primary card and the Stripe default;
 *   - the previous primary becomes the backup, and the previous backup is
 *     retired (kept on file, marked inactive). With `retirePrevious` the old
 *     primary is retired instead and the existing backup keeps its slot.
 *   - a retired card that comes back is reactivated, not duplicated.
 * Cards are never deleted from our records or detached from Stripe once they
 * have been used for billing.
 * If the customer has an open balance it is collected on the new card right
 * away, which restores access when it succeeds.
 */
export async function addCardFromSetupIntent(
  customer: Customer,
  terms: PaymentLinkTerms | null,
  setupIntentId: string,
  options: AddCardOptions,
): Promise<AddCardResult> {
  let intent: Stripe.SetupIntent
  try {
    intent = await stripe.setupIntents.retrieve(setupIntentId, { expand: ['payment_method'] })
  } catch {
    return { ok: false, error: 'We could not verify the card with Stripe. Please try again.' }
  }
  if (intent.status !== 'succeeded' || !intent.payment_method || typeof intent.payment_method === 'string') {
    return { ok: false, error: 'The card has not been saved yet. Please try again.' }
  }
  const pm = intent.payment_method
  const card = cardOf(pm)
  const linkId = terms?.linkId ?? null
  const all = await cardsForAgreement(customer.id, linkId)
  const scoped = all.filter((c) => (linkId ? c.linkId === linkId : true))
  const active = scoped.filter((c) => c.active)

  // Already recorded (retry of the same intent): report success.
  const same = scoped.find((c) => c.stripePaymentMethodId === pm.id)
  if (same?.active && same.rank === 'primary') return { ok: true, card: toCardSummary(same), collected: null }

  const dupe = active.find((c) => c.stripePaymentMethodId !== pm.id && isSameCard(c, { stripePaymentMethodId: pm.id, fingerprint: card.fingerprint }))
  if (dupe) {
    try {
      await stripe.paymentMethods.detach(pm.id)
    } catch (err) {
      logger.warn({ err, paymentMethodId: pm.id }, 'add card: could not detach duplicate')
    }
    return {
      ok: false,
      duplicate: true,
      error: `That card is already on file as your ${dupe.rank === 'primary' ? 'primary' : 'backup'} card (${dupe.brand} •••• ${dupe.last4}). Please enter a different card.`,
    }
  }

  const stripeCustomerId = await ensureStripeCustomerFor(customer, terms)
  await stripe.customers.update(stripeCustomerId, { invoice_settings: { default_payment_method: pm.id } })
  if (terms?.stripeSubscriptionId && terms.subscriptionStatus !== 'canceled') {
    try {
      await stripe.subscriptions.update(terms.stripeSubscriptionId, { default_payment_method: pm.id })
    } catch (err) {
      logger.warn({ err, subscriptionId: terms.stripeSubscriptionId }, 'add card: could not set subscription default')
    }
  }

  const now = new Date()
  const previousPrimary = active.find((c) => c.rank === 'primary' && c.stripePaymentMethodId !== pm.id) ?? null
  const previousSecondary = active.find((c) => c.rank === 'secondary' && c.stripePaymentMethodId !== pm.id) ?? null

  if (previousPrimary) {
    if (options.retirePrevious) {
      await db.update(customerCardsTable).set({ active: false }).where(eq(customerCardsTable.id, previousPrimary.id))
    } else {
      await db.update(customerCardsTable).set({ rank: 'secondary' }).where(eq(customerCardsTable.id, previousPrimary.id))
      if (previousSecondary) {
        await db.update(customerCardsTable).set({ active: false }).where(eq(customerCardsTable.id, previousSecondary.id))
      }
    }
  }

  // A previously retired card coming back is reactivated in place.
  const retired = scoped.find((c) => !c.active && (c.stripePaymentMethodId === pm.id || isSameCard(c, { stripePaymentMethodId: pm.id, fingerprint: card.fingerprint })))
  let saved: CustomerCard
  if (retired) {
    const [row] = await db
      .update(customerCardsTable)
      .set({ active: true, rank: 'primary', stripePaymentMethodId: pm.id, brand: card.brand, last4: card.last4, expMonth: card.expMonth, expYear: card.expYear, fingerprint: card.fingerprint })
      .where(eq(customerCardsTable.id, retired.id))
      .returning()
    saved = row
  } else {
    const [row] = await db
      .insert(customerCardsTable)
      .values({
        id: newId(),
        customerId: customer.id,
        linkId,
        stripePaymentMethodId: pm.id,
        fingerprint: card.fingerprint,
        brand: card.brand,
        last4: card.last4,
        expMonth: card.expMonth,
        expYear: card.expYear,
        rank: 'primary',
        active: true,
      })
      .returning()
    saved = row
  }

  const replaced = previousPrimary
    ? options.retirePrevious
      ? ` (replaces ${previousPrimary.brand} •••• ${previousPrimary.last4}, now inactive)`
      : ` (${previousPrimary.brand} •••• ${previousPrimary.last4} is now the backup)`
    : ''
  await recordHistory({
    customerId: customer.id,
    linkId,
    kind: 'card_added',
    status: 'info',
    description: `New primary card added — ${card.brand} •••• ${card.last4}${replaced}`,
    cardRank: 'primary',
    cardBrand: card.brand,
    cardLast4: card.last4,
    stripePaymentMethodId: pm.id,
    stripeSubscriptionId: terms?.stripeSubscriptionId ?? null,
    source: options.actor.source,
    actorAdminId: options.actor.adminId ?? null,
    actorAdminName: options.actor.adminName ?? null,
    occurredAt: now,
  })

  // Settle anything outstanding on the new card straight away.
  let collected: CollectResult | null = null
  if (terms?.stripeSubscriptionId && terms.subscriptionStatus !== 'canceled') {
    const ctx = await contextForTerms(terms)
    if (ctx) {
      try {
        collected = await collectOpenInvoices(ctx, options.actor.source, saved)
      } catch (err) {
        logger.warn({ err, customerId: customer.id }, 'add card: could not collect open invoices')
      }
    }
  }
  return { ok: true, card: toCardSummary(saved), collected }
}

// ── Tokenized billing links ────────────────────────────────────────────────

export interface CreatedBillingLink {
  token: string
  url: string
  expiresAt: Date
}

export async function createBillingLink(input: {
  customerId: string
  linkId: string | null
  purpose: BillingLinkPurpose
  createdById?: string | null
  createdByName?: string | null
}): Promise<CreatedBillingLink> {
  const token = randomBytes(24).toString('base64url')
  const expiresAt = new Date(Date.now() + BILLING_LINK_DAYS * 24 * 60 * 60 * 1000)
  await db.insert(billingLinksTable).values({
    id: newId(),
    token,
    customerId: input.customerId,
    linkId: input.linkId,
    purpose: input.purpose,
    createdById: input.createdById ?? null,
    createdByName: input.createdByName ?? null,
    expiresAt,
  })
  return { token, url: billingLinkUrl(token), expiresAt }
}

/**
 * Sliding-window throttle for the public "email me my billing link" form.
 * Keyed by email and by IP so one address cannot be flooded with mail and
 * one client cannot mint unbounded token rows. In-memory per process — a
 * restart clears it, which is acceptable for an abuse brake (not a quota).
 */
const REQUEST_WINDOW_MS = 60 * 60 * 1000
const REQUEST_LIMITS = { email: 3, ip: 10 } as const
const requestHits = new Map<string, number[]>()

export function billingLinkRequestAllowed(keys: { email: string; ip: string | null }, now = Date.now()): boolean {
  const checks: Array<[string, number]> = [[`email:${keys.email}`, REQUEST_LIMITS.email]]
  if (keys.ip) checks.push([`ip:${keys.ip}`, REQUEST_LIMITS.ip])
  const recent = checks.map(([key]) => (requestHits.get(key) ?? []).filter((t) => now - t < REQUEST_WINDOW_MS))
  const blocked = checks.some(([, limit], i) => recent[i].length >= limit)
  if (blocked) return false
  checks.forEach(([key], i) => requestHits.set(key, [...recent[i], now]))
  if (requestHits.size > 10_000) {
    for (const [key, hits] of requestHits) if (!hits.some((t) => now - t < REQUEST_WINDOW_MS)) requestHits.delete(key)
  }
  return true
}

/** Test hook. */
export function resetBillingLinkRequestThrottle(): void {
  requestHits.clear()
}

export function billingLinkUrl(token: string): string {
  return `${appOrigin()}/billing/${token}`
}

export interface ResolvedBillingLink {
  link: BillingLink
  customer: Customer
  terms: PaymentLinkTerms | null
}

/** A live (unexpired) billing link with its customer and agreement, or null. */
export async function resolveBillingLink(token: string): Promise<ResolvedBillingLink | null> {
  if (!token || token.length > 128) return null
  const [link] = await db
    .select()
    .from(billingLinksTable)
    .where(and(eq(billingLinksTable.token, token), gt(billingLinksTable.expiresAt, new Date())))
    .limit(1)
  if (!link) return null
  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, link.customerId)).limit(1)
  if (!customer) return null
  let terms: PaymentLinkTerms | null = null
  if (link.linkId) {
    const [t] = await db.select().from(paymentLinkTermsTable).where(eq(paymentLinkTermsTable.linkId, link.linkId)).limit(1)
    terms = t ?? null
  }
  if (!terms) terms = await currentTermsForCustomer(customer.id)
  void db.update(billingLinksTable).set({ lastUsedAt: new Date() }).where(eq(billingLinksTable.id, link.id)).catch(() => undefined)
  return { link, customer, terms }
}
