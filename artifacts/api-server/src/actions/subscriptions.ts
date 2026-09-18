import { randomBytes } from 'crypto'
import type Stripe from 'stripe'
import { revalidatePath } from 'next/cache'

import { getAdminClient } from '@/lib/supabase/admin'
import { stripe } from '@/lib/stripe'
import { sendPaymentReceivedEmail } from '@/lib/mail'
import {
  customerCardsTable,
  customersTable,
  db,
  paymentLinkTermsTable,
  type Customer,
  type PaymentLinkTerms,
} from '@workspace/db'
import { and, eq, ne } from 'drizzle-orm'

import { PRODUCT_NAME, provisionAccounts, recordIntentPayment } from './payments'
import { agreementWindow, isSameCard, stageOf, type CheckoutStage } from '@/lib/billing/rules'

/**
 * Public two-card subscription checkout for a payment link.
 *
 *   1. Primary card  — pays the setup fee (PaymentIntent) or, when the fee
 *      is waived, is simply saved (SetupIntent). Saved for off-session use.
 *   2. Secondary card — saved with a SetupIntent; rejected if Stripe reports
 *      the same card fingerprint as the primary.
 *   3. Subscription  — monthly price, 30-day trial anchored on the setup
 *      payment, primary card as default. Portal access is provisioned now.
 *
 * The client only ever sends the link token; every Stripe object id is
 * read back from our own record, so amounts and cards cannot be tampered
 * with from the browser.
 */

export type { CheckoutStage } from '@/lib/billing/rules'

export interface SubscriptionCheckoutState {
  stage: CheckoutStage
  /** Which Stripe.js confirm call the client must use for this step. */
  intentType: 'payment' | 'setup' | null
  clientSecret: string | null
  setupFeeCents: number
  monthlyCents: number
  primaryCard: { brand: string; last4: string } | null
  error?: string
}

interface LinkRow {
  id: string
  token: string
  name: string
  email: string
  phone: string | null
  status: 'pending' | 'paid'
}

async function loadLink(token: string): Promise<{
  link: LinkRow
  terms: PaymentLinkTerms
  customer: Customer
} | null> {
  const supabase = getAdminClient()
  const { data } = await supabase
    .from('payment_links')
    .select('id, token, name, email, phone, status')
    .eq('token', token)
    .maybeSingle()
  if (!data) return null
  const [terms] = await db
    .select()
    .from(paymentLinkTermsTable)
    .where(eq(paymentLinkTermsTable.linkId, String(data.id)))
    .limit(1)
  if (!terms || terms.type !== 'subscription') return null
  const [customer] = await db
    .select()
    .from(customersTable)
    .where(eq(customersTable.id, terms.customerId))
    .limit(1)
  if (!customer) return null
  return { link: data as LinkRow, terms, customer }
}

/** Stripe Customer for our customer record, created on first use. */
async function ensureStripeCustomer(customer: Customer, link: LinkRow): Promise<string> {
  if (customer.stripeCustomerId) return customer.stripeCustomerId
  const created = await stripe.customers.create(
    {
      name: customer.fullName,
      email: customer.email,
      phone: customer.phone || undefined,
      description: customer.businessName || undefined,
      address: customer.businessAddress ? { line1: customer.businessAddress.slice(0, 200) } : undefined,
      metadata: { rp_customer_id: customer.id, business_name: customer.businessName },
    },
    { idempotencyKey: `cus-${customer.id}-${Math.floor(Date.now() / 600000)}` },
  )
  await db
    .update(customersTable)
    .set({ stripeCustomerId: created.id, updatedAt: new Date() })
    .where(eq(customersTable.id, customer.id))
  await db
    .update(paymentLinkTermsTable)
    .set({ stripeCustomerId: created.id })
    .where(eq(paymentLinkTermsTable.linkId, link.id))
  return created.id
}

let cachedProductId: string | null = null

