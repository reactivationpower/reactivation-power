import { randomUUID } from 'node:crypto'
import { pastDeadline } from '@/lib/cron/budget'
import type Stripe from 'stripe'
import { and, eq, isNull, lt, or, sql } from 'drizzle-orm'
import { agreementDeliveriesTable, agreementsTable, customerCardsTable, customersTable, db, paymentLinkTermsTable } from '@workspace/db'
import { getStripeMode, stripe } from '@/lib/stripe'
import { getAdminClient } from '@/lib/supabase/admin'
import { agreementAllowsPayment, loadAgreementByLink, loadAgreementByToken, onSetupFeePaid, onSubscriptionStarted } from '@/lib/agreements/store'
import { isSameCard } from '@/lib/billing/rules'
import { activateSubscription } from './subscriptions'
import { PRODUCT_NAME, provisionAccounts, recordIntentPayment } from './payments'
import { notifyEnrollmentWelcome } from '@/lib/billing/notifications'
import { recordAffiliateConversion } from '@/lib/affiliates/attribution'
import { reconcileMarketing } from '@/lib/marketing/reconcile'
import { logger } from '@/lib/logger'

type Rank = 'primary' | 'secondary'

async function context(token: string) {
  const loaded = await loadAgreementByToken(token)
  if (!loaded?.terms?.enrollmentFlow) return null
  if (loaded.terms.enrollmentStripeMode !== getStripeMode()) return null
  const { data: link } = await getAdminClient().from('payment_links')
    .select('id, token, name, email, amount_cents, status').eq('id', loaded.agreement.linkId).maybeSingle()
  if (!link) return null
  return { loaded, terms: loaded.terms, customer: loaded.customer, link }
}

async function savedCards(customerId: string, linkId: string, connection: Pick<typeof db, 'select'> = db) {
  return connection.select().from(customerCardsTable).where(and(
    eq(customerCardsTable.customerId, customerId),
    eq(customerCardsTable.linkId, linkId),
    eq(customerCardsTable.active, true),
  ))
}

async function stripeCustomer(customer: NonNullable<Awaited<ReturnType<typeof context>>>['customer'], linkId: string, connection: Pick<typeof db, 'update'> = db) {
  if (customer.stripeCustomerId) return customer.stripeCustomerId
  const created = await stripe.customers.create(
    { email: customer.email, name: customer.fullName, metadata: { rp_customer_id: customer.id } },
    { idempotencyKey: `enroll-customer-${customer.id}` },
  )
  await connection.update(customersTable).set({ stripeCustomerId: created.id }).where(eq(customersTable.id, customer.id))
  await connection.update(paymentLinkTermsTable).set({ stripeCustomerId: created.id }).where(eq(paymentLinkTermsTable.linkId, linkId))
  return created.id
}

