import type Stripe from 'stripe'
import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { customersTable, db, paymentHistoryTable, paymentLinkTermsTable } from '@workspace/db'

import { requireAdmin } from '@/lib/auth/admin-session'
import { stripe } from '@/lib/stripe'
import { validateBillingDate, validateRefundAmount } from '@/lib/billing/rules'
import {
  contextForTerms,
  recordHistory,
  restoreAccess,
  retryPastDueInvoices,
  syncSubscriptionRecord,
} from '@/lib/billing/dunning'

/**
 * Admin billing actions on a customer record. Every action is stamped with
 * the acting admin in the payment history.
 */

type Result<T = Record<string, never>> = ({ ok: true } & T) | { ok: false; error: string }

function stripeMessage(err: unknown, fallback: string): string {
  const e = err as { message?: string; code?: string }
  return e?.message ? e.message : fallback
}

async function loadTerms(linkId: string) {
  const [terms] = await db.select().from(paymentLinkTermsTable).where(eq(paymentLinkTermsTable.linkId, linkId)).limit(1)
  return terms ?? null
}

/** Refund a successful payment in full (amountCents omitted) or in part. */
export async function refundPayment(input: {
  historyId: string
  amountCents?: number | null
  reason?: string
}): Promise<Result<{ refundedCents: number }>> {
  const admin = await requireAdmin()
  const [entry] = await db.select().from(paymentHistoryTable).where(eq(paymentHistoryTable.id, input.historyId)).limit(1)
  if (!entry || entry.status !== 'succeeded') return { ok: false, error: 'That payment cannot be refunded.' }
  if (!entry.stripeChargeId && !entry.stripePaymentIntentId) {
    return { ok: false, error: 'No Stripe charge is attached to this payment.' }
  }

  // What is still refundable, from Stripe rather than our ledger.
  let charge: Stripe.Charge
  try {
    if (entry.stripeChargeId) {
      charge = await stripe.charges.retrieve(entry.stripeChargeId)
    } else {
      const pi = await stripe.paymentIntents.retrieve(entry.stripePaymentIntentId!, { expand: ['latest_charge'] })
      if (!pi.latest_charge || typeof pi.latest_charge === 'string') return { ok: false, error: 'No charge found for this payment.' }
      charge = pi.latest_charge
    }
  } catch (err) {
    return { ok: false, error: stripeMessage(err, 'Could not load the charge from Stripe.') }
  }
  const refundable = charge.amount - charge.amount_refunded
  const amount = input.amountCents == null ? null : Math.round(Number(input.amountCents))
  const invalid = validateRefundAmount(amount, refundable)
  if (invalid) return { ok: false, error: invalid }

  let refund: Stripe.Refund
  try {
    refund = await stripe.refunds.create(
      {
        charge: charge.id,
        amount: amount ?? undefined,
        reason: 'requested_by_customer',
        metadata: { rp_admin_id: admin.userId, rp_admin_name: admin.name || admin.email, rp_history_id: entry.id },
      },
      { idempotencyKey: `refund-${entry.id}-${amount ?? 'full'}-${Math.floor(Date.now() / 60000)}` },
    )
  } catch (err) {
    return { ok: false, error: stripeMessage(err, 'Stripe could not process the refund.') }
  }

  await recordHistory({
    customerId: entry.customerId,
    linkId: entry.linkId,
    kind: 'refund',
    status: 'refunded',
    amountCents: refund.amount,
    currency: refund.currency,
    description: input.reason?.trim()
      ? `Refund — ${input.reason.trim().slice(0, 200)}`
      : amount == null || amount === charge.amount
        ? 'Full refund'
        : 'Partial refund',
    cardRank: entry.cardRank,
    cardBrand: entry.cardBrand,
    cardLast4: entry.cardLast4,
    stripePaymentMethodId: entry.stripePaymentMethodId,
    stripeInvoiceId: entry.stripeInvoiceId,
    stripePaymentIntentId: entry.stripePaymentIntentId,
    stripeChargeId: charge.id,
    stripeRefundId: refund.id,
    stripeSubscriptionId: entry.stripeSubscriptionId,
    source: 'admin',
    actorAdminId: admin.userId,
    actorAdminName: admin.name || admin.email,
    occurredAt: new Date(refund.created * 1000),
  })
  if (entry.linkId) revalidatePath(`/admin/payments/${entry.linkId}`)
  return { ok: true, refundedCents: refund.amount }
}

