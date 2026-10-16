import type Stripe from 'stripe'
import { and, eq } from 'drizzle-orm'
import { billingLinksTable, customersTable, db, paymentHistoryTable, paymentLinkTermsTable, type Customer, type PaymentLinkTerms } from '@workspace/db'

import { requireAdmin } from '@/lib/auth/admin-session'
import { getClientIp } from '@/lib/auth/session'
import { getCurrentParticipant } from '@/lib/data/participants'
import { getAdminUserById, listAdminUsers } from '@/lib/data/admin-users'
import { stripe } from '@/lib/stripe'
import { logger } from '@/lib/logger'
import { appOrigin } from '@/lib/app-origin'
import { sendBillingLinkEmail, sendCancellationRequestedEmail, sendCancellationScheduledEmail } from '@/lib/mail'
import { contextForTerms, recordHistory, syncSubscriptionRecord } from '@/lib/billing/dunning'
import {
  addCardFromSetupIntent,
  buildOverview,
  collectOpenInvoices,
  billingLinkRequestAllowed,
  createBillingLink,
  currentTermsForCustomer,
  customerForOwner,
  obligationFor,
  openInvoicesFor,
  resolveBillingLink,
  setupIntentForNewCard,
  type AddCardResult,
  type BillingOverview,
  type CollectResult,
} from '@/lib/billing/customer-billing'

/**
 * Customer-facing billing actions.
 *
 *  - `*ByToken` actions serve the public page /billing/:token, reached from
 *    an emailed link; they work without a portal session so an account shut
 *    off for non-payment can still pay or add a card.
 *  - `my*` actions serve /portal/billing for the signed-in owner.
 *  - `sendCardUpdateLink` is the admin side: email the customer a link.
 */

type Result<T = Record<string, never>> = ({ ok: true } & T) | { ok: false; error: string }

const stripeMessage = (err: unknown, fallback: string) => {
  const e = err as { message?: string }
  return e?.message ? e.message : fallback
}

const GENERIC_LINK_REPLY = 'If that email is on a customer account, a secure billing link is on its way. It expires in 14 days.'

// ── Public, token-based ────────────────────────────────────────────────────

/**
 * From the login notice: the customer types their email and we send them a
 * secure link to the billing page. The reply is the same whether or not the
 * email matched, so the form does not reveal who is a customer.
 */
export async function requestBillingLink(input: { email: string }): Promise<Result<{ message: string }>> {
  const email = String(input?.email ?? '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Enter the email address on your account.' }
  const ip = await getClientIp().catch(() => null)
  if (!billingLinkRequestAllowed({ email, ip })) {
    logger.warn({ email, ip }, 'billing link request throttled')
    // Same neutral reply as an unknown email so the form leaks nothing.
    return { ok: true, message: GENERIC_LINK_REPLY }
  }
  const customers = await db.select().from(customersTable).where(eq(customersTable.email, email)).limit(5)
  const customer = customers.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0]
  if (!customer) {
    logger.info({ email }, 'billing link requested for unknown email')
    return { ok: true, message: GENERIC_LINK_REPLY }
  }
  const terms = await currentTermsForCustomer(customer.id)
  const created = await createBillingLink({ customerId: customer.id, linkId: terms?.linkId ?? null, purpose: 'billing', createdByName: 'customer request' })
  const balance = await openInvoicesFor(terms)
  await sendBillingLinkEmail(
    customer.email,
    {
      name: customer.fullName,
      purpose: 'billing',
      billingUrl: created.url,
      expiresAt: created.expiresAt.toISOString(),
      accessPaused: customer.billingStatus === 'past_due',
      outstandingCents: balance.total_cents || null,
    },
    { metadata: { customerId: customer.id, source: 'customer_request' } },
  )
  return { ok: true, message: GENERIC_LINK_REPLY }
}

export interface TokenBillingState {
  overview: BillingOverview
  purpose: 'update_card' | 'billing'
  expiresAt: string
}

/** Everything the public billing page shows. Null when the link is unknown or expired. */
export async function getBillingByToken(token: string): Promise<TokenBillingState | null> {
  const found = await resolveBillingLink(String(token ?? ''))
  if (!found) return null
  const overview = await buildOverview(found.customer, found.terms)
  return { overview, purpose: found.link.purpose, expiresAt: found.link.expiresAt.toISOString() }
}

