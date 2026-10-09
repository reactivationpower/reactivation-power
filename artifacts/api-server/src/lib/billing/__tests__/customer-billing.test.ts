/**
 * Customer billing service tests.
 *
 * The throttle tests are pure. The remaining suites drive the real Stripe
 * sandbox (the workspace Stripe integration) plus the Supabase drizzle tables,
 * so they self-skip when Stripe cannot be initialised. They create disposable
 * customers and subscriptions and remove them in afterAll.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import {
  billingLinksTable,
  billingNotificationsTable,
  commissionEntriesTable,
  customerCardsTable,
  customersTable,
  db,
  paymentHistoryTable,
  paymentLinkTermsTable,
  type Customer,
  type PaymentLinkTerms,
} from '@workspace/db'

vi.mock('@/lib/data/participants', () => ({
  getCurrentParticipant: vi.fn(async () => currentParticipant),
}))
vi.mock('@/lib/data/admin-users', () => ({
  listAdminUsers: vi.fn(async () => []),
  getAdminUserById: vi.fn(async () => null),
}))
vi.mock('@/lib/mail', () => ({
  sendBillingLinkEmail: vi.fn(async () => ({ ok: true })),
  sendCancellationRequestedEmail: vi.fn(async () => ({ ok: true })),
  sendCancellationScheduledEmail: vi.fn(async (...args: unknown[]) => {
    scheduledEmails.push(args)
    return { ok: true }
  }),
  sendSubscriptionCancelledEmail: vi.fn(async () => ({ ok: true })),
  // The billing_notifications outbox calls sendEmail directly; without a
  // mock it would throw inside enqueueAndSend and leave the row pending.
  sendEmail: vi.fn(async () => ({ ok: true, id: 'mock-email' })),
  billingPageUrl: (email?: string | null) => `https://example.test/billing?email=${encodeURIComponent(email ?? '')}`,
}))

let currentParticipant: Record<string, unknown> | null = null
const scheduledEmails: unknown[][] = []

import { initStripe, stripe } from '@/lib/stripe'
import {
  addCardFromSetupIntent,
  billingLinkRequestAllowed,
  collectOpenInvoices,
  createBillingLink,
  resetBillingLinkRequestThrottle,
  resolveBillingLink,
  setupIntentForNewCard,
} from '@/lib/billing/customer-billing'
import { contextForTerms } from '@/lib/billing/dunning'
import { remainingObligation } from '@/lib/billing/rules'
import { cancelMyAgreement } from '@/actions/customer-billing'

const DAY = 86_400_000
// Concurrent runs must never delete or overwrite each other's billing fixtures.
const PREFIX = `vt-cb-${randomUUID()}-`

describe('billing link request throttle', () => {
  it('allows a few requests per email, then blocks silently until the window passes', () => {
    resetBillingLinkRequestThrottle()
    const t0 = 1_700_000_000_000
    expect(billingLinkRequestAllowed({ email: 'a@x.test', ip: '1.1.1.1' }, t0)).toBe(true)
    expect(billingLinkRequestAllowed({ email: 'a@x.test', ip: '1.1.1.1' }, t0 + 1)).toBe(true)
    expect(billingLinkRequestAllowed({ email: 'a@x.test', ip: '1.1.1.1' }, t0 + 2)).toBe(true)
    expect(billingLinkRequestAllowed({ email: 'a@x.test', ip: '1.1.1.1' }, t0 + 3)).toBe(false)
    // A different address from the same IP is still fine (IP limit is higher).
    expect(billingLinkRequestAllowed({ email: 'b@x.test', ip: '1.1.1.1' }, t0 + 4)).toBe(true)
    // After the hour the address is allowed again.
    expect(billingLinkRequestAllowed({ email: 'a@x.test', ip: '1.1.1.1' }, t0 + 61 * 60_000)).toBe(true)
  })

  it('caps one IP across many addresses', () => {
    resetBillingLinkRequestThrottle()
    const t0 = 1_700_000_000_000
    for (let i = 0; i < 10; i++) expect(billingLinkRequestAllowed({ email: `u${i}@x.test`, ip: '9.9.9.9' }, t0 + i)).toBe(true)
    expect(billingLinkRequestAllowed({ email: 'u99@x.test', ip: '9.9.9.9' }, t0 + 11)).toBe(false)
    // No IP header (e.g. tests) falls back to the per-email rule only.
    expect(billingLinkRequestAllowed({ email: 'u99@x.test', ip: null }, t0 + 12)).toBe(true)
  })
})

let stripeReady = false
try {
  await initStripe()
  stripeReady = true
} catch {
  stripeReady = false
}

interface Fixture {
  customer: Customer
  terms: PaymentLinkTerms
  stripeCustomerId: string
  subscriptionId: string
}

async function seed(id: string, opts: { startDaysAgo: number; termMonths: number; pastDue: boolean }): Promise<Fixture> {
  const cus = await stripe.customers.create({ email: `${id}@example.test`, name: `Test ${id}` })
  // pm_card_chargeCustomerFail attaches fine but every charge is declined.
  const pm = await stripe.paymentMethods.attach(opts.pastDue ? 'pm_card_chargeCustomerFail' : 'pm_card_visa', { customer: cus.id })
  const price = await stripe.prices.create({ currency: 'usd', unit_amount: 49700, recurring: { interval: 'month' }, product_data: { name: `vt ${id}` } })
  const sub = await stripe.subscriptions.create({
    customer: cus.id,
    items: [{ price: price.id }],
    trial_end: Math.floor((Date.now() + 20 * DAY) / 1000),
    default_payment_method: pm.id,
  })
  const start = new Date(Date.now() - opts.startDaysAgo * DAY)
  const end = new Date(start)
  end.setUTCMonth(end.getUTCMonth() + opts.termMonths)
  const [customer] = await db
    .insert(customersTable)
    .values({
      id,
      participantId: `${id}-owner`,
      fullName: `Test ${id}`,
      businessName: `${id} Dental`,
      email: `${id}@example.test`,
      stripeCustomerId: cus.id,
      billingStatus: opts.pastDue ? 'past_due' : 'active',
      billingIssue: opts.pastDue ? 'Your card was declined.' : null,
      billingBlockedAt: opts.pastDue ? new Date() : null,
    })
    .returning()
  const [terms] = await db
    .insert(paymentLinkTermsTable)
    .values({
      linkId: `${id}-link`,
      token: `${id}-tok`,
      customerId: id,
      type: 'subscription',
      monthlyCents: 49700,
      termMonths: opts.termMonths,
      stripeCustomerId: cus.id,
      stripeSubscriptionId: sub.id,
      subscriptionStatus: opts.pastDue ? 'past_due' : 'active',
      nextPaymentAt: new Date(Date.now() + 20 * DAY),
      agreementStart: start,
      agreementEnd: end,
    })
    .returning()
  await db.insert(customerCardsTable).values({
    id: `${id}-card1`,
    customerId: id,
    linkId: terms.linkId,
    stripePaymentMethodId: pm.id,
    fingerprint: pm.card?.fingerprint ?? null,
    brand: pm.card?.brand ?? 'visa',
    last4: pm.card?.last4 ?? '',
    expMonth: pm.card?.exp_month,
    expYear: pm.card?.exp_year,
    rank: 'primary',
    active: true,
  })
  if (opts.pastDue) {
    await stripe.invoiceItems.create({ customer: cus.id, amount: 49700, currency: 'usd', description: 'Monthly access', subscription: sub.id })
    const inv = await stripe.invoices.create({ customer: cus.id, subscription: sub.id, auto_advance: false })
    await stripe.invoices.finalizeInvoice(inv.id)
    await stripe.invoices.pay(inv.id).catch(() => undefined)
  }
  return { customer, terms, stripeCustomerId: cus.id, subscriptionId: sub.id }
}

/**
 * Remove every row this customer produced. The tests run against the shared
 * Supabase database, so anything left behind is visible in the admin UI and
 * (for the notifications outbox) picked up by the daily cron.
 */