/** A SetupIntent is only a card-save authorization. No PaymentIntent exists until confirmation. */
export async function checkout(token: string) {
  const c = await context(token)
  if (!c) return { ok: false, error: 'Enrollment agreement not found.' }
  await reconcile(token)
  if (!c.loaded.agreement.signedAt) return { ok: true, checkout: { stage: 'awaiting_signature', cards: [], dueCents: c.terms.setupFeeCents, monthlyCents: c.terms.monthlyCents } }
  let cards = await savedCards(c.customer.id, c.link.id)
  if (cards.length < (c.terms.type === 'subscription' ? 2 : 1)) {
    const intentId = cards.some(card => card.rank === 'primary') ? c.terms.secondaryIntentId : c.terms.primaryIntentId
    if (intentId?.startsWith('seti_') && (await stripe.setupIntents.retrieve(intentId)).status === 'succeeded') {
      await saveCard(token)
      cards = await savedCards(c.customer.id, c.link.id)
    }
  }
  const required = c.terms.type === 'subscription' ? 2 : 1
  const dueCents = c.terms.type === 'subscription' ? c.loaded.agreement.setupFeeCents : c.link.amount_cents
  const existing = c.terms.enrollmentPaymentIntentId
    ? await stripe.paymentIntents.retrieve(c.terms.enrollmentPaymentIntentId) : null
  if (c.terms.completedAt) return { ok: true, checkout: { stage: 'done', cards: [], dueCents, monthlyCents: c.terms.monthlyCents } }
  if (existing?.status === 'processing') return { ok: true, checkout: { stage: 'processing', cards: [], dueCents, monthlyCents: c.terms.monthlyCents } }
  const stage = cards.length < required ? (cards.some(card => card.rank === 'primary') ? 'secondary' : 'primary') : 'ready'
  let secret: string | null = null
  if (stage === 'primary' || stage === 'secondary') {
    const field = stage === 'primary' ? 'primaryIntentId' : 'secondaryIntentId'
    const customerId = await stripeCustomer(c.customer, c.link.id)
    let intent: Stripe.SetupIntent | null = c.terms[field]?.startsWith('seti_')
      ? await stripe.setupIntents.retrieve(c.terms[field]!) : null
    if (intent?.status !== 'requires_payment_method' && intent?.status !== 'requires_confirmation' && intent?.status !== 'requires_action') intent = null
    if (!intent) {
      intent = await stripe.setupIntents.create({
        customer: customerId, payment_method_types: ['card'], usage: 'off_session',
        metadata: { rp_link_id: c.link.id, step: stage },
      })
      await db.update(paymentLinkTermsTable).set({ [field]: intent.id }).where(eq(paymentLinkTermsTable.linkId, c.link.id))
    }
    secret = intent.client_secret
  }
  return {
    ok: true,
    checkout: {
      stage, cards: cards.map(card => ({ id: card.id, brand: card.brand, last4: card.last4, rank: card.rank })),
      dueCents, monthlyCents: c.terms.monthlyCents, clientSecret: secret,
      paymentStatus: existing?.status ?? null,
    },
  }
}

export async function saveCard(token: string) {
  const c = await context(token)
  if (!c) return { ok: false, error: 'Enrollment agreement not found.' }
  const gate = await agreementAllowsPayment(c.link.id)
  if (!gate.ok) return gate
  if (c.terms.completedAt) return { ok: true }
  const cards = await savedCards(c.customer.id, c.link.id)
  const required = c.terms.type === 'subscription' ? 2 : 1
  if (cards.length >= required) return { ok: true }
  const rank: Rank = cards.some(card => card.rank === 'primary') ? 'secondary' : 'primary'
  const id = rank === 'primary' ? c.terms.primaryIntentId : c.terms.secondaryIntentId
  if (!id?.startsWith('seti_')) return { ok: false, error: 'Save the card in the secure form first.' }
  const intent = await stripe.setupIntents.retrieve(id, { expand: ['payment_method'] })
  if (intent.status !== 'succeeded' || !intent.payment_method || typeof intent.payment_method === 'string')
    return { ok: false, error: 'Card authorization has not completed yet.' }
  const pm = intent.payment_method
  if (!pm.card) return { ok: false, error: 'A card is required.' }
  if (cards.some(card => card.stripePaymentMethodId === pm.id)) return { ok: true }
  if (cards.some(card => isSameCard(card, { stripePaymentMethodId: pm.id, fingerprint: pm.card!.fingerprint ?? null }))) {
    await stripe.paymentMethods.detach(pm.id)
    await db.update(paymentLinkTermsTable).set({ secondaryIntentId: null }).where(eq(paymentLinkTermsTable.linkId, c.link.id))
    return { ok: false, duplicate: true, error: 'Please save a different physical card. Two copies of the same card cannot be used.' }
  }
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${c.link.id}))`)
    const current = await savedCards(c.customer.id, c.link.id, tx)
    if (current.some(card => card.stripePaymentMethodId === pm.id)) return
    if (current.some(card => isSameCard(card, { stripePaymentMethodId: pm.id, fingerprint: pm.card!.fingerprint ?? null })))
      throw new Error('That physical card is already saved. Please choose another.')
    if (current.length >= required) return
    const persistedRank = current.some(card => card.rank === 'primary') ? 'secondary' : 'primary'
    await tx.insert(customerCardsTable).values({
      id: randomUUID(), customerId: c.customer.id, linkId: c.link.id,
      stripePaymentMethodId: pm.id, fingerprint: pm.card!.fingerprint ?? null,
      brand: pm.card!.brand, last4: pm.card!.last4, expMonth: pm.card!.exp_month, expYear: pm.card!.exp_year,
      rank: persistedRank,
    })
    // Durable evidence is committed with the Stripe-verified local card save.
    // Replacement and retry never reset a milestone, even if ranks later swap.
    await tx.update(agreementsTable).set(persistedRank === 'primary'
      ? { primaryCardSavedAt: sql`coalesce(${agreementsTable.primaryCardSavedAt}, now())` }
      : { backupCardSavedAt: sql`coalesce(${agreementsTable.backupCardSavedAt}, now())` })
      .where(eq(agreementsTable.id, c.loaded.agreement.id))
  })
  return { ok: true }
}

export async function replaceCard(token: string, cardId: string) {
  const c = await context(token)
  if (!c) return { ok: false, error: 'Enrollment agreement not found.' }
  if (c.terms.completedAt) return { ok: false, error: 'Enrollment is already complete.' }
  const prior = c.terms.enrollmentPaymentIntentId
    ? await stripe.paymentIntents.retrieve(c.terms.enrollmentPaymentIntentId) : null
  if (prior && ['processing', 'succeeded', 'requires_action', 'requires_confirmation'].includes(prior.status))
    return { ok: false, error: 'Wait for the current payment to finish before replacing a card.' }
  const cards = await savedCards(c.customer.id, c.link.id)
  const card = cards.find(row => row.id === cardId)
  if (!card) return { ok: false, error: 'This card is not saved for this link.' }
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${c.link.id}))`)
    await tx.update(customerCardsTable).set({ active: false }).where(and(eq(customerCardsTable.id, card.id), eq(customerCardsTable.linkId, c.link.id)))
    await tx.update(paymentLinkTermsTable)
      .set(card.rank === 'primary' ? { primaryIntentId: null } : { secondaryIntentId: null })
      .where(eq(paymentLinkTermsTable.linkId, c.link.id))
  })
  await stripe.paymentMethods.detach(card.stripePaymentMethodId)
  return { ok: true }
}

