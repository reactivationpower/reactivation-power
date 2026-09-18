import { randomBytes } from 'crypto'
import type Stripe from 'stripe'
import { and, desc, eq, isNull } from 'drizzle-orm'
import {
  customerCardsTable,
  customersTable,
  db,
  paymentHistoryTable,
  paymentLinkTermsTable,
  type Customer,
  type CustomerCard,
  type NewPaymentHistory,
  type PaymentLinkTerms,
} from '@workspace/db'

import { stripe } from '@/lib/stripe'
import { logger } from '@/lib/logger'
import { getAdminClient } from '@/lib/supabase/admin'
import { billingStatusAfterPayment, cardToRetry, isAccessBlocked, reconcileAccess, subscriptionNextPaymentAt } from './rules'
import { generateCommissionForHistory, isCommissionable } from './commissions'

/**
 * Failed-payment policy ("dunning") and the billing ledger.
 *
 *   1. Stripe charges the primary card. If that fails we immediately pay the
 *      same invoice with the secondary card.
 *   2. If both cards fail the customer is `past_due`, portal access for the
 *      owner and every staff account is shut off, and the login page shows a
 *      billing notice until an invoice is paid.
 *   3. A daily cron re-attempts every open invoice on both cards; any
 *      successful payment (ours or a card update paid through Stripe)
 *      restores access.
 *
 * Stripe's own retry schedule must be turned off in the Dashboard (Billing →
 * Subscriptions and emails → Manage failed payments → "Do not retry") so the
 * app is the only thing retrying. Everything here is idempotent so a Stripe
 * retry that slips through still leaves the ledger consistent.
 */

export interface SubscriptionContext {
  terms: PaymentLinkTerms
  customer: Customer
  cards: CustomerCard[]
}

const newId = () => randomBytes(16).toString('hex')

/** Resolve our records for a Stripe subscription id. */
export async function contextForSubscription(subscriptionId: string): Promise<SubscriptionContext | null> {
  const [terms] = await db
    .select()
    .from(paymentLinkTermsTable)
    .where(eq(paymentLinkTermsTable.stripeSubscriptionId, subscriptionId))
    .limit(1)
  if (!terms) return null
  return contextForTerms(terms)
}

export async function contextForTerms(terms: PaymentLinkTerms): Promise<SubscriptionContext | null> {
  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, terms.customerId)).limit(1)
  if (!customer) return null
  const cards = await db
    .select()
    .from(customerCardsTable)
    .where(and(eq(customerCardsTable.customerId, customer.id), eq(customerCardsTable.active, true)))
    .orderBy(customerCardsTable.rank)
  // Cards are scoped to the agreement (link) they were entered for.
  const scoped = cards.filter((c) => c.linkId === terms.linkId)
  return { terms, customer, cards: scoped.length ? scoped : cards }
}

/** Resolve our records for a Stripe customer id (one-time purchases, refunds). */
export async function customerForStripeId(stripeCustomerId: string): Promise<Customer | null> {
  const [customer] = await db
    .select()
    .from(customersTable)
    .where(eq(customersTable.stripeCustomerId, stripeCustomerId))
    .limit(1)
  return customer ?? null
}

/** The subscription id an invoice belongs to (new-style `parent` or legacy field). */
export function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const sub = invoice.parent?.subscription_details?.subscription
  if (sub) return typeof sub === 'string' ? sub : sub.id
  const legacy = (invoice as unknown as { subscription?: string | { id: string } | null }).subscription
  if (legacy) return typeof legacy === 'string' ? legacy : legacy.id
  return null
}

export interface CardUsed {
  paymentMethodId: string | null
  brand: string | null
  last4: string | null
  chargeId: string | null
  paymentIntentId: string | null
  failureMessage: string | null
}