async function cleanup(id: string) {
  const [t] = await db.select().from(paymentLinkTermsTable).where(eq(paymentLinkTermsTable.customerId, id))
  const [c] = await db.select().from(customersTable).where(eq(customersTable.id, id))
  if (t?.stripeSubscriptionId) await stripe.subscriptions.cancel(t.stripeSubscriptionId).catch(() => undefined)
  if (c?.stripeCustomerId) await stripe.customers.del(c.stripeCustomerId).catch(() => undefined)
  await db.delete(commissionEntriesTable).where(eq(commissionEntriesTable.customerId, id))
  await db.delete(billingNotificationsTable).where(eq(billingNotificationsTable.customerId, id))
  await db.delete(billingLinksTable).where(eq(billingLinksTable.customerId, id))
  await db.delete(paymentHistoryTable).where(eq(paymentHistoryTable.customerId, id))
  await db.delete(customerCardsTable).where(eq(customerCardsTable.customerId, id))
  await db.delete(paymentLinkTermsTable).where(eq(paymentLinkTermsTable.customerId, id))
  await db.delete(customersTable).where(eq(customersTable.id, id))
}

async function freshTerms(id: string): Promise<PaymentLinkTerms> {
  const [t] = await db.select().from(paymentLinkTermsTable).where(eq(paymentLinkTermsTable.customerId, id))
  return t
}
async function freshCustomer(id: string): Promise<Customer> {
  const [c] = await db.select().from(customersTable).where(eq(customersTable.id, id))
  return c
}