/** Reconcile a successful intent even if Stripe redirected and the browser never returned. */
export async function reconcile(token: string) {
  const c = await context(token)
  if (!c) return { ok: false, error: 'Enrollment agreement not found.' }
  if (c.terms.completedAt) {
    await finish(c.link.id, null)
    return { ok: true, completed: true }
  }
  if (!c.terms.enrollmentPaymentIntentId) {
    if (c.terms.setupFeeCents === 0 && c.terms.enrollmentSelectedMethodId) {
      await finish(c.link.id, null, c.terms.enrollmentSelectedMethodId)
      return { ok: true, completed: true }
    }
    return { ok: true, completed: false }
  }
  const intent = await stripe.paymentIntents.retrieve(c.terms.enrollmentPaymentIntentId)
  if (intent.status === 'succeeded') {
    await finish(c.link.id, intent)
    return { ok: true, completed: true }
  }
  if (intent.status === 'requires_confirmation') {
    const confirmed = await stripe.paymentIntents.confirm(intent.id, {}, { idempotencyKey: `enroll-sca-${intent.id}` })
    if (confirmed.status === 'succeeded') {
      await finish(c.link.id, confirmed)
      return { ok: true, completed: true }
    }
  }
  return { ok: true, completed: false, status: intent.status }
}

/** Daily recovery if the buyer closes the browser or an endpoint omits PI events. */
/** Stops between enrollments at the deadline (`incomplete: true`); the cron continuation finishes the rest. */
export async function reconcilePendingEnrollments(opts: { deadline?: number } = {}) {
  const pending = await db.select({ token: agreementsTable.token })
    .from(paymentLinkTermsTable)
    .innerJoin(agreementsTable, eq(agreementsTable.linkId, paymentLinkTermsTable.linkId))
    .where(and(
      eq(paymentLinkTermsTable.enrollmentFlow, true),
      eq(paymentLinkTermsTable.enrollmentStripeMode, getStripeMode()),
      sql`(
        (${paymentLinkTermsTable.completedAt} IS NULL AND
          (${paymentLinkTermsTable.enrollmentPaymentIntentId} IS NOT NULL OR ${paymentLinkTermsTable.enrollmentSelectedMethodId} IS NOT NULL))
        OR (${paymentLinkTermsTable.completedAt} IS NOT NULL AND
          (${agreementsTable.completedAt} IS NULL OR ${agreementsTable.pdfPath} IS NULL OR EXISTS (
            SELECT 1 FROM ${agreementDeliveriesTable}
            WHERE ${agreementDeliveriesTable.agreementId} = ${agreementsTable.id}
              AND ${agreementDeliveriesTable.status} IN ('pending', 'failed', 'sending')
          )))
      )`,
    )).limit(100)
  let completed = 0
  let examined = 0
  let incomplete = false
  const errors: string[] = []
  for (const row of pending) {
    if (pastDeadline(opts.deadline, 10_000)) { incomplete = true; break }
    examined++
    try {
      const result = await reconcile(row.token)
      if (result.completed) completed++
    } catch (e) {
      errors.push(e instanceof Error ? e.message : 'Reconciliation failed')
    }
  }
  if (errors.length) throw new Error(`${errors.length} enrollment(s) could not be reconciled: ${errors[0]}`)
  return { examined, completed, ...(incomplete ? { incomplete: true } : {}) }
}