/** The PaymentIntent behind an invoice's most recent payment attempt. */
export async function latestInvoiceAttempt(invoice: Stripe.Invoice): Promise<CardUsed> {
  const empty: CardUsed = {
    paymentMethodId: null,
    brand: null,
    last4: null,
    chargeId: null,
    paymentIntentId: null,
    failureMessage: null,
  }
  let paymentIntentId: string | null = null
  const payments = invoice.payments?.data ?? []
  const last = payments[payments.length - 1]
  if (last?.payment?.payment_intent) {
    const pi = last.payment.payment_intent
    paymentIntentId = typeof pi === 'string' ? pi : pi.id
  }
  if (!paymentIntentId) {
    const legacy = (invoice as unknown as { payment_intent?: string | { id: string } | null }).payment_intent
    if (legacy) paymentIntentId = typeof legacy === 'string' ? legacy : legacy.id
  }
  if (!paymentIntentId) return empty
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['payment_method', 'latest_charge'] })
    return cardFromIntent(pi)
  } catch (err) {
    logger.warn({ err, paymentIntentId }, 'could not load invoice payment intent')
    return { ...empty, paymentIntentId }
  }
}

export function cardFromIntent(pi: Stripe.PaymentIntent): CardUsed {
  const pm = pi.payment_method && typeof pi.payment_method !== 'string' ? pi.payment_method : null
  const charge = pi.latest_charge && typeof pi.latest_charge !== 'string' ? pi.latest_charge : null
  const pmId = pm?.id ?? (typeof pi.payment_method === 'string' ? pi.payment_method : null)
  return {
    paymentMethodId: pmId ?? pi.last_payment_error?.payment_method?.id ?? null,
    brand: pm?.card?.brand ?? charge?.payment_method_details?.card?.brand ?? null,
    last4: pm?.card?.last4 ?? charge?.payment_method_details?.card?.last4 ?? null,
    chargeId: charge?.id ?? (typeof pi.latest_charge === 'string' ? pi.latest_charge : null),
    paymentIntentId: pi.id,
    failureMessage: pi.last_payment_error?.message ?? charge?.failure_message ?? null,
  }
}

function rankOf(cards: CustomerCard[], paymentMethodId: string | null): CustomerCard | null {
  if (!paymentMethodId) return null
  return cards.find((c) => c.stripePaymentMethodId === paymentMethodId) ?? null
}

/**
 * Append a ledger row. Collected payments and refunds also produce their
 * commission entry here, so every path that writes the ledger (checkout,
 * webhooks, dunning retries, admin refunds) is covered.
 */
export async function recordHistory(row: Omit<NewPaymentHistory, 'id'>): Promise<void> {
  const [inserted] = await db.insert(paymentHistoryTable).values({ id: newId(), ...row }).onConflictDoNothing().returning()
  if (inserted && isCommissionable(inserted)) await generateCommissionForHistory(inserted)
}

/** Payment method ids that have a recorded decline on this invoice. */
export async function failedCardsForInvoice(invoiceId: string): Promise<Set<string>> {
  const rows = await db
    .select({ pm: paymentHistoryTable.stripePaymentMethodId })
    .from(paymentHistoryTable)
    .where(and(eq(paymentHistoryTable.stripeInvoiceId, invoiceId), eq(paymentHistoryTable.kind, 'invoice_failed')))
  return new Set(rows.map((r) => r.pm).filter((pm): pm is string => Boolean(pm)))
}

async function hasHistory(where: ReturnType<typeof and>): Promise<boolean> {
  const [row] = await db.select({ id: paymentHistoryTable.id }).from(paymentHistoryTable).where(where).limit(1)
  return Boolean(row)
}

/** Ledger fields describing the card behind an attempt. */
function cardFields(cards: CustomerCard[], used: CardUsed) {
  const known = rankOf(cards, used.paymentMethodId)
  return {
    cardRank: known?.rank ?? null,
    cardBrand: used.brand ?? known?.brand ?? null,
    cardLast4: used.last4 ?? known?.last4 ?? null,
    stripePaymentMethodId: used.paymentMethodId,
    stripePaymentIntentId: used.paymentIntentId,
    stripeChargeId: used.chargeId,
  }
}

// ── Access shutoff / restore ───────────────────────────────────────────────

/** Shut the customer's portal off: past_due + notice reason. */
export async function blockAccess(customer: Customer, reason: string | null): Promise<void> {
  await db
    .update(customersTable)
    .set({
      billingStatus: 'past_due',
      billingBlockedAt: customer.billingBlockedAt ?? new Date(),
      billingIssue: reason?.slice(0, 500) ?? 'Your most recent payment did not go through.',
      updatedAt: new Date(),
    })
    .where(eq(customersTable.id, customer.id))
  logger.warn({ customerId: customer.id }, 'billing: portal access blocked')
}