/** The recurring product every subscription bills against. */
async function accessProductId(): Promise<string> {
  if (cachedProductId) return cachedProductId
  const list = await stripe.products.list({ active: true, limit: 100 })
  const found = list.data.find((p) => p.metadata?.rp_product === 'access')
  if (found) {
    cachedProductId = found.id
    return found.id
  }
  const created = await stripe.products.create({
    name: PRODUCT_NAME,
    metadata: { rp_product: 'access' },
  })
  cachedProductId = created.id
  return created.id
}

const REUSABLE = new Set(['requires_payment_method', 'requires_confirmation', 'requires_action', 'processing'])

const cardOf = (pm: Stripe.PaymentMethod) => ({
  brand: pm.card?.brand ?? 'card',
  last4: pm.card?.last4 ?? '',
  fingerprint: pm.card?.fingerprint ?? null,
  expMonth: pm.card?.exp_month ?? null,
  expYear: pm.card?.exp_year ?? null,
})

/** Active card of a given rank saved during THIS link's checkout (never a card from an earlier link). */
async function activeCardOf(customerId: string, linkId: string, rank: 'primary' | 'secondary') {
  const [row] = await db
    .select()
    .from(customerCardsTable)
    .where(
      and(
        eq(customerCardsTable.customerId, customerId),
        eq(customerCardsTable.linkId, linkId),
        eq(customerCardsTable.rank, rank),
        eq(customerCardsTable.active, true),
      ),
    )
    .limit(1)
  return row ?? null
}

/** Retire every active card that did not come from this link (repeat customer starting a new agreement). */
async function retireOtherCards(customerId: string, linkId: string) {
  await db
    .update(customerCardsTable)
    .set({ active: false })
    .where(
      and(
        eq(customerCardsTable.customerId, customerId),
        eq(customerCardsTable.active, true),
        ne(customerCardsTable.linkId, linkId),
      ),
    )
}

/**
 * Public: where the payer is in the flow, plus the client secret for the
 * current step. Creates or reuses the Stripe intent for that step.
 */
export async function getSubscriptionCheckoutState(token: string): Promise<SubscriptionCheckoutState | null> {
  let found = await loadLink(token)
  if (!found) return null

  // A payer returning from a bank redirect lands here with the intent already
  // confirmed but not yet recorded — settle that first so we never hand out a
  // second intent for a step that is actually complete.
  let settleError: string | undefined
  const pendingStage = stageOf(found.terms)
  if (
    (pendingStage === 'primary' && found.terms.primaryIntentId) ||
    (pendingStage === 'secondary' && found.terms.secondaryIntentId)
  ) {
    const settled = pendingStage === 'primary' ? await recordPrimaryCard(token) : await recordSecondaryCard(token)
    if (settled.ok || (settled as { duplicate?: boolean }).duplicate) {
      if (!settled.ok) settleError = settled.error
      found = await loadLink(token)
      if (!found) return null
    }
  }

  const { link, terms, customer } = found
  const stage = stageOf(terms)
  const base = {
    setupFeeCents: terms.setupFeeCents,
    monthlyCents: terms.monthlyCents,
    primaryCard: null as SubscriptionCheckoutState['primaryCard'],
    error: settleError,
  }
  if (stage === 'done') return { ...base, stage, intentType: null, clientSecret: null }

  const stripeCustomerId = await ensureStripeCustomer(customer, link)
  const metadata = { payment_link_token: link.token, rp_customer_id: customer.id, step: stage }

  if (stage === 'primary') {
    if (terms.setupFeeCents > 0) {
      let intent: Stripe.PaymentIntent | null = null
      if (terms.primaryIntentId?.startsWith('pi_')) {
        intent = await stripe.paymentIntents.retrieve(terms.primaryIntentId)
        if (!REUSABLE.has(intent.status)) intent = null
      }
      if (!intent) {
        intent = await stripe.paymentIntents.create({
          amount: terms.setupFeeCents,
          currency: 'usd',
          customer: stripeCustomerId,
          payment_method_types: ['card'],
          setup_future_usage: 'off_session',
          description: `${PRODUCT_NAME} — setup fee for ${link.name}`,
          receipt_email: link.email,
          metadata,
        })
        await db
          .update(paymentLinkTermsTable)
          .set({ primaryIntentId: intent.id })
          .where(eq(paymentLinkTermsTable.linkId, link.id))
      }
      return { ...base, stage, intentType: 'payment', clientSecret: intent.client_secret }
    }
    let intent: Stripe.SetupIntent | null = null
    if (terms.primaryIntentId?.startsWith('seti_')) {
      intent = await stripe.setupIntents.retrieve(terms.primaryIntentId)
      if (!REUSABLE.has(intent.status)) intent = null
    }
    if (!intent) {
      intent = await stripe.setupIntents.create({
        customer: stripeCustomerId,
        payment_method_types: ['card'],
        usage: 'off_session',
        metadata,
      })
      await db
        .update(paymentLinkTermsTable)
        .set({ primaryIntentId: intent.id })
        .where(eq(paymentLinkTermsTable.linkId, link.id))
    }
    return { ...base, stage, intentType: 'setup', clientSecret: intent.client_secret }
  }

  // stage === 'secondary'
  const primary = await activeCardOf(customer.id, link.id, 'primary')
  let intent: Stripe.SetupIntent | null = null
  if (terms.secondaryIntentId) {
    intent = await stripe.setupIntents.retrieve(terms.secondaryIntentId)
    if (!REUSABLE.has(intent.status)) intent = null
  }
  if (!intent) {
    intent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      usage: 'off_session',
      metadata,
    })
    await db
      .update(paymentLinkTermsTable)
      .set({ secondaryIntentId: intent.id })
      .where(eq(paymentLinkTermsTable.linkId, link.id))
  }
  return {
    ...base,
    stage,
    intentType: 'setup',
    clientSecret: intent.client_secret,
    primaryCard: primary ? { brand: primary.brand, last4: primary.last4 } : null,
  }
}