/** The selected card must be a card saved for this link, never a customer-wide default. */
export async function confirm(token: string, cardId: string) {
  const c = await context(token)
  if (!c) return { ok: false, error: 'Enrollment agreement not found.' }
  const gate = await agreementAllowsPayment(c.link.id)
  if (!gate.ok) return gate
  if (c.terms.completedAt) return { ok: true, completed: true }
  const cards = await savedCards(c.customer.id, c.link.id)
  const required = c.terms.type === 'subscription' ? 2 : 1
  if (cards.length !== required) return { ok: false, error: `Please save ${required} different card${required === 1 ? '' : 's'} first.` }
  const selected = cards.find(card => card.id === cardId)
  if (!selected) return { ok: false, error: 'Choose a card saved for this enrollment.' }
  if (required === 2 && isSameCard(cards[0], cards[1])) return { ok: false, error: 'Two different cards are required.' }
  const due = c.terms.type === 'subscription' ? c.loaded.agreement.setupFeeCents : c.link.amount_cents
  if (due !== c.loaded.agreement.setupFeeCents || c.terms.setupFeeCents !== due)
    return { ok: false, error: 'The agreement amount changed. Ask for a new agreement before paying.' }
  if (c.terms.type === 'subscription' && (
    c.terms.monthlyCents !== c.loaded.agreement.monthlyCents ||
    c.terms.termMonths !== c.loaded.agreement.termMonths))
    return { ok: false, error: 'The recurring terms no longer match the signed agreement.' }
  if (due === 0) {
    if (c.terms.type !== 'subscription') return { ok: false, error: 'A full-payment purchase cannot be waived.' }
    const method = await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${c.link.id}))`)
      const [current] = await tx.select().from(paymentLinkTermsTable).where(eq(paymentLinkTermsTable.linkId, c.link.id))
      const methodId = current.enrollmentSelectedMethodId ?? selected.stripePaymentMethodId
      await tx.update(paymentLinkTermsTable).set({ enrollmentSelectedMethodId: methodId })
        .where(eq(paymentLinkTermsTable.linkId, c.link.id))
      return methodId
    })
    await finish(c.link.id, null, method)
    return { ok: true, completed: true }
  }
  let intent: Stripe.PaymentIntent
  // Reuse a pending intent; once declined, create a fresh attempt. The advisory
  // lock prevents two clicks from creating separate chargeable intents.
  intent = await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${c.link.id}))`)
    const [fresh] = await tx.select().from(paymentLinkTermsTable).where(eq(paymentLinkTermsTable.linkId, c.link.id))
    if (fresh.completedAt) throw new Error('Enrollment is already complete.')
    const currentCards = await savedCards(c.customer.id, c.link.id, tx)
    if (!currentCards.some(card => card.id === cardId && card.stripePaymentMethodId === selected.stripePaymentMethodId))
      throw new Error('That card was replaced. Refresh and choose an active card.')
    const prior = fresh.enrollmentPaymentIntentId ? await stripe.paymentIntents.retrieve(fresh.enrollmentPaymentIntentId) : null
    if (prior?.status === 'succeeded' || prior?.status === 'processing')
      return prior
    if (prior?.status === 'requires_action' || prior?.status === 'requires_confirmation' ||
      (prior?.status === 'requires_payment_method' && !prior.last_payment_error)) {
      if (prior.payment_method && (typeof prior.payment_method === 'string' ? prior.payment_method : prior.payment_method.id) !== selected.stripePaymentMethodId)
        throw new Error('A payment is already awaiting confirmation with a different card. Finish that attempt before selecting another card.')
      return prior
    }
    const created = await stripe.paymentIntents.create({
      amount: due, currency: 'usd', customer: await stripeCustomer(c.customer, c.link.id, tx),
      payment_method_types: ['card'], payment_method: selected.stripePaymentMethodId,
      description: `${PRODUCT_NAME} — ${c.terms.type === 'subscription' ? 'initial payment' : 'full payment'}`,
      receipt_email: c.link.email,
      metadata: { rp_link_id: c.link.id, agreement_id: c.loaded.agreement.id, version: String(c.loaded.agreement.currentVersion) },
    }, { idempotencyKey: `enroll-${c.link.id}-${randomUUID()}` })
    await tx.update(paymentLinkTermsTable).set({ enrollmentPaymentIntentId: created.id }).where(eq(paymentLinkTermsTable.linkId, c.link.id))
    return created
  })
  // Commit the intent ID BEFORE any charge attempt. A decline or lost Stripe
  // response must never roll back the identifier needed to reconcile success.
  if (intent.status === 'requires_confirmation' ||
    (intent.status === 'requires_payment_method' && !intent.last_payment_error)) {
    try {
      intent = await stripe.paymentIntents.confirm(intent.id, {}, { idempotencyKey: `enroll-confirm-${intent.id}` })
    } catch (e) {
      // Stripe can accept a charge while its response is interrupted.
      intent = await stripe.paymentIntents.retrieve(intent.id)
      if (!['succeeded', 'processing', 'requires_action'].includes(intent.status))
        return { ok: false, error: intent.last_payment_error?.message ??
          (e instanceof Error ? e.message : 'Payment failed. Your signature is saved; try again or replace the card.') }
    }
  }
  if (intent.status === 'succeeded') {
    await finish(c.link.id, intent, selected.stripePaymentMethodId)
    return { ok: true, completed: true }
  }
  if (intent.status === 'processing') return { ok: true, processing: true }
  if (intent.status === 'requires_action')
    return { ok: true, requiresAction: true, clientSecret: intent.client_secret }
  return { ok: false, error: intent.last_payment_error?.message ?? 'Payment declined. Your signature and cards are saved; try again or select the other card.' }
}