/** A successful payment (or an admin fix) turns the portal back on. */
export async function restoreAccess(customerId: string, subscriptionStatus: string | null): Promise<void> {
  await db
    .update(customersTable)
    .set({
      billingStatus: billingStatusAfterPayment(subscriptionStatus),
      billingBlockedAt: null,
      billingIssue: null,
      updatedAt: new Date(),
    })
    .where(eq(customersTable.id, customerId))
}

// ── Invoice events ─────────────────────────────────────────────────────────

export interface HandleResult {
  handled: boolean
  note?: string
}

/** invoice.paid / invoice.payment_succeeded: ledger + restore access. */
export async function handleInvoicePaid(invoice: Stripe.Invoice, eventId: string | null, source: NewPaymentHistory['source'] = 'webhook'): Promise<HandleResult> {
  const subscriptionId = invoiceSubscriptionId(invoice)
  if (!subscriptionId) return { handled: false, note: 'not a subscription invoice' }
  const ctx = await contextForSubscription(subscriptionId)
  if (!ctx) return { handled: false, note: 'unknown subscription' }

  const already = await hasHistory(
    and(eq(paymentHistoryTable.stripeInvoiceId, invoice.id), eq(paymentHistoryTable.kind, 'invoice_paid')),
  )
  if (!already) {
    const used = await latestInvoiceAttempt(invoice)
    await recordHistory({
      customerId: ctx.customer.id,
      linkId: ctx.terms.linkId,
      kind: 'invoice_paid',
      status: 'succeeded',
      amountCents: invoice.amount_paid,
      currency: invoice.currency,
      description: invoiceDescription(invoice),
      ...cardFields(ctx.cards, used),
      stripeEventId: eventId,
      stripeInvoiceId: invoice.id,
      stripeSubscriptionId: subscriptionId,
      source,
      occurredAt: new Date((invoice.status_transitions?.paid_at ?? invoice.created) * 1000),
    })
  }

  // Restore access + refresh the next payment date from Stripe.
  let subStatus: string | null = ctx.terms.subscriptionStatus
  try {
    const sub = await stripe.subscriptions.retrieve(subscriptionId)
    subStatus = sub.status
    await syncSubscriptionRecord(sub, ctx)
  } catch (err) {
    logger.warn({ err, subscriptionId }, 'could not refresh subscription after payment')
  }
  if (isAccessBlocked(ctx.customer.billingStatus) || ctx.customer.billingBlockedAt) {
    await restoreAccess(ctx.customer.id, subStatus)
    logger.info({ customerId: ctx.customer.id }, 'billing: portal access restored')
  } else if (!['active', 'trialing'].includes(ctx.customer.billingStatus)) {
    await restoreAccess(ctx.customer.id, subStatus)
  }
  return { handled: true }
}

/**
 * invoice.payment_failed: record the decline, retry on the other card right
 * away, and shut access off when nothing works.
 */