/** Retrieve the payment method behind a confirmed intent, or null if not confirmed. */
async function confirmedPaymentMethod(
  intentId: string,
): Promise<{ pm: Stripe.PaymentMethod; paymentIntent: Stripe.PaymentIntent | null } | null> {
  if (intentId.startsWith('pi_')) {
    const pi = await stripe.paymentIntents.retrieve(intentId, { expand: ['payment_method', 'latest_charge'] })
    if (pi.status !== 'succeeded') return null
    const pm = pi.payment_method
    if (!pm || typeof pm === 'string') return null
    return { pm, paymentIntent: pi }
  }
  const si = await stripe.setupIntents.retrieve(intentId, { expand: ['payment_method'] })
  if (si.status !== 'succeeded') return null
  const pm = si.payment_method
  if (!pm || typeof pm === 'string') return null
  return { pm, paymentIntent: null }
}

/**
 * Public: after Stripe.js confirmed the primary step, verify it with Stripe,
 * store the card and mark the setup fee paid. Idempotent.
 */
export async function recordPrimaryCard(token: string): Promise<{ ok: boolean; error?: string; stage?: CheckoutStage }> {
  const found = await loadLink(token)
  if (!found) return { ok: false, error: 'This payment link is no longer active.' }
  const { link, terms, customer } = found
  if (terms.completedAt) return { ok: true, stage: 'done' }
  if (terms.setupPaidAt) return { ok: true, stage: 'secondary' }
  if (!terms.primaryIntentId) return { ok: false, error: 'Checkout has not been started.' }

  const confirmed = await confirmedPaymentMethod(terms.primaryIntentId)
  if (!confirmed) return { ok: false, error: 'The payment has not completed yet. Please try again.' }
  const card = cardOf(confirmed.pm)
  const stripeCustomerId = await ensureStripeCustomer(customer, link)

  // Make the primary card the customer's default for invoices
  await stripe.customers.update(stripeCustomerId, {
    invoice_settings: { default_payment_method: confirmed.pm.id },
  })

  // Cards from an earlier link/agreement are retired; the card entered in this
  // checkout is the primary. Idempotent for retries of the same intent.
  await retireOtherCards(customer.id, link.id)
  const existing = await activeCardOf(customer.id, link.id, 'primary')
  if (existing && existing.stripePaymentMethodId !== confirmed.pm.id) {
    await db.update(customerCardsTable).set({ active: false }).where(eq(customerCardsTable.id, existing.id))
  }
  if (!existing || existing.stripePaymentMethodId !== confirmed.pm.id) {
    await db.insert(customerCardsTable).values({
      id: randomBytes(16).toString('hex'),
      customerId: customer.id,
      linkId: link.id,
      stripePaymentMethodId: confirmed.pm.id,
      fingerprint: card.fingerprint,
      brand: card.brand,
      last4: card.last4,
      expMonth: card.expMonth,
      expYear: card.expYear,
      rank: 'primary',
    })
  }

  const paidAt = new Date()
  await db
    .update(paymentLinkTermsTable)
    .set({ setupPaidAt: paidAt })
    .where(eq(paymentLinkTermsTable.linkId, link.id))
  await db
    .update(customersTable)
    .set({ billingStatus: 'setup_paid', updatedAt: new Date() })
    .where(eq(customersTable.id, customer.id))

  if (confirmed.paymentIntent && terms.setupFeeCents > 0) {
    await recordIntentPayment({
      customerId: customer.id,
      linkId: link.id,
      paymentIntent: confirmed.paymentIntent,
      description: `${PRODUCT_NAME} — setup fee`,
      occurredAt: paidAt,
      cardRank: 'primary',
    })
    const charge = confirmed.paymentIntent.latest_charge
    const receiptUrl = charge && typeof charge !== 'string' ? (charge.receipt_url ?? null) : null
    await sendPaymentReceivedEmail(
      link.email,
      {
        name: link.name,
        amountCents: terms.setupFeeCents,
        description: `${PRODUCT_NAME} — setup fee`,
        paidAt: paidAt.toISOString(),
        receiptUrl,
      },
      { metadata: { paymentLinkId: link.id, paymentIntentId: confirmed.paymentIntent.id } },
    )
  }
  revalidatePath('/admin/payments')
  return { ok: true, stage: 'secondary' }
}