/** SetupIntent client secret for the "add a card" form on the public page. */
export async function startCardUpdateByToken(token: string): Promise<Result<{ clientSecret: string }>> {
  const found = await resolveBillingLink(String(token ?? ''))
  if (!found) return { ok: false, error: 'This billing link is no longer valid. Request a new one from the login page.' }
  try {
    const intent = await setupIntentForNewCard(found.customer, found.terms, found.link.setupIntentId, { rp_billing_link: found.link.id })
    if (intent.id !== found.link.setupIntentId) {
      await db.update(billingLinksTable).set({ setupIntentId: intent.id }).where(eq(billingLinksTable.id, found.link.id))
    }
    if (!intent.client_secret) return { ok: false, error: 'Stripe did not return a client secret.' }
    return { ok: true, clientSecret: intent.client_secret }
  } catch (err) {
    logger.error({ err }, 'startCardUpdateByToken failed')
    return { ok: false, error: stripeMessage(err, 'Could not start the card form.') }
  }
}

/** After Stripe.js confirmed the SetupIntent: record the card (see addCardFromSetupIntent). */
export async function recordCardByToken(token: string, input?: { retirePrevious?: boolean }): Promise<AddCardResult> {
  const found = await resolveBillingLink(String(token ?? ''))
  if (!found) return { ok: false, error: 'This billing link is no longer valid.' }
  if (!found.link.setupIntentId) return { ok: false, error: 'The card form has not been started.' }
  const result = await addCardFromSetupIntent(found.customer, found.terms, found.link.setupIntentId, {
    retirePrevious: Boolean(input?.retirePrevious),
    actor: { source: 'customer' },
  })
  // The intent is spent either way; the next attempt gets a fresh one.
  await db.update(billingLinksTable).set({ setupIntentId: null }).where(eq(billingLinksTable.id, found.link.id))
  return result
}

/** "Pay now": retry every open invoice on the cards on file. */
export async function payBalanceByToken(token: string): Promise<Result<{ collected: CollectResult }>> {
  const found = await resolveBillingLink(String(token ?? ''))
  if (!found) return { ok: false, error: 'This billing link is no longer valid.' }
  return payBalance(found.customer, found.terms)
}

// ── Portal owner ───────────────────────────────────────────────────────────

export interface MyBillingState {
  overview: BillingOverview | null
  /** Only the account owner manages billing; staff see a pointer instead. */
  isOwner: boolean
  ownerName: string | null
}

async function ownerCustomer(): Promise<{ participant: NonNullable<Awaited<ReturnType<typeof getCurrentParticipant>>>; customer: Customer; terms: PaymentLinkTerms | null } | { error: string }> {
  const participant = await getCurrentParticipant()
  if (!participant) return { error: 'Not signed in.' }
  if (participant.parent_id) return { error: 'Only the account owner can manage billing.' }
  if (participant.is_demo) return { error: 'The demo account has no billing to manage.' }
  const customer = await customerForOwner(participant.id)
  if (!customer) return { error: 'No billing record is attached to this account.' }
  const terms = await currentTermsForCustomer(customer.id)
  return { participant, customer, terms }
}

export async function getMyBilling(): Promise<MyBillingState> {
  const participant = await getCurrentParticipant()
  if (!participant) return { overview: null, isOwner: false, ownerName: null }
  if (participant.parent_id || participant.is_demo) return { overview: null, isOwner: false, ownerName: null }
  const customer = await customerForOwner(participant.id)
  if (!customer) return { overview: null, isOwner: true, ownerName: null }
  const terms = await currentTermsForCustomer(customer.id)
  return { overview: await buildOverview(customer, terms), isOwner: true, ownerName: customer.fullName }
}

export async function startMyCardUpdate(): Promise<Result<{ clientSecret: string }>> {
  const me = await ownerCustomer()
  if ('error' in me) return { ok: false, error: me.error }
  try {
    // One open intent per customer, remembered on a short-lived billing link row
    // so a refresh reuses it instead of piling up SetupIntents.
    const link = await portalIntentHolder(me.customer.id, me.terms?.linkId ?? null)
    const intent = await setupIntentForNewCard(me.customer, me.terms, link.setupIntentId, { rp_portal: '1' })
    if (intent.id !== link.setupIntentId) {
      await db.update(billingLinksTable).set({ setupIntentId: intent.id }).where(eq(billingLinksTable.id, link.id))
    }
    if (!intent.client_secret) return { ok: false, error: 'Stripe did not return a client secret.' }
    return { ok: true, clientSecret: intent.client_secret }
  } catch (err) {
    logger.error({ err }, 'startMyCardUpdate failed')
    return { ok: false, error: stripeMessage(err, 'Could not start the card form.') }
  }
}