export async function handleInvoicePaymentFailed(invoice: Stripe.Invoice, eventId: string | null): Promise<HandleResult> {
  const subscriptionId = invoiceSubscriptionId(invoice)
  if (!subscriptionId) return { handled: false, note: 'not a subscription invoice' }
  const ctx = await contextForSubscription(subscriptionId)
  if (!ctx) return { handled: false, note: 'unknown subscription' }

  // Stripe may deliver payment_failed after we already collected the invoice.
  const fresh = await stripe.invoices.retrieve(invoice.id, { expand: ['payments'] })
  if (fresh.status === 'paid') return { handled: true, note: 'invoice already paid' }

  const used = await latestInvoiceAttempt(fresh)
  const alreadyLogged = used.paymentIntentId
    ? await hasHistory(
        and(
          eq(paymentHistoryTable.stripePaymentIntentId, used.paymentIntentId),
          eq(paymentHistoryTable.kind, 'invoice_failed'),
          used.paymentMethodId
            ? eq(paymentHistoryTable.stripePaymentMethodId, used.paymentMethodId)
            : isNull(paymentHistoryTable.stripePaymentMethodId),
        ),
      )
    : false
  if (!alreadyLogged) {
    await recordHistory({
      customerId: ctx.customer.id,
      linkId: ctx.terms.linkId,
      kind: 'invoice_failed',
      status: 'failed',
      amountCents: fresh.amount_due,
      currency: fresh.currency,
      description: invoiceDescription(fresh),
      failureMessage: used.failureMessage,
      ...cardFields(ctx.cards, used),
      stripeEventId: eventId,
      stripeInvoiceId: fresh.id,
      stripeSubscriptionId: subscriptionId,
      source: 'webhook',
      occurredAt: new Date(),
    })
  }

  // Every card that has already declined on this invoice (this event, our
  // own earlier retry, a cron pass, a Stripe-side retry) — each card gets one
  // attempt per invoice, then the account is shut off.
  const failedCards = await failedCardsForInvoice(fresh.id)
  failedCards.add(used.paymentMethodId ?? '')
  const retryCard = cardToRetry(ctx.cards, failedCards)
  if (retryCard) {
    const outcome = await payInvoiceWith(fresh, retryCard, ctx, 'dunning')
    if (outcome.ok) return { handled: true, note: `paid with ${retryCard.rank} card` }
  }
  await blockAccess(ctx.customer, used.failureMessage)
  await db
    .update(paymentLinkTermsTable)
    .set({ subscriptionStatus: 'past_due' })
    .where(eq(paymentLinkTermsTable.linkId, ctx.terms.linkId))
  const note = retryCard
    ? 'both cards failed; access blocked'
    : ctx.cards.length > 1
      ? 'both cards already declined on this invoice; access blocked'
      : 'no backup card; access blocked'
  return { handled: true, note }
}

export interface PayOutcome {
  ok: boolean
  message: string | null
}

/** Try to pay an open invoice with one specific card, recording the outcome. */
export async function payInvoiceWith(
  invoice: Stripe.Invoice,
  card: CustomerCard,
  ctx: SubscriptionContext,
  source: NewPaymentHistory['source'],
): Promise<PayOutcome> {
  let paid: Stripe.Invoice | null = null
  let failure: string | null = null
  let failedIntent: CardUsed | null = null
  try {
    paid = await stripe.invoices.pay(invoice.id, {
      payment_method: card.stripePaymentMethodId,
      off_session: true,
      expand: ['payments'],
    })
  } catch (err) {
    const e = err as Stripe.errors.StripeError & { payment_intent?: Stripe.PaymentIntent }
    failure = e.message ?? 'Payment failed'
    if (e.payment_intent) failedIntent = cardFromIntent(e.payment_intent)
  }

  if (paid && paid.status === 'paid') {
    await recordHistory({
      customerId: ctx.customer.id,
      linkId: ctx.terms.linkId,
      kind: 'invoice_paid',
      status: 'succeeded',
      amountCents: paid.amount_paid,
      currency: paid.currency,
      description: invoiceDescription(paid),
      cardRank: card.rank,
      cardBrand: card.brand,
      cardLast4: card.last4,
      stripePaymentMethodId: card.stripePaymentMethodId,
      ...(await intentIds(paid)),
      stripeInvoiceId: paid.id,
      stripeSubscriptionId: ctx.terms.stripeSubscriptionId,
      source,
      occurredAt: new Date(),
    })
    let subStatus: string | null = null
    try {
      const sub = await stripe.subscriptions.retrieve(ctx.terms.stripeSubscriptionId!)
      subStatus = sub.status
      await syncSubscriptionRecord(sub, ctx)
    } catch (err) {
      logger.warn({ err }, 'could not refresh subscription after retry')
    }
    await restoreAccess(ctx.customer.id, subStatus)
    logger.info({ customerId: ctx.customer.id, invoiceId: invoice.id, card: card.rank }, 'billing: invoice paid on retry')
    return { ok: true, message: null }
  }

  await recordHistory({
    customerId: ctx.customer.id,
    linkId: ctx.terms.linkId,
    kind: 'invoice_failed',
    status: 'failed',
    amountCents: invoice.amount_due,
    currency: invoice.currency,
    description: invoiceDescription(invoice),
    failureMessage: failure ?? 'Payment did not complete',
    cardRank: card.rank,
    cardBrand: card.brand,
    cardLast4: card.last4,
    stripePaymentMethodId: card.stripePaymentMethodId,
    stripePaymentIntentId: failedIntent?.paymentIntentId ?? null,
    stripeChargeId: failedIntent?.chargeId ?? null,
    stripeInvoiceId: invoice.id,
    stripeSubscriptionId: ctx.terms.stripeSubscriptionId,
    source,
    occurredAt: new Date(),
  })
  return { ok: false, message: failure }
}