/**
 * Cancel a subscription: `term_end` schedules the cancellation for the end
 * of the 12-month agreement (falling back to the current period when no
 * agreement end is recorded); `now` cancels immediately and shuts access off.
 */
export async function cancelSubscription(input: {
  linkId: string
  when: 'term_end' | 'now'
}): Promise<Result<{ status: string; cancelAt: string | null }>> {
  const admin = await requireAdmin()
  const terms = await loadTerms(input.linkId)
  if (!terms?.stripeSubscriptionId) return { ok: false, error: 'This link has no active subscription.' }
  const ctx = await contextForTerms(terms)
  if (!ctx) return { ok: false, error: 'Customer record not found.' }
  const actor = { actorAdminId: admin.userId, actorAdminName: admin.name || admin.email }

  let sub: Stripe.Subscription
  try {
    if (input.when === 'now') {
      sub = await stripe.subscriptions.cancel(terms.stripeSubscriptionId, {
        invoice_now: false,
        prorate: false,
      })
    } else {
      const now = Date.now()
      const termEnd = terms.agreementEnd && terms.agreementEnd.getTime() > now + 60_000 ? terms.agreementEnd : null
      sub = termEnd
        ? await stripe.subscriptions.update(terms.stripeSubscriptionId, {
            cancel_at: Math.floor(termEnd.getTime() / 1000),
            proration_behavior: 'none',
          })
        : await stripe.subscriptions.update(terms.stripeSubscriptionId, {
            cancel_at_period_end: true,
            proration_behavior: 'none',
          })
    }
  } catch (err) {
    return { ok: false, error: stripeMessage(err, 'Stripe could not update the subscription.') }
  }

  await syncSubscriptionRecord(sub, ctx)
  if (input.when === 'now') {
    await db
      .update(customersTable)
      .set({ billingStatus: 'canceled', billingIssue: null, updatedAt: new Date() })
      .where(eq(customersTable.id, ctx.customer.id))
    await recordHistory({
      customerId: ctx.customer.id,
      linkId: terms.linkId,
      kind: 'subscription_canceled',
      status: 'info',
      description: 'Subscription canceled immediately by admin',
      stripeSubscriptionId: sub.id,
      source: 'admin',
      ...actor,
      occurredAt: new Date(),
    })
  } else {
    const when = sub.cancel_at ?? sub.items.data[0]?.current_period_end ?? null
    // Replace any earlier scheduled-cancellation note for this subscription.
    await db
      .delete(paymentHistoryTable)
      .where(and(eq(paymentHistoryTable.kind, 'cancellation_scheduled'), eq(paymentHistoryTable.stripeSubscriptionId, sub.id)))
    await recordHistory({
      customerId: ctx.customer.id,
      linkId: terms.linkId,
      kind: 'cancellation_scheduled',
      status: 'info',
      description: when
        ? `Cancels at end of term · ${new Date(when * 1000).toLocaleDateString('en-US', { dateStyle: 'medium' })}`
        : 'Cancellation scheduled',
      stripeSubscriptionId: sub.id,
      source: 'admin',
      ...actor,
      occurredAt: new Date(),
    })
  }
  revalidatePath(`/admin/payments/${terms.linkId}`)
  return {
    ok: true,
    status: sub.status,
    cancelAt: sub.cancel_at ? new Date(sub.cancel_at * 1000).toISOString() : null,
  }
}

/** Undo a scheduled (end-of-term) cancellation. */
export async function resumeSubscription(input: { linkId: string }): Promise<Result<{ status: string }>> {
  const admin = await requireAdmin()
  const terms = await loadTerms(input.linkId)
  if (!terms?.stripeSubscriptionId) return { ok: false, error: 'This link has no active subscription.' }
  const ctx = await contextForTerms(terms)
  if (!ctx) return { ok: false, error: 'Customer record not found.' }
  let sub: Stripe.Subscription
  try {
    // Stripe accepts only one of the two cancellation fields per call.
    const current = await stripe.subscriptions.retrieve(terms.stripeSubscriptionId)
    sub = current.cancel_at_period_end
      ? await stripe.subscriptions.update(terms.stripeSubscriptionId, { cancel_at_period_end: false })
      : await stripe.subscriptions.update(terms.stripeSubscriptionId, { cancel_at: '' })
  } catch (err) {
    return { ok: false, error: stripeMessage(err, 'Stripe could not update the subscription.') }
  }
  await syncSubscriptionRecord(sub, ctx)
  await db
    .delete(paymentHistoryTable)
    .where(and(eq(paymentHistoryTable.kind, 'cancellation_scheduled'), eq(paymentHistoryTable.stripeSubscriptionId, sub.id)))
  await recordHistory({
    customerId: ctx.customer.id,
    linkId: terms.linkId,
    kind: 'subscription_updated',
    status: 'info',
    description: 'Scheduled cancellation removed',
    stripeSubscriptionId: sub.id,
    source: 'admin',
    actorAdminId: admin.userId,
    actorAdminName: admin.name || admin.email,
    occurredAt: new Date(),
  })
  revalidatePath(`/admin/payments/${terms.linkId}`)
  return { ok: true, status: sub.status }
}