export async function recordMyCard(input?: { retirePrevious?: boolean }): Promise<AddCardResult> {
  const me = await ownerCustomer()
  if ('error' in me) return { ok: false, error: me.error }
  const link = await portalIntentHolder(me.customer.id, me.terms?.linkId ?? null)
  if (!link.setupIntentId) return { ok: false, error: 'The card form has not been started.' }
  const result = await addCardFromSetupIntent(me.customer, me.terms, link.setupIntentId, {
    retirePrevious: Boolean(input?.retirePrevious),
    actor: { source: 'customer' },
  })
  await db.update(billingLinksTable).set({ setupIntentId: null }).where(eq(billingLinksTable.id, link.id))
  return result
}

export async function payMyBalance(): Promise<Result<{ collected: CollectResult }>> {
  const me = await ownerCustomer()
  if ('error' in me) return { ok: false, error: me.error }
  return payBalance(me.customer, me.terms)
}

/**
 * The portal's in-session card form parks its SetupIntent on a private
 * billing_links row (purpose "billing", token never emailed) so a page
 * refresh reuses the same intent.
 */
async function portalIntentHolder(customerId: string, linkId: string | null) {
  const [existing] = await db
    .select()
    .from(billingLinksTable)
    .where(and(eq(billingLinksTable.customerId, customerId), eq(billingLinksTable.createdByName, 'portal session')))
    .limit(1)
  if (existing) return existing
  const created = await createBillingLink({ customerId, linkId, purpose: 'billing', createdByName: 'portal session' })
  const [row] = await db.select().from(billingLinksTable).where(eq(billingLinksTable.token, created.token)).limit(1)
  return row
}

export interface CancellationPreview {
  agreementEnd: string | null
  cancelAt: string | null
  payments: number
  totalCents: number
  monthlyCents: number
  dates: string[]
  alreadyScheduled: boolean
}

/** Schedule cancellation at the end of the agreement. Requires the customer's acknowledgement of what is still owed. */
export async function cancelMyAgreement(input: { acknowledged: boolean }): Promise<Result<{ cancelAt: string | null; payments: number; totalCents: number }>> {
  const me = await ownerCustomer()
  if ('error' in me) return { ok: false, error: me.error }
  const { customer, terms } = me
  if (!terms?.stripeSubscriptionId || terms.subscriptionStatus === 'canceled') return { ok: false, error: 'There is no active subscription to cancel.' }
  if (terms.cancelAt) return { ok: false, error: 'Your cancellation is already scheduled.' }
  if (!input?.acknowledged) return { ok: false, error: 'Please confirm you understand the remaining payments before cancelling.' }
  const ctx = await contextForTerms(terms)
  if (!ctx) return { ok: false, error: 'Customer record not found.' }
  const obligation = obligationFor(terms)

  let sub: Stripe.Subscription
  try {
    const now = Date.now()
    const termEnd = terms.agreementEnd && terms.agreementEnd.getTime() > now + 60_000 ? terms.agreementEnd : null
    sub = termEnd
      ? await stripe.subscriptions.update(terms.stripeSubscriptionId, { cancel_at: Math.floor(termEnd.getTime() / 1000), proration_behavior: 'none' })
      : await stripe.subscriptions.update(terms.stripeSubscriptionId, { cancel_at_period_end: true, proration_behavior: 'none' })
  } catch (err) {
    return { ok: false, error: stripeMessage(err, 'Stripe could not schedule the cancellation.') }
  }
  await syncSubscriptionRecord(sub, ctx)
  const whenSec = sub.cancel_at ?? sub.items.data[0]?.current_period_end ?? null
  const cancelAt = whenSec ? new Date(whenSec * 1000) : null
  await db
    .delete(paymentHistoryTable)
    .where(and(eq(paymentHistoryTable.kind, 'cancellation_scheduled'), eq(paymentHistoryTable.stripeSubscriptionId, sub.id)))
  await recordHistory({
    customerId: customer.id,
    linkId: terms.linkId,
    kind: 'cancellation_scheduled',
    status: 'info',
    description: `Customer scheduled cancellation${cancelAt ? ` · ends ${cancelAt.toLocaleDateString('en-US', { dateStyle: 'medium' })}` : ''} · ${obligation.payments} payment${obligation.payments === 1 ? '' : 's'} remaining`,
    stripeSubscriptionId: sub.id,
    source: 'customer',
    occurredAt: new Date(),
  })

  // Tell the admin team (every active super admin plus the rep on the deal) and confirm to the customer.
  const admins = (await listAdminUsers().catch((): Awaited<ReturnType<typeof listAdminUsers>> => [])).filter((a) => a.active && a.role === 'super_admin')
  const rep = terms.repId ? await getAdminUserById(terms.repId).catch(() => null) : null
  const recipients = new Set(admins.map((a) => a.email.toLowerCase()))
  if (rep?.active) recipients.add(rep.email.toLowerCase())
  const adminData = {
    customerName: customer.fullName,
    businessName: customer.businessName,
    customerEmail: customer.email,
    cancelAt: (cancelAt ?? new Date()).toISOString(),
    remainingPayments: obligation.payments,
    remainingCents: obligation.totalCents,
    monthlyCents: terms.monthlyCents,
    adminUrl: `${appOrigin()}/admin/payments/${terms.linkId}`,
  }
  await Promise.all(
    [...recipients].map((to) => sendCancellationRequestedEmail(to, adminData, { metadata: { customerId: customer.id, linkId: terms.linkId } })),
  )
  // Dedicated confirmation: the generic "subscription cancelled" email promises
  // no further charges, which is wrong here — every remaining installment is
  // still collected until the agreement end.
  await sendCancellationScheduledEmail(
    customer.email,
    {
      name: customer.fullName,
      cancelAt: (cancelAt ?? new Date()).toISOString(),
      remainingPayments: obligation.payments,
      remainingCents: obligation.totalCents,
      monthlyCents: terms.monthlyCents,
      nextPaymentAt: obligation.dates[0]?.toISOString() ?? null,
      billingUrl: `${appOrigin()}/portal/billing`,
    },
    { metadata: { customerId: customer.id, linkId: terms.linkId, source: 'customer' } },
  )
  return { ok: true, cancelAt: cancelAt ? cancelAt.toISOString() : null, payments: obligation.payments, totalCents: obligation.totalCents }
}

