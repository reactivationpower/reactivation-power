/**
 * Manual, disposable sandbox-only integration check. Never run against live
 * Stripe or deliverable email addresses. Requires an ephemeral admin fixture
 * in /tmp/patient-pipeline-idle-fixture.json.
 */
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { getStripeMode, initStripe, stripe } from '@/lib/stripe'
import { agreementsTable, agreementDeliveriesTable, customerCardsTable, customersTable, db, pool, paymentLinkTermsTable, paymentHistoryTable } from '@workspace/db'
import { and, desc, eq, isNotNull, like } from 'drizzle-orm'
import { dispatchEvent } from '@/routes/webhooks-stripe'
import { getAdminClient } from '@/lib/supabase/admin'
import { del } from '@vercel/blob'
import { addCalendarMonths } from '@/lib/billing/rules'

await initStripe()
if (getStripeMode() !== 'test') throw new Error('Refusing to run outside Stripe test mode')

if (process.argv[2] === 'anchor-check') {
  const customer = await stripe.customers.create({ email: 'anchor-sandbox@example.invalid' })
  let subscriptionId: string | null = null
  try {
    const product = (await stripe.products.list({ active: true, limit: 100 })).data.find(p => p.metadata?.rp_product === 'access')
    if (!product) throw new Error('Sandbox access product missing')
    const paidAt = new Date(Date.now() - 5000)
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price_data: { product: product.id, currency: 'usd', recurring: { interval: 'month' }, unit_amount: 50 } }],
      trial_end: Math.floor(addCalendarMonths(paidAt, 1).getTime() / 1000),
      billing_cycle_anchor_config: { day_of_month: paidAt.getUTCDate(), hour: paidAt.getUTCHours(), minute: paidAt.getUTCMinutes(), second: paidAt.getUTCSeconds() },
      proration_behavior: 'none',
    })
    subscriptionId = subscription.id
    console.log('calendar trial and explicit original-day billing anchor accepted by Stripe sandbox')
  } finally {
    if (subscriptionId) await stripe.subscriptions.cancel(subscriptionId)
    await stripe.customers.del(customer.id)
  }
  process.exit(0)
}
if (process.argv[2] === 'cleanup') {
  const fixtures = await pool.query(`SELECT c.id AS customer_id, c.participant_id, c.stripe_customer_id,
    t.link_id, t.stripe_subscription_id, a.id AS agreement_id, a.pdf_path
    FROM customers c JOIN payment_link_terms t ON t.customer_id=c.id
    LEFT JOIN agreements a ON a.link_id=t.link_id
    WHERE t.enrollment_stripe_mode='test' AND
    ((c.email LIKE 'enroll-sandbox-%@example.invalid' AND c.full_name LIKE 'Sandbox Enrollment %')
      OR c.email='enroll-5f29823a@example.invalid')`)
  for (const fixture of fixtures.rows) {
    if (fixture.stripe_subscription_id) {
      const subscription = await stripe.subscriptions.retrieve(fixture.stripe_subscription_id)
      if (subscription.status !== 'canceled') await stripe.subscriptions.cancel(subscription.id)
    }
    if (fixture.stripe_customer_id) await stripe.customers.del(fixture.stripe_customer_id)
    if (fixture.pdf_path) await del(fixture.pdf_path)
    const connection = await pool.connect()
    try {
      await connection.query('BEGIN')
      for (const table of ['agreement_deliveries', 'agreement_events', 'agreement_initials', 'agreement_versions'])
        await connection.query(`DELETE FROM ${table} WHERE agreement_id=$1`, [fixture.agreement_id])
      await connection.query('DELETE FROM agreements WHERE id=$1', [fixture.agreement_id])
      for (const table of ['commission_entries', 'payment_history', 'customer_cards', 'billing_links'])
        await connection.query(`DELETE FROM ${table} WHERE customer_id=$1`, [fixture.customer_id])
      await connection.query('DELETE FROM payment_link_terms WHERE link_id=$1', [fixture.link_id])
      await connection.query('DELETE FROM customers WHERE id=$1', [fixture.customer_id])
      await connection.query('COMMIT')
    } catch (error) {
      await connection.query('ROLLBACK')
      throw error
    } finally { connection.release() }
    const links = await getAdminClient().from('payment_links').delete().eq('id', fixture.link_id)
    if (links.error) throw links.error
    if (fixture.participant_id) {
      const participant = await getAdminClient().from('participants').delete().eq('id', fixture.participant_id)
      if (participant.error) throw participant.error
    }
  }
  console.log(`Removed ${fixtures.rows.length} disposable enrollment customers, private PDFs and sandbox subscriptions; mail logs retained for audit`)
  process.exit(0)
}