/**
 * Move the next billing date. Stripe's supported way is to extend the trial
 * to the new date with no proration: nothing is charged until then and the
 * monthly cycle re-anchors on that day.
 */
export async function changeBillingDate(input: { linkId: string; date: string }): Promise<Result<{ nextPaymentAt: string }>> {
  const admin = await requireAdmin()
  const terms = await loadTerms(input.linkId)
  if (!terms?.stripeSubscriptionId) return { ok: false, error: 'This link has no active subscription.' }
  const ctx = await contextForTerms(terms)
  if (!ctx) return { ok: false, error: 'Customer record not found.' }
  const date = new Date(input.date)
  const invalid = validateBillingDate(date)
  if (invalid) return { ok: false, error: invalid }

  let sub: Stripe.Subscription
  try {
    sub = await stripe.subscriptions.update(terms.stripeSubscriptionId, {
      trial_end: Math.floor(date.getTime() / 1000),
      proration_behavior: 'none',
    })
  } catch (err) {
    return { ok: false, error: stripeMessage(err, 'Stripe could not change the billing date.') }
  }
  await syncSubscriptionRecord(sub, ctx)
  const previous = terms.nextPaymentAt
  await recordHistory({
    customerId: ctx.customer.id,
    linkId: terms.linkId,
    kind: 'billing_date_changed',
    status: 'info',
    description: `Next billing date moved${previous ? ` from ${previous.toLocaleDateString('en-US', { dateStyle: 'medium' })}` : ''} to ${date.toLocaleDateString('en-US', { dateStyle: 'medium' })}`,
    stripeSubscriptionId: sub.id,
    source: 'admin',
    actorAdminId: admin.userId,
    actorAdminName: admin.name || admin.email,
    occurredAt: new Date(),
  })
  revalidatePath(`/admin/payments/${terms.linkId}`)
  return { ok: true, nextPaymentAt: date.toISOString() }
}

/** Run the dunning pass for one customer right now (both cards). */
export async function retryCustomerPayment(input: { linkId: string }): Promise<Result<{ paid: boolean; message: string | null }>> {
  const admin = await requireAdmin()
  const terms = await loadTerms(input.linkId)
  if (!terms?.stripeSubscriptionId) return { ok: false, error: 'This link has no active subscription.' }
  const ctx = await contextForTerms(terms)
  if (!ctx) return { ok: false, error: 'Customer record not found.' }
  if (ctx.customer.billingStatus !== 'past_due') return { ok: false, error: 'This customer is not past due.' }
  const summary = await retryPastDueInvoices('admin', ctx.customer.id)
  const mine = summary.details.filter((d) => d.customerId === ctx.customer.id)
  const paid = mine.some((d) => d.result === 'paid') || (mine.length > 0 && mine.every((d) => d.result === 'skipped'))
  if (mine.length === 0) {
    // Nothing open in Stripe — clear the block so the customer is not stuck.
    await restoreAccess(ctx.customer.id, terms.subscriptionStatus)
  }
  await recordHistory({
    customerId: ctx.customer.id,
    linkId: terms.linkId,
    kind: 'subscription_updated',
    status: 'info',
    description: paid || mine.length === 0 ? 'Manual retry — access restored' : 'Manual retry — payment still failing',
    stripeSubscriptionId: terms.stripeSubscriptionId,
    source: 'admin',
    actorAdminId: admin.userId,
    actorAdminName: admin.name || admin.email,
    occurredAt: new Date(),
  })
  revalidatePath(`/admin/payments/${terms.linkId}`)
  const failed = mine.find((d) => d.result === 'failed')
  return { ok: true, paid: paid || mine.length === 0, message: failed?.message ?? null }
}