// ── Admin ──────────────────────────────────────────────────────────────────

/** Email the customer a secure "add a new card" link and hand the URL back to the admin. */
export async function sendCardUpdateLink(input: { linkId: string }): Promise<Result<{ url: string; expiresAt: string; emailed: boolean; sentTo: string }>> {
  const admin = await requireAdmin()
  const terms = input?.linkId
    ? ((await db.select().from(paymentLinkTermsTable).where(eq(paymentLinkTermsTable.linkId, String(input.linkId))).limit(1))[0] ?? null)
    : null
  if (!terms) return { ok: false, error: 'No billing terms found for this link.' }
  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, terms.customerId)).limit(1)
  if (!customer) return { ok: false, error: 'Customer record not found.' }
  const created = await createBillingLink({
    customerId: customer.id,
    linkId: terms.linkId,
    purpose: 'update_card',
    createdById: admin.userId,
    createdByName: admin.name || admin.email,
  })
  const balance = await openInvoicesFor(terms)
  const sent = await sendBillingLinkEmail(
    customer.email,
    {
      name: customer.fullName,
      purpose: 'update_card',
      billingUrl: created.url,
      expiresAt: created.expiresAt.toISOString(),
      accessPaused: customer.billingStatus === 'past_due',
      outstandingCents: balance.total_cents || null,
      sentByName: admin.name || null,
    },
    { metadata: { customerId: customer.id, linkId: terms.linkId, adminId: admin.userId } },
  )
  await recordHistory({
    customerId: customer.id,
    linkId: terms.linkId,
    kind: 'subscription_updated',
    status: 'info',
    description: `Card update link ${sent.ok ? 'emailed' : 'created (email failed)'} · expires ${created.expiresAt.toLocaleDateString('en-US', { dateStyle: 'medium' })}`,
    stripeSubscriptionId: terms.stripeSubscriptionId,
    source: 'admin',
    actorAdminId: admin.userId,
    actorAdminName: admin.name || admin.email,
    occurredAt: new Date(),
  })
  return { ok: true, url: created.url, expiresAt: created.expiresAt.toISOString(), emailed: sent.ok, sentTo: customer.email }
}

// ── Shared ─────────────────────────────────────────────────────────────────

async function payBalance(customer: Customer, terms: PaymentLinkTerms | null): Promise<Result<{ collected: CollectResult }>> {
  if (!terms?.stripeSubscriptionId) return { ok: false, error: 'There is no subscription to pay.' }
  const ctx = await contextForTerms(terms)
  if (!ctx) return { ok: false, error: 'Customer record not found.' }
  ctx.customer = customer
  try {
    const collected = await collectOpenInvoices(ctx, 'customer')
    return { ok: true, collected }
  } catch (err) {
    logger.error({ err, customerId: customer.id }, 'payBalance failed')
    return { ok: false, error: stripeMessage(err, 'Stripe could not process the payment.') }
  }
}