/** Save a test card through the same SetupIntent path the browser uses. */
async function saveCard(id: string, testPm: string, retirePrevious: boolean) {
  const customer = await freshCustomer(id)
  const terms = await freshTerms(id)
  const intent = await setupIntentForNewCard(customer, terms, null, { test: 'customer-billing' })
  await stripe.setupIntents.confirm(intent.id, { payment_method: testPm })
  return addCardFromSetupIntent(customer, terms, intent.id, { retirePrevious, actor: { source: 'customer' } })
}

async function cards(id: string) {
  const rows = await db.select().from(customerCardsTable).where(eq(customerCardsTable.customerId, id))
  return rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map((c) => ({ last4: c.last4, rank: c.rank, active: c.active }))
}

describe.skipIf(!stripeReady)('past-due customer: retry, duplicate rejection, card rotation', () => {
  const id = `${PREFIX}pastdue`
  beforeAll(async () => {
    await cleanup(id)
    await seed(id, { startDaysAgo: 100, termMonths: 12, pastDue: true })
  }, 120_000)
  afterAll(() => cleanup(id), 60_000)

  it('pay-now retries the open invoice and reports the decline without lifting the block', async () => {
    const ctx = await contextForTerms(await freshTerms(id))
    expect(ctx).not.toBeNull()
    const res = await collectOpenInvoices(ctx!, 'customer')
    expect(res.ok).toBe(false)
    expect(res.remainingCents).toBe(49700)
    expect((await freshCustomer(id)).billingStatus).toBe('past_due')
  }, 60_000)

  it('rejects a card whose fingerprint matches an active card and keeps the list unchanged', async () => {
    const res = await saveCard(id, 'pm_card_chargeCustomerFail', false)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.duplicate).toBe(true)
    expect(await cards(id)).toHaveLength(1)
  }, 60_000)

  it('a working card becomes primary, pays the balance, restores access and keeps the old card as backup', async () => {
    const res = await saveCard(id, 'pm_card_visa', false)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.card.rank).toBe('primary')
    expect(res.collected?.ok).toBe(true)
    expect(res.collected?.paidCents).toBe(49700)
    const c = await freshCustomer(id)
    expect(['active', 'trialing']).toContain(c.billingStatus)
    expect(c.billingBlockedAt).toBeNull()
    const list = await cards(id)
    expect(list).toHaveLength(2)
    expect(list.map((x) => x.rank)).toEqual(['secondary', 'primary'])
    expect(list.every((x) => x.active)).toBe(true)
    const history = await db.select().from(paymentHistoryTable).where(eq(paymentHistoryTable.customerId, id))
    expect(history.some((h) => h.kind === 'card_added' && h.source === 'customer')).toBe(true)
  }, 90_000)
})