async function finish(linkId: string, intent: Stripe.PaymentIntent | null, selectedMethodId?: string) {
  // A short, recoverable DB claim serializes tabs and webhooks. Never hold
  // row locks while external services provision accounts or send email.
  const lease = new Date()
  const [terms] = await db.update(paymentLinkTermsTable).set({ enrollmentFinalizingAt: lease })
    .where(and(eq(paymentLinkTermsTable.linkId, linkId), isNull(paymentLinkTermsTable.completedAt),
      or(isNull(paymentLinkTermsTable.enrollmentFinalizingAt),
        lt(paymentLinkTermsTable.enrollmentFinalizingAt, new Date(lease.getTime() - 5 * 60_000)))))
    .returning()
  if (!terms) {
    const [current] = await db.select().from(paymentLinkTermsTable).where(eq(paymentLinkTermsTable.linkId, linkId))
    if (current?.completedAt) {
      await recordAffiliateConversion(current.customerId, current.completedAt)
      await reconcileMarketing().catch(() => logger.warn('Marketing conversion awaits reconciliation'))
      await provisionAccounts(linkId)
      await onSubscriptionStarted(linkId, { monthlyCents: current.monthlyCents, firstChargeAt: current.nextPaymentAt })
      await notifyEnrollmentWelcome(linkId)
      return
    }
    throw new Error('Enrollment completion is in progress. Reload shortly; the card will not be charged again.')
  }
  try {
    const gate = await agreementAllowsPayment(linkId)
    if (!gate.ok) throw new Error(gate.error)
    const signed = await loadAgreementByLink(linkId)
    if (!signed || signed.agreement.setupFeeCents !== terms.setupFeeCents ||
      (terms.type === 'subscription' && (signed.agreement.monthlyCents !== terms.monthlyCents ||
        signed.agreement.termMonths !== terms.termMonths)))
      throw new Error('Enrollment terms do not match the signed agreement.')
    const cards = await savedCards(terms.customerId, linkId)
    if (cards.length < (terms.type === 'subscription' ? 2 : 1)) throw new Error('Required cards are missing.')
    if (intent && (intent.id !== terms.enrollmentPaymentIntentId || intent.status !== 'succeeded' ||
      intent.amount_received !== (terms.type === 'subscription' ? terms.setupFeeCents : Number((await getAdminClient().from('payment_links').select('amount_cents').eq('id', linkId).single()).data?.amount_cents))))
      throw new Error('Payment has not succeeded.')
    if (!intent && terms.setupFeeCents !== 0) throw new Error('Payment is required.')
    // Stripe's actual successful payment method wins if the browser switched
    // its radio selection after a prior confirmation had already succeeded.
    const pmId = intent
      ? (typeof intent.payment_method === 'string' ? intent.payment_method : intent.payment_method?.id)
      : selectedMethodId
    if (!pmId || !cards.some(card => card.stripePaymentMethodId === pmId))
      throw new Error('Initial payment did not use a card saved for this agreement.')
    const selected = cards.find(card => card.stripePaymentMethodId === pmId)!
    if (selected.rank !== 'primary') {
      await db.update(customerCardsTable).set({ rank: 'secondary' }).where(eq(customerCardsTable.id, cards.find(card => card.rank === 'primary')!.id))
      await db.update(customerCardsTable).set({ rank: 'primary' }).where(eq(customerCardsTable.id, selected.id))
    }
    const stripeCustomerId = await stripeCustomer((await db.select().from(customersTable).where(eq(customersTable.id, terms.customerId)))[0], linkId)
    await stripe.customers.update(stripeCustomerId, { invoice_settings: { default_payment_method: pmId } })
    const now = intent?.latest_charge
      ? new Date((await stripe.charges.retrieve(typeof intent.latest_charge === 'string' ? intent.latest_charge : intent.latest_charge.id)).created * 1000)
      : intent ? new Date(intent.created * 1000) : new Date()
    if (intent) await recordIntentPayment({
      customerId: terms.customerId, linkId, paymentIntent: intent,
      description: `${PRODUCT_NAME} — ${terms.type === 'subscription' ? 'initial payment' : 'full payment'}`,
      occurredAt: now, cardRank: 'primary',
    })
    if (terms.type === 'subscription') {
      await onSetupFeePaid(linkId, {
        amountCents: terms.setupFeeCents,
        card: { brand: selected.brand, last4: selected.last4 },
        paidAt: now,
      })
      const { data: link } = await getAdminClient().from('payment_links').select('id, token, name, email, phone, status').eq('id', linkId).single()
      if (!link) throw new Error('Link not found.')
      await activateSubscription(link, { ...terms, setupPaidAt: now }, (await db.select().from(customersTable).where(eq(customersTable.id, terms.customerId)))[0], pmId)
    } else {
      await db.update(agreementsTable).set({ setupPaidAt: now, updatedAt: new Date() })
        .where(eq(agreementsTable.linkId, linkId))
      await db.update(paymentLinkTermsTable).set({ completedAt: now, setupPaidAt: now }).where(eq(paymentLinkTermsTable.linkId, linkId))
      await db.update(customersTable).set({ billingStatus: 'paid' }).where(eq(customersTable.id, terms.customerId))
      const { error } = await getAdminClient().from('payment_links').update({ status: 'paid', paid_at: now.toISOString() }).eq('id', linkId)
      if (error) throw error
      await provisionAccounts(linkId)
      await onSubscriptionStarted(linkId, { monthlyCents: 0, firstChargeAt: null })
    }
    // Account-active + schedule-onboarding emails; once per enrollment (outbox), never fatal.
    await notifyEnrollmentWelcome(linkId)
    // Waived setup fees are still a conversion; do not wait for a first monthly invoice to lock the lead.
    await recordAffiliateConversion(terms.customerId, now)
    await reconcileMarketing().catch(() => logger.warn('Marketing conversion awaits reconciliation'))
  } finally {
    await db.update(paymentLinkTermsTable).set({ enrollmentFinalizingAt: null })
      .where(and(eq(paymentLinkTermsTable.linkId, linkId), eq(paymentLinkTermsTable.enrollmentFinalizingAt, lease)))
  }
}