async function intentIds(invoice: Stripe.Invoice): Promise<{ stripePaymentIntentId: string | null; stripeChargeId: string | null }> {
  const used = await latestInvoiceAttempt(invoice)
  return { stripePaymentIntentId: used.paymentIntentId, stripeChargeId: used.chargeId }
}

export function invoiceDescription(invoice: Stripe.Invoice): string {
  const line = invoice.lines?.data?.[0]
  const period = line?.period
  if (period?.start && period?.end) {
    const fmt = (s: number) => new Date(s * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    return `Monthly access · ${fmt(period.start)} – ${fmt(period.end)}`
  }
  return invoice.description || 'Monthly access'
}

// ── Subscription events ────────────────────────────────────────────────────

/** Mirror status / next payment / cancellation from a Stripe subscription. */
export async function syncSubscriptionRecord(sub: Stripe.Subscription, ctx?: SubscriptionContext | null): Promise<SubscriptionContext | null> {
  const context = ctx ?? (await contextForSubscription(sub.id))
  if (!context) return null
  const cancelAtTs = sub.cancel_at ?? (sub.cancel_at_period_end ? sub.items.data[0]?.current_period_end ?? null : null)
  await db
    .update(paymentLinkTermsTable)
    .set({
      subscriptionStatus: sub.status,
      nextPaymentAt: subscriptionNextPaymentAt(sub),
      cancelAt: cancelAtTs ? new Date(cancelAtTs * 1000) : null,
      canceledAt: sub.status === 'canceled' ? new Date((sub.canceled_at ?? sub.ended_at ?? Math.floor(Date.now() / 1000)) * 1000) : null,
    })
    .where(eq(paymentLinkTermsTable.linkId, context.terms.linkId))
  return context
}

export async function handleSubscriptionUpdated(sub: Stripe.Subscription, eventId: string | null): Promise<HandleResult> {
  const ctx = await syncSubscriptionRecord(sub)
  if (!ctx) return { handled: false, note: 'unknown subscription' }
  // Stripe-side status changes that affect access, without a payment event
  // of our own (e.g. a card updated through Stripe that pays the invoice).
  // Decide from fresh Stripe state, not the payload: events are not ordered,
  // and a delayed past_due must not re-lock a customer the backup card paid for.
  const [live, open] = await Promise.all([
    stripe.subscriptions.retrieve(sub.id),
    stripe.invoices.list({ subscription: sub.id, status: 'open', limit: 1 }),
  ])
  const decision = reconcileAccess({ subscriptionStatus: live.status, openInvoices: open.data.length, billingStatus: ctx.customer.billingStatus })
  if (decision === 'restore') await restoreAccess(ctx.customer.id, live.status)
  else if (decision === 'block') await blockAccess(ctx.customer, 'Your subscription payment is overdue.')
  if (sub.cancel_at || sub.cancel_at_period_end) {
    const when = sub.cancel_at ?? sub.items.data[0]?.current_period_end
    const exists = await hasHistory(
      and(eq(paymentHistoryTable.customerId, ctx.customer.id), eq(paymentHistoryTable.kind, 'cancellation_scheduled'), eq(paymentHistoryTable.stripeSubscriptionId, sub.id)),
    )
    if (!exists) {
      await recordHistory({
        customerId: ctx.customer.id,
        linkId: ctx.terms.linkId,
        kind: 'cancellation_scheduled',
        status: 'info',
        description: when ? `Cancellation scheduled for ${new Date(when * 1000).toLocaleDateString('en-US', { dateStyle: 'medium' })}` : 'Cancellation scheduled',
        stripeEventId: eventId,
        stripeSubscriptionId: sub.id,
        source: 'webhook',
        occurredAt: new Date(),
      })
    }
  }
  return { handled: true }
}

export async function handleSubscriptionDeleted(sub: Stripe.Subscription, eventId: string | null): Promise<HandleResult> {
  const ctx = await syncSubscriptionRecord(sub)
  if (!ctx) return { handled: false, note: 'unknown subscription' }
  await db
    .update(customersTable)
    .set({ billingStatus: 'canceled', updatedAt: new Date() })
    .where(eq(customersTable.id, ctx.customer.id))
  const exists = await hasHistory(
    and(eq(paymentHistoryTable.kind, 'subscription_canceled'), eq(paymentHistoryTable.stripeSubscriptionId, sub.id)),
  )
  if (!exists) {
    await recordHistory({
      customerId: ctx.customer.id,
      linkId: ctx.terms.linkId,
      kind: 'subscription_canceled',
      status: 'info',
      description: 'Subscription canceled',
      stripeEventId: eventId,
      stripeSubscriptionId: sub.id,
      source: 'webhook',
      occurredAt: new Date((sub.canceled_at ?? sub.ended_at ?? Math.floor(Date.now() / 1000)) * 1000),
    })
  }
  return { handled: true }
}

// ── Refunds ────────────────────────────────────────────────────────────────

/** charge.refunded: one ledger row per refund object (admin refunds already wrote theirs). */
export async function handleChargeRefunded(charge: Stripe.Charge, eventId: string | null): Promise<HandleResult> {
  const stripeCustomerId = typeof charge.customer === 'string' ? charge.customer : charge.customer?.id
  let customer = stripeCustomerId ? await customerForStripeId(stripeCustomerId) : null
  let linkId: string | null = null
  if (!customer) {
    // One-time checkout charges may predate the Stripe customer link; match by
    // an earlier ledger row for the same charge.
    const [prior] = await db
      .select()
      .from(paymentHistoryTable)
      .where(eq(paymentHistoryTable.stripeChargeId, charge.id))
      .limit(1)
    if (prior) {
      const [c] = await db.select().from(customersTable).where(eq(customersTable.id, prior.customerId)).limit(1)
      customer = c ?? null
      linkId = prior.linkId
    }
  }
  if (!customer) return { handled: false, note: 'unknown customer' }
  if (!linkId) {
    const [prior] = await db
      .select({ linkId: paymentHistoryTable.linkId })
      .from(paymentHistoryTable)
      .where(eq(paymentHistoryTable.stripeChargeId, charge.id))
      .limit(1)
    linkId = prior?.linkId ?? null
  }
  const refunds = (charge.refunds?.data ?? []) as Stripe.Refund[]
  const list = refunds.length ? refunds : (await stripe.refunds.list({ charge: charge.id, limit: 20 })).data
  for (const refund of list) {
    await recordHistory({
      customerId: customer.id,
      linkId,
      kind: 'refund',
      status: 'refunded',
      amountCents: refund.amount,
      currency: refund.currency,
      description: refund.reason ? `Refund (${refund.reason.replace(/_/g, ' ')})` : 'Refund',
      cardBrand: charge.payment_method_details?.card?.brand ?? null,
      cardLast4: charge.payment_method_details?.card?.last4 ?? null,
      stripePaymentMethodId: typeof charge.payment_method === 'string' ? charge.payment_method : null,
      stripeEventId: eventId,
      stripeChargeId: charge.id,
      stripePaymentIntentId: typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id ?? null,
      stripeRefundId: refund.id,
      source: 'webhook',
      occurredAt: new Date(refund.created * 1000),
    })
  }
  return { handled: true }
}

// ── Daily retry ────────────────────────────────────────────────────────────

export interface RetrySummary {
  customers: number
  invoices: number
  paid: number
  failed: number
  details: { customerId: string; invoiceId: string; result: 'paid' | 'failed' | 'skipped'; card?: string; message?: string | null }[]
}

/** Re-attempt every open invoice of every past-due customer, primary then secondary. */
export async function retryPastDueInvoices(
  source: NewPaymentHistory['source'] = 'cron',
  onlyCustomerId?: string,
): Promise<RetrySummary> {
  const summary: RetrySummary = { customers: 0, invoices: 0, paid: 0, failed: 0, details: [] }
  const pastDue = await db
    .select()
    .from(customersTable)
    .where(
      onlyCustomerId
        ? and(eq(customersTable.billingStatus, 'past_due'), eq(customersTable.id, onlyCustomerId))
        : eq(customersTable.billingStatus, 'past_due'),
    )
  for (const customer of pastDue) {
    summary.customers += 1
    const termsRows = await db
      .select()
      .from(paymentLinkTermsTable)
      .where(eq(paymentLinkTermsTable.customerId, customer.id))
      .orderBy(desc(paymentLinkTermsTable.createdAt))
    for (const terms of termsRows) {
      if (!terms.stripeSubscriptionId) continue
      const ctx = await contextForTerms({ ...terms })
      if (!ctx) continue
      ctx.customer = customer
      let open: Stripe.Invoice[] = []
      try {
        open = (await stripe.invoices.list({ subscription: terms.stripeSubscriptionId, status: 'open', limit: 10 })).data
      } catch (err) {
        logger.warn({ err, subscriptionId: terms.stripeSubscriptionId }, 'billing retry: could not list invoices')
        continue
      }
      if (open.length === 0) {
        // Nothing owed any more (paid elsewhere) — make sure access is back.
        try {
          const sub = await stripe.subscriptions.retrieve(terms.stripeSubscriptionId)
          if (sub.status === 'active' || sub.status === 'trialing') {
            await restoreAccess(customer.id, sub.status)
            summary.details.push({ customerId: customer.id, invoiceId: '-', result: 'skipped', message: 'no open invoices; access restored' })
          }
        } catch (err) {
          logger.warn({ err }, 'billing retry: could not check subscription')
        }
        continue
      }
      for (const invoice of open) {
        summary.invoices += 1
        let paid = false
        let lastMessage: string | null = null
        for (const card of ctx.cards) {
          const outcome = await payInvoiceWith(invoice, card, ctx, source)
          if (outcome.ok) {
            paid = true
            summary.paid += 1
            summary.details.push({ customerId: customer.id, invoiceId: invoice.id, result: 'paid', card: card.rank })
            break
          }
          lastMessage = outcome.message
        }
        if (!paid) {
          summary.failed += 1
          summary.details.push({ customerId: customer.id, invoiceId: invoice.id, result: 'failed', message: lastMessage })
        }
      }
    }
  }
  return summary
}

// ── Portal access gate ─────────────────────────────────────────────────────

export interface BillingBlock {
  customerId: string
  email: string
  reason: string
  status: string
}

/**
 * Is portal access shut off for this owner account? Staff resolve through
 * their owner (pass `accessOwnerId(participant)`).
 */
export async function billingBlockForOwner(ownerParticipantId: string): Promise<BillingBlock | null> {
  let [customer] = await db
    .select()
    .from(customersTable)
    .where(eq(customersTable.participantId, ownerParticipantId))
    .limit(1)
  if (!customer) {
    // Accounts provisioned before participant ids were stamped on customers:
    // resolve through the paid link and backfill.
    const supabase = getAdminClient()
    const { data: links } = await supabase
      .from('payment_links')
      .select('id')
      .eq('participant_id', ownerParticipantId)
      .limit(20)
    const ids = (links ?? []).map((l) => String(l.id))
    if (ids.length === 0) return null
    for (const id of ids) {
      const [terms] = await db
        .select({ customerId: paymentLinkTermsTable.customerId })
        .from(paymentLinkTermsTable)
        .where(eq(paymentLinkTermsTable.linkId, id))
        .limit(1)
      if (!terms) continue
      const [c] = await db.select().from(customersTable).where(eq(customersTable.id, terms.customerId)).limit(1)
      if (c) {
        customer = c
        if (!c.participantId) {
          await db.update(customersTable).set({ participantId: ownerParticipantId }).where(eq(customersTable.id, c.id))
        }
        break
      }
    }
    if (!customer) return null
  }
  if (!isAccessBlocked(customer.billingStatus)) return null
  return {
    customerId: customer.id,
    email: customer.email,
    status: customer.billingStatus,
    reason:
      customer.billingStatus === 'canceled'
        ? 'This subscription has been canceled.'
        : customer.billingIssue || 'Your most recent payment did not go through.',
  }
}