describe.skipIf(!stripeReady)('active owner: links, retire-previous, cancellation', () => {
  const id = `${PREFIX}active`
  beforeAll(async () => {
    await cleanup(id)
    await seed(id, { startDaysAgo: 100, termMonths: 60, pastDue: false })
    currentParticipant = { id: `${id}-owner`, parent_id: null, is_demo: false, email: `${id}@example.test`, first_name: 'Test', last_name: id }
  }, 120_000)
  afterAll(async () => {
    currentParticipant = null
    await cleanup(id)
  }, 60_000)

  it('resolves a live token and refuses expired or unknown ones', async () => {
    const created = await createBillingLink({ customerId: id, linkId: `${id}-link`, purpose: 'update_card' })
    expect(created.url).toContain(`/billing/${created.token}`)
    const live = await resolveBillingLink(created.token)
    expect(live?.customer.id).toBe(id)
    expect(live?.terms?.linkId).toBe(`${id}-link`)
    await db.update(billingLinksTable).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(billingLinksTable.token, created.token))
    expect(await resolveBillingLink(created.token)).toBeNull()
    expect(await resolveBillingLink('not-a-token')).toBeNull()
    expect(await resolveBillingLink('')).toBeNull()
  }, 30_000)

  it('retire-previous marks the old primary inactive but never deletes it', async () => {
    const res = await saveCard(id, 'pm_card_mastercard', true)
    expect(res.ok).toBe(true)
    const list = await cards(id)
    expect(list).toHaveLength(2)
    expect(list[0].active).toBe(false)
    expect(list[1]).toMatchObject({ rank: 'primary', active: true })
    // A retired card is not a duplicate: adding it again reactivates it as primary.
    const again = await saveCard(id, 'pm_card_visa', false)
    expect(again.ok).toBe(true)
    const after = await cards(id)
    expect(after).toHaveLength(2)
    expect(after.filter((c) => c.active)).toHaveLength(2)
    expect(after.find((c) => c.last4 === '4242')).toMatchObject({ rank: 'primary', active: true })
  }, 90_000)

  it('cancellation needs acknowledgement, schedules at the agreement end, discloses the full remaining obligation, and cannot be repeated', async () => {
    const refused = await cancelMyAgreement({ acknowledged: false })
    expect(refused.ok).toBe(false)
    expect((await freshTerms(id)).cancelAt).toBeNull()

    const done = await cancelMyAgreement({ acknowledged: true })
    expect(done.ok).toBe(true)
    if (!done.ok) return
    const terms = await freshTerms(id)
    // 60-month term, ~3 months in: far more than the 24 installments an
    // earlier fixed loop bound would have disclosed.
    const expected = remainingObligation({ nextPaymentAt: terms.nextPaymentAt, agreementEnd: terms.agreementEnd, monthlyCents: terms.monthlyCents })
    expect(expected.payments).toBeGreaterThan(50)
    expect(done.payments).toBe(expected.payments)
    expect(done.totalCents).toBe(expected.payments * 49700)
    expect(done.cancelAt?.slice(0, 19)).toBe(terms.agreementEnd!.toISOString().slice(0, 19))
    expect(terms.cancelAt?.toISOString().slice(0, 19)).toBe(terms.agreementEnd!.toISOString().slice(0, 19))
    const sub = await stripe.subscriptions.retrieve(terms.stripeSubscriptionId!)
    expect(sub.cancel_at).toBe(Math.floor(terms.agreementEnd!.getTime() / 1000))
    expect(sub.status).not.toBe('canceled')

    // Customer gets the dedicated scheduled-cancellation email with the obligation spelled out.
    expect(scheduledEmails).toHaveLength(1)
    const [to, data] = scheduledEmails[0] as [string, Record<string, unknown>]
    expect(to).toBe(`${id}@example.test`)
    expect(data.remainingPayments).toBe(done.payments)
    expect(data.remainingCents).toBe(done.totalCents)
    expect(data.cancelAt).toBe(done.cancelAt)

    const history = await db.select().from(paymentHistoryTable).where(eq(paymentHistoryTable.customerId, id))
    expect(history.some((h) => h.kind === 'cancellation_scheduled' && h.source === 'customer')).toBe(true)

    const twice = await cancelMyAgreement({ acknowledged: true })
    expect(twice.ok).toBe(false)
  }, 90_000)
})