/**
 * Public: after Stripe.js confirmed the secondary SetupIntent, verify it,
 * reject a duplicate of the primary card, then activate the subscription.
 */
export async function recordSecondaryCard(token: string): Promise<{
  ok: boolean
  error?: string
  duplicate?: boolean
  stage?: CheckoutStage
}> {
  const found = await loadLink(token)
  if (!found) return { ok: false, error: 'This payment link is no longer active.' }
  const { link, terms, customer } = found
  if (terms.completedAt) return { ok: true, stage: 'done' }
  if (!terms.setupPaidAt) return { ok: false, error: 'Add the primary card first.', stage: 'primary' }
  if (!terms.secondaryIntentId) return { ok: false, error: 'Checkout has not been started.' }

  const primary = await activeCardOf(customer.id, link.id, 'primary')
  if (!primary) return { ok: false, error: 'Primary card is missing. Please start over.', stage: 'primary' }

  const confirmed = await confirmedPaymentMethod(terms.secondaryIntentId)
  if (!confirmed) return { ok: false, error: 'The card has not been saved yet. Please try again.' }
  const card = cardOf(confirmed.pm)

  if (isSameCard(primary, { stripePaymentMethodId: confirmed.pm.id, fingerprint: card.fingerprint })) {
    // Drop the duplicate and hand out a fresh SetupIntent on the next state fetch
    if (confirmed.pm.id !== primary.stripePaymentMethodId) {
      try {
        await stripe.paymentMethods.detach(confirmed.pm.id)
      } catch (err) {
        console.error('[v0] detach duplicate card failed:', err)
      }
    }
    await db
      .update(paymentLinkTermsTable)
      .set({ secondaryIntentId: null })
      .where(eq(paymentLinkTermsTable.linkId, link.id))
    return {
      ok: false,
      duplicate: true,
      stage: 'secondary',
      error: `That is the same card as your primary (${primary.brand} •••• ${primary.last4}). Please add a different card as your backup.`,
    }
  }

  const existingSecondary = await activeCardOf(customer.id, link.id, 'secondary')
  if (existingSecondary && existingSecondary.stripePaymentMethodId !== confirmed.pm.id) {
    await db.update(customerCardsTable).set({ active: false }).where(eq(customerCardsTable.id, existingSecondary.id))
  }
  if (!existingSecondary || existingSecondary.stripePaymentMethodId !== confirmed.pm.id) {
    await db.insert(customerCardsTable).values({
      id: randomBytes(16).toString('hex'),
      customerId: customer.id,
      linkId: link.id,
      stripePaymentMethodId: confirmed.pm.id,
      fingerprint: card.fingerprint,
      brand: card.brand,
      last4: card.last4,
      expMonth: card.expMonth,
      expYear: card.expYear,
      rank: 'secondary',
    })
  }

  try {
    await activateSubscription(link, terms, customer, primary.stripePaymentMethodId)
  } catch (err) {
    console.error('[v0] activateSubscription failed:', err)
    return { ok: false, error: 'Your cards were saved but the subscription could not be started. Our team has been notified.' }
  }
  return { ok: true, stage: 'done' }
}