if (process.argv[2] === 'replay') {
  const [fixture] = await db.select({ terms: paymentLinkTermsTable, agreement: agreementsTable })
    .from(paymentLinkTermsTable).innerJoin(customersTable, eq(customersTable.id, paymentLinkTermsTable.customerId))
    .innerJoin(agreementsTable, eq(agreementsTable.linkId, paymentLinkTermsTable.linkId))
    .where(and(like(customersTable.email, 'enroll-sandbox-%@example.invalid'),
      eq(paymentLinkTermsTable.enrollmentStripeMode, 'test'), isNotNull(paymentLinkTermsTable.enrollmentPaymentIntentId),
      isNotNull(paymentLinkTermsTable.completedAt))).orderBy(desc(paymentLinkTermsTable.completedAt)).limit(1)
  if (!fixture) throw new Error('No completed sandbox fixture to replay')
  const countState = async () => ({
    payments: (await db.select().from(paymentHistoryTable).where(eq(paymentHistoryTable.linkId, fixture.terms.linkId))).length,
    deliveries: (await db.select().from(agreementDeliveriesTable).where(eq(agreementDeliveriesTable.agreementId, fixture.agreement.id))).map(d => `${d.id}:${d.attempts}`).sort(),
    subscriptions: (await stripe.subscriptions.list({ customer: fixture.terms.stripeCustomerId!, status: 'all', limit: 100 })).data.length,
    pdf: (await db.select().from(agreementsTable).where(eq(agreementsTable.id, fixture.agreement.id)))[0].pdfPath,
  })
  const before = JSON.stringify(await countState())
  const intent = await stripe.paymentIntents.retrieve(fixture.terms.enrollmentPaymentIntentId!)
  for (let i = 0; i < 2; i++) {
    const result = await dispatchEvent({ id: 'evt_disposable_replay', type: 'payment_intent.succeeded', data: { object: intent } } as any)
    if (!result.handled) throw new Error('Enrollment webhook did not reconcile the agreement')
  }
  if (JSON.stringify(await countState()) !== before) throw new Error('Replayed success duplicated a payment, subscription, PDF or delivery')
  console.log('duplicate sandbox payment-success deliveries: no duplicate payment, subscription, PDF or completion email')
  process.exit(0)
}
const fixture = JSON.parse(readFileSync('/tmp/patient-pipeline-idle-fixture.json', 'utf8'))
const origin = 'http://localhost:80'
let cookie = ''
async function call(module: string, fn: string, ...args: unknown[]): Promise<any> {
  const response = await fetch(`${origin}/api/actions/${module}/${fn}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ args }),
    signal: AbortSignal.timeout(90_000),
  })
  const setCookie = response.headers.get('set-cookie')
  if (setCookie) cookie = setCookie.split(';')[0]
  const value = await response.json() as any
  if (!response.ok || !value.ok) throw new Error(`${module}.${fn}: ${value.error ?? response.status}`)
  if (value.result?.ok === false) throw new Error(`${module}.${fn}: ${value.result.error}`)
  return value.result
}

await call('admin-auth', 'adminLogin', null,
  { __formData: [['email', fixture.email], ['password', fixture.password], ['next', '/admin/payments']] })
if (!cookie) throw new Error('No disposable admin session')

for (const waived of process.argv[2] === 'duplicate' ? [true] : ['decline', 'authentication'].includes(process.argv[2]) ? [false] : [true, false]) {
  const suffix = randomUUID().slice(0, 8)
  const email = `enroll-sandbox-${suffix}@example.invalid`
  const customer = {
    fullName: `Sandbox Enrollment ${suffix}`, businessName: `Sandbox Practice ${suffix}`,
    businessAddress: '100 Test Street, Austin, TX 78701', phone: '(512) 555-0100',
    ownerName: `Sandbox Enrollment ${suffix}`, ownerPhone: '(512) 555-0100', email,
  }
  const created = await call('payments', 'createPaymentLink', {
    customer, staff: [], offer: { type: 'subscription', monthlyDollars: 3.30, setupFeeDollars: waived ? 0 : 4.99 },
  })
  const link = created.link
  if (!link?.id || link.status !== 'pending') throw new Error('Creation did not leave a pending link')
  const form = (await call('agreements', 'getAgreementSendForm', link.id)).form
  if (form.monthlyDollars !== 3.30 || form.setupFeeDollars !== (waived ? 0 : 4.99))
    throw new Error('Negotiated prices were not carried into the agreement')
  const sent = await call('agreements', 'sendAgreement', link.id, form, { signerEmail: email, copyEmails: [] })
  const token = sent.detail?.agreement?.token
  if (!token) throw new Error('Agreement token missing after send')
  const agreement = await call('agreements', 'getAgreementPublic', token)
  if (agreement.completed || agreement.signed) throw new Error('Agreement completed before consent')
  for (const section of agreement.document.sections.filter((s: any) => s.requiresInitials))
    await call('agreements', 'recordAgreementInitials', token, { version: agreement.version, sectionId: section.id, initials: 'SE' })
  await call('agreements', 'signAgreement', token, {
    version: agreement.version, consent: true, signerName: customer.fullName, signerTitle: 'Owner',
    signatureType: 'typed', signatureData: customer.fullName,
  })
  const signed = await call('agreements', 'getAgreementPublic', token)
  if (!signed.signed || signed.completed) throw new Error('Signing should not finish enrollment')
  const methods = [process.argv[2] === 'decline' ? 'pm_card_chargeCustomerFail' : 'pm_card_visa', 'pm_card_mastercard']
  for (const [index, paymentMethod] of methods.entries()) {
    if (index === 1 && process.argv[2] === 'duplicate') {
      const duplicateCheckout = await call('agreements', 'getEnrollmentCheckout', token)
      const duplicateId = duplicateCheckout.checkout.clientSecret.split('_secret_')[0]
      const attempt = await stripe.setupIntents.confirm(duplicateId, { payment_method: 'pm_card_visa' })
      if (attempt.status !== 'succeeded') throw new Error('Duplicate-card test setup did not succeed')
      const duplicateResponse = await fetch(`${origin}/api/actions/agreements/recordEnrollmentCard`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ args: [token] }),
      })
      const duplicate = (await duplicateResponse.json() as any).result
      if (!duplicate?.duplicate || duplicate.ok) throw new Error('Duplicate physical card was not rejected')
      console.log('duplicate physical card: rejected by Stripe fingerprint')
    }
    const checkout = await call('agreements', 'getEnrollmentCheckout', token)
    if (!checkout.ok || !checkout.checkout.clientSecret) throw new Error('Expected card-save SetupIntent')
    const setupId = checkout.checkout.clientSecret.split('_secret_')[0]
    const setup = await stripe.setupIntents.confirm(setupId, { payment_method: paymentMethod })
    if (setup.status !== 'succeeded') throw new Error(`SetupIntent did not succeed: ${setup.status}`)
    await call('agreements', 'recordEnrollmentCard', token)
  }
  const ready = (await call('agreements', 'getEnrollmentCheckout', token)).checkout
  if (ready.stage !== 'ready' || ready.cards.length !== 2) throw new Error('Two distinct cards were not required')
  const selected = process.argv[2] === 'duplicate' ? ready.cards[0] : ready.cards[1]
  if (process.argv[2] === 'authentication') {
    // Model an issuer requiring authentication on a previously saved card.
    // Only this disposable fixture is changed; card-save UI was checked separately.
    const [saved] = await db.select().from(customerCardsTable).where(eq(customerCardsTable.id, ready.cards[0].id))
    const original = await stripe.paymentMethods.retrieve(saved.stripePaymentMethodId)
    const customerId = typeof original.customer === 'string' ? original.customer : original.customer!.id
    const authCard = await stripe.paymentMethods.attach('pm_card_authenticationRequired', { customer: customerId })
    await db.update(customerCardsTable).set({ stripePaymentMethodId: authCard.id, fingerprint: authCard.card?.fingerprint ?? null })
      .where(and(eq(customerCardsTable.id, saved.id), eq(customerCardsTable.linkId, link.id)))
    const challenge = await call('agreements', 'confirmEnrollment', token, ready.cards[0].id)
    if (!challenge.requiresAction || challenge.completed) throw new Error('Authentication challenge incorrectly completed enrollment')
    const pending = await call('agreements', 'getAgreementPublic', token)
    if (!pending.signed || pending.completed) throw new Error('Authentication challenge lost signature or falsely completed')
    const [terms] = await db.select().from(paymentLinkTermsTable).where(eq(paymentLinkTermsTable.linkId, link.id))
    await stripe.paymentIntents.cancel(terms.enrollmentPaymentIntentId!)
    console.log('sandbox authentication required: no completion or backup charge; canceled attempt can explicitly retry another card')
  }
  if (process.argv[2] === 'decline') {
    let declined = false
    try { await call('agreements', 'confirmEnrollment', token, ready.cards[0].id) }
    catch (e) { declined = /declin/i.test(String(e)) }
    if (!declined) throw new Error('Expected an initial charge decline')
    const stillSigned = await call('agreements', 'getAgreementPublic', token)
    if (!stillSigned.signed || stillSigned.completed) throw new Error('Decline lost signature or falsely completed enrollment')
    console.log('initial payment declined: signature preserved; explicit retry selects the other saved card')
  }
  const final = await call('agreements', 'confirmEnrollment', token, selected.id)
  if (!final.completed) throw new Error('Explicit final confirmation did not complete')
  const recovered = await call('agreements', 'reconcileEnrollment', token)
  if (!recovered.completed) throw new Error('Reload reconciliation lost completed enrollment')
  const after = await call('agreements', 'getAgreementPublic', token)
  if (!after.completed || !after.pdf_ready || !after.delivery_status?.some((d: any) => d.recipient === email))
    throw new Error('Signed copy or signer delivery status missing')
  const state = (await call('agreements', 'getEnrollmentCheckout', token)).checkout
  if (state.stage !== 'done') throw new Error('Completion was not idempotent')
  console.log(`${waived ? 'waived' : 'paid'} subscription: signed separately, two cards, second selected, enrollment complete, PDF stored`)
}