/** Create the Stripe subscription (30-day trial), stamp the agreement dates, provision access. */
async function activateSubscription(
  link: LinkRow,
  terms: PaymentLinkTerms,
  customer: Customer,
  primaryPaymentMethodId: string,
): Promise<void> {
  const stripeCustomerId = await ensureStripeCustomer(customer, link)
  const setupPaidAt = terms.setupPaidAt ?? new Date()
  const { agreementStart, agreementEnd } = agreementWindow(setupPaidAt)

  let subscription: Stripe.Subscription
  if (terms.stripeSubscriptionId) {
    subscription = await stripe.subscriptions.retrieve(terms.stripeSubscriptionId)
  } else {
    subscription = await stripe.subscriptions.create(
      {
        customer: stripeCustomerId,
        items: [
          {
            price_data: {
              currency: 'usd',
              product: await accessProductId(),
              recurring: { interval: 'month' },
              unit_amount: terms.monthlyCents,
            },
          },
        ],
        trial_end: Math.floor(agreementStart.getTime() / 1000),
        default_payment_method: primaryPaymentMethodId,
        payment_settings: { payment_method_types: ['card'], save_default_payment_method: 'on_subscription' },
        trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
        proration_behavior: 'none',
        description: `${PRODUCT_NAME} — ${customer.businessName || customer.fullName}`,
        metadata: { payment_link_token: link.token, rp_customer_id: customer.id, rp_link_id: link.id },
      },
      { idempotencyKey: `sub-${link.id}` },
    )
  }

  const nextPaymentAt = subscription.trial_end
    ? new Date(subscription.trial_end * 1000)
    : agreementStart
  const completedAt = new Date()

  await db
    .update(paymentLinkTermsTable)
    .set({
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      nextPaymentAt,
      agreementStart,
      agreementEnd,
      completedAt,
    })
    .where(eq(paymentLinkTermsTable.linkId, link.id))
  await db
    .update(customersTable)
    .set({ billingStatus: subscription.status === 'trialing' ? 'trialing' : 'active', updatedAt: new Date() })
    .where(eq(customersTable.id, customer.id))

  // The Supabase row is the flag the rest of the app (and the thank-you page) reads
  await getAdminClient()
    .from('payment_links')
    .update({ status: 'paid', paid_at: setupPaidAt.toISOString() })
    .eq('id', link.id)

  // Software access is immediate
  await provisionAccounts(link.id)
  revalidatePath('/admin/payments')
  revalidatePath(`/admin/payments/${link.id}`)
}
