import type Stripe from 'stripe'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Behaviour of the dunning webhook handlers end to end, with Stripe and the
 * database replaced by in-memory stand-ins.
 *
 * The regression this guards against: a customer who has paid but is still
 * `past_due` / locked out, and redelivered events that double-log the ledger
 * or re-block an account the backup card already paid for.
 *
 * The fake database evaluates the real query shapes (`eq`/`and`/`isNull`
 * predicates, projections, `onConflictDoNothing`) against plain row arrays, so
 * the handlers run unmodified.
 */

// ── In-memory database ─────────────────────────────────────────────────────

type Row = Record<string, unknown>
type Column = { table: string; key: string }
type Predicate = { test: (row: Row) => boolean }
type Order = { col: Column; dir: 'asc' | 'desc' }

const isColumn = (v: unknown): v is Column => Boolean(v) && typeof v === 'object' && 'table' in (v as object) && 'key' in (v as object)

vi.mock('drizzle-orm', () => ({
  eq: (col: Column, value: unknown): Predicate => ({ test: (row) => row[col.key] === value }),
  and: (...preds: (Predicate | undefined)[]): Predicate => ({ test: (row) => preds.every((p) => !p || p.test(row)) }),
  or: (...preds: (Predicate | undefined)[]): Predicate => ({ test: (row) => preds.some((p) => p && p.test(row)) }),
  isNull: (col: Column): Predicate => ({ test: (row) => row[col.key] === null || row[col.key] === undefined }),
  desc: (col: Column): Order => ({ col, dir: 'desc' }),
  asc: (col: Column): Order => ({ col, dir: 'asc' }),
}))

const tables: Record<string, Row[]> = { customers: [], payment_link_terms: [], customer_cards: [], payment_history: [] }
/** Columns that must be unique when non-null (mirrors the real schema's unique indexes). */
const uniqueColumns: Record<string, string[]> = { payment_history: ['id', 'stripeRefundId'] }

function tableRef(name: string) {
  return new Proxy({} as Record<string, unknown>, {
    get: (_t, key) => (key === '__name' ? name : typeof key === 'string' ? ({ table: name, key } satisfies Column) : undefined),
  }) as unknown as { __name: string } & Record<string, Column>
}

function sortRows(rows: Row[], orders: (Order | Column)[]) {
  if (!orders.length) return rows
  return [...rows].sort((a, b) => {
    for (const o of orders) {
      const { col, dir } = isColumn(o) ? { col: o, dir: 'asc' as const } : o
      const av = a[col.key] as number | string | Date
      const bv = b[col.key] as number | string | Date
      if (av === bv) continue
      const cmp = av > bv ? 1 : -1
      return dir === 'desc' ? -cmp : cmp
    }
    return 0
  })
}

function select(projection?: Record<string, Column>) {
  return {
    from: (table: { __name: string }) => {
      let pred: Predicate | null = null
      let orders: (Order | Column)[] = []
      let limit = Infinity
      const run = () => {
        const rows = sortRows(tables[table.__name].filter((r) => !pred || pred.test(r)), orders).slice(0, limit)
        return rows.map((r) => {
          if (!projection) return { ...r }
          return Object.fromEntries(Object.entries(projection).map(([alias, col]) => [alias, r[col.key]]))
        })
      }
      const builder = {
        where: (p: Predicate) => ((pred = p), builder),
        orderBy: (...o: (Order | Column)[]) => ((orders = o), builder),
        limit: (n: number) => ((limit = n), builder),
        then: (resolve: (rows: Row[]) => unknown, reject?: (err: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
      }
      return builder
    },
  }
}

const fakeDb = {
  select,
  insert: (table: { __name: string }) => ({
    values: (row: Row) => {
      const insert = (ignoreConflict: boolean) => {
        const rows = tables[table.__name]
        const conflict = (uniqueColumns[table.__name] ?? ['id']).some(
          (key) => row[key] != null && rows.some((r) => r[key] === row[key]),
        )
        if (conflict) {
          if (ignoreConflict) return []
          throw new Error(`unique violation on ${table.__name}`)
        }
        const stored = { createdAt: new Date(), ...row }
        rows.push(stored)
        return [{ ...stored }]
      }
      return {
        onConflictDoNothing: () => ({ returning: async () => insert(true) }),
        returning: async () => insert(false),
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(insert(false)).then(resolve),
      }
    },
  }),
  update: (table: { __name: string }) => ({
    set: (patch: Row) => ({
      where: async (pred: Predicate) => {
        for (const row of tables[table.__name]) if (pred.test(row)) Object.assign(row, patch)
      },
    }),
  }),
}

vi.mock('@workspace/db', () => ({
  db: fakeDb,
  customersTable: tableRef('customers'),
  paymentLinkTermsTable: tableRef('payment_link_terms'),
  customerCardsTable: tableRef('customer_cards'),
  paymentHistoryTable: tableRef('payment_history'),
}))

// ── Stripe + collaborators ─────────────────────────────────────────────────

const stripeMock = {
  invoices: { retrieve: vi.fn(), pay: vi.fn(), list: vi.fn() },
  subscriptions: { retrieve: vi.fn() },
  paymentIntents: { retrieve: vi.fn() },
  refunds: { list: vi.fn() },
}
vi.mock('@/lib/stripe', () => ({ stripe: stripeMock }))

const commissions = { generateCommissionForHistory: vi.fn(async () => ({ created: false, reason: 'test' })) }
vi.mock('@/lib/billing/commissions', () => ({
  generateCommissionForHistory: commissions.generateCommissionForHistory,
  isCommissionable: (row: { kind: string }) => row.kind === 'invoice_paid' || row.kind === 'refund',
}))

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => ({}) }))

const {
  handleChargeRefunded,
  handleInvoicePaid,
  handleInvoicePaymentFailed,
  handleSubscriptionUpdated,
  retryPastDueInvoices,
} = await import('@/lib/billing/dunning')

// ── Fixtures ───────────────────────────────────────────────────────────────

const SUB = 'sub_1'
const LINK = 'link_1'
const CUSTOMER = 'cust_1'
const STRIPE_CUSTOMER = 'cus_stripe_1'
const PM_PRIMARY = 'pm_primary'
const PM_SECONDARY = 'pm_secondary'
const PERIOD_END = 1_800_000_000

function seed(overrides: { billingStatus?: string; billingBlockedAt?: Date | null; billingIssue?: string | null; cards?: 'both' | 'primary' } = {}) {
  for (const key of Object.keys(tables)) tables[key].length = 0
  tables.customers.push({
    id: CUSTOMER,
    email: 'owner@example.com',
    stripeCustomerId: STRIPE_CUSTOMER,
    participantId: 'part_1',
    billingStatus: overrides.billingStatus ?? 'active',
    billingBlockedAt: overrides.billingBlockedAt ?? null,
    billingIssue: overrides.billingIssue ?? null,
    updatedAt: new Date(0),
  })
  tables.payment_link_terms.push({
    linkId: LINK,
    customerId: CUSTOMER,
    stripeCustomerId: STRIPE_CUSTOMER,
    stripeSubscriptionId: SUB,
    subscriptionStatus: overrides.billingStatus === 'past_due' ? 'past_due' : 'active',
    nextPaymentAt: null,
    cancelAt: null,
    canceledAt: null,
    createdAt: new Date(0),
  })
  tables.customer_cards.push({
    id: 'card_p',
    customerId: CUSTOMER,
    linkId: LINK,
    stripePaymentMethodId: PM_PRIMARY,
    brand: 'visa',
    last4: '4242',
    rank: 'primary',
    active: true,
  })
  if (overrides.cards !== 'primary') {
    tables.customer_cards.push({
      id: 'card_s',
      customerId: CUSTOMER,
      linkId: LINK,
      stripePaymentMethodId: PM_SECONDARY,
      brand: 'mastercard',
      last4: '4444',
      rank: 'secondary',
      active: true,
    })
  }
}

function invoice(opts: { id?: string; status: 'open' | 'paid'; paymentIntentId?: string | null; amount?: number }): Stripe.Invoice {
  const amount = opts.amount ?? 29_700
  return {
    id: opts.id ?? 'in_1',
    object: 'invoice',
    status: opts.status,
    currency: 'usd',
    amount_due: opts.status === 'paid' ? 0 : amount,
    amount_paid: opts.status === 'paid' ? amount : 0,
    created: PERIOD_END - 30 * 86_400,
    status_transitions: { paid_at: opts.status === 'paid' ? PERIOD_END - 30 * 86_400 + 60 : null },
    parent: { type: 'subscription_details', subscription_details: { subscription: SUB } },
    payments: { data: opts.paymentIntentId ? [{ payment: { type: 'payment_intent', payment_intent: opts.paymentIntentId } }] : [] },
    lines: { data: [{ period: { start: PERIOD_END - 30 * 86_400, end: PERIOD_END } }] },
  } as unknown as Stripe.Invoice
}

function subscription(status: string): Stripe.Subscription {
  return {
    id: SUB,
    object: 'subscription',
    status,
    trial_end: null,
    cancel_at: null,
    cancel_at_period_end: false,
    canceled_at: null,
    ended_at: null,
    items: { data: [{ current_period_end: PERIOD_END }] },
  } as unknown as Stripe.Subscription
}

function paymentIntent(id: string, pm: string, outcome: 'succeeded' | 'failed', message = 'Your card was declined.') {
  const brand = pm === PM_PRIMARY ? 'visa' : 'mastercard'
  const last4 = pm === PM_PRIMARY ? '4242' : '4444'
  return {
    id,
    object: 'payment_intent',
    status: outcome === 'succeeded' ? 'succeeded' : 'requires_payment_method',
    payment_method: { id: pm, card: { brand, last4 } },
    latest_charge: outcome === 'succeeded' ? { id: `ch_${id}`, payment_method_details: { card: { brand, last4 } } } : null,
    last_payment_error: outcome === 'failed' ? { message, payment_method: { id: pm } } : null,
  }
}

/** Stripe stand-in: every card declines except those listed in `paying`. */
function stubStripe(opts: { subscriptionStatus?: string; paying?: string[]; openInvoices?: Stripe.Invoice[] } = {}) {
  const intents = new Map<string, ReturnType<typeof paymentIntent>>()
  let counter = 0
  const register = (pm: string, outcome: 'succeeded' | 'failed') => {
    const id = `pi_${++counter}_${pm}`
    intents.set(id, paymentIntent(id, pm, outcome))
    return id
  }
  stripeMock.paymentIntents.retrieve.mockImplementation(async (id: string) => {
    const pi = intents.get(id)
    if (!pi) throw new Error(`no such payment intent ${id}`)
    return pi
  })
  stripeMock.subscriptions.retrieve.mockImplementation(async () => subscription(opts.subscriptionStatus ?? 'active'))
  stripeMock.invoices.list.mockImplementation(async () => ({ data: opts.openInvoices ?? [] }))
  stripeMock.invoices.pay.mockImplementation(async (id: string, params: { payment_method: string }) => {
    if ((opts.paying ?? []).includes(params.payment_method)) {
      return invoice({ id, status: 'paid', paymentIntentId: register(params.payment_method, 'succeeded') })
    }
    const piId = register(params.payment_method, 'failed')
    const err = Object.assign(new Error(`Your card was declined (${params.payment_method}).`), {
      type: 'StripeCardError',
      payment_intent: intents.get(piId),
    })
    throw err
  })
  return { register, intents }
}

const ledger = (kind?: string) => tables.payment_history.filter((r) => !kind || r.kind === kind)
const customer = () => tables.customers[0]
const terms = () => tables.payment_link_terms[0]

beforeEach(() => {
  for (const group of Object.values(stripeMock)) for (const fn of Object.values(group)) fn.mockReset()
  commissions.generateCommissionForHistory.mockClear()
})

// ── invoice.payment_failed ─────────────────────────────────────────────────

describe('handleInvoicePaymentFailed', () => {
  it('primary declines → pays the same invoice with the secondary and keeps access on', async () => {
    seed()
    const { register } = stubStripe({ paying: [PM_SECONDARY] })
    const failedPi = register(PM_PRIMARY, 'failed')
    const open = invoice({ status: 'open', paymentIntentId: failedPi })
    stripeMock.invoices.retrieve.mockResolvedValue(open)

    const result = await handleInvoicePaymentFailed(open, 'evt_fail_1')

    expect(result).toEqual({ handled: true, note: 'paid with secondary card' })
    expect(stripeMock.invoices.pay).toHaveBeenCalledTimes(1)
    expect(stripeMock.invoices.pay).toHaveBeenCalledWith('in_1', expect.objectContaining({ payment_method: PM_SECONDARY, off_session: true }))

    const failed = ledger('invoice_failed')
    expect(failed).toHaveLength(1)
    expect(failed[0]).toMatchObject({ stripePaymentMethodId: PM_PRIMARY, cardRank: 'primary', stripeInvoiceId: 'in_1', stripeEventId: 'evt_fail_1' })
    const paid = ledger('invoice_paid')
    expect(paid).toHaveLength(1)
    expect(paid[0]).toMatchObject({ stripePaymentMethodId: PM_SECONDARY, cardRank: 'secondary', source: 'dunning', amountCents: 29_700 })

    expect(customer()).toMatchObject({ billingStatus: 'active', billingBlockedAt: null, billingIssue: null })
    expect(terms().subscriptionStatus).toBe('active')
  })

  it('both cards decline → past_due, portal blocked with the decline reason, terms mirror past_due', async () => {
    seed()
    const { register } = stubStripe({ paying: [] })
    const failedPi = register(PM_PRIMARY, 'failed')
    const open = invoice({ status: 'open', paymentIntentId: failedPi })
    stripeMock.invoices.retrieve.mockResolvedValue(open)

    const result = await handleInvoicePaymentFailed(open, 'evt_fail_2')

    expect(result.note).toBe('both cards failed; access blocked')
    expect(stripeMock.invoices.pay).toHaveBeenCalledTimes(1)
    expect(ledger('invoice_paid')).toHaveLength(0)
    expect(ledger('invoice_failed').map((r) => r.stripePaymentMethodId)).toEqual([PM_PRIMARY, PM_SECONDARY])

    expect(customer().billingStatus).toBe('past_due')
    expect(customer().billingBlockedAt).toBeInstanceOf(Date)
    expect(customer().billingIssue).toBe('Your card was declined.')
    expect(terms().subscriptionStatus).toBe('past_due')
  })

  it('the payment_failed Stripe emits for our own secondary retry does not log again or loop back to the primary', async () => {
    seed()
    const { register, intents } = stubStripe({ paying: [] })
    const open = invoice({ status: 'open', paymentIntentId: register(PM_PRIMARY, 'failed') })
    stripeMock.invoices.retrieve.mockResolvedValue(open)
    await handleInvoicePaymentFailed(open, 'evt_fail_3')
    const blockedAt = customer().billingBlockedAt
    const rowsBefore = ledger().length

    // Stripe now reports the decline of the secondary attempt we just made.
    const retryIntentId = [...intents.keys()].find((id) => id.endsWith(PM_SECONDARY))!
    const redelivered = invoice({ status: 'open', paymentIntentId: retryIntentId })
    stripeMock.invoices.retrieve.mockResolvedValue(redelivered)

    const result = await handleInvoicePaymentFailed(redelivered, 'evt_fail_3b')

    expect(result.note).toBe('both cards already declined on this invoice; access blocked')
    expect(stripeMock.invoices.pay).toHaveBeenCalledTimes(1)
    expect(ledger()).toHaveLength(rowsBefore)
    expect(customer().billingStatus).toBe('past_due')
    expect(customer().billingBlockedAt).toBe(blockedAt)
  })

  it('with no backup card a single decline blocks access without retrying', async () => {
    seed({ cards: 'primary' })
    const { register } = stubStripe({ paying: [] })
    const open = invoice({ status: 'open', paymentIntentId: register(PM_PRIMARY, 'failed') })
    stripeMock.invoices.retrieve.mockResolvedValue(open)

    const result = await handleInvoicePaymentFailed(open, 'evt_fail_4')

    expect(result.note).toBe('no backup card; access blocked')
    expect(stripeMock.invoices.pay).not.toHaveBeenCalled()
    expect(customer().billingStatus).toBe('past_due')
  })

  it('delivered after the invoice was already paid → no-op: no ledger row, no retry, access untouched', async () => {
    seed()
    const { register } = stubStripe({ paying: [PM_SECONDARY] })
    const stale = invoice({ status: 'open', paymentIntentId: register(PM_PRIMARY, 'failed') })
    stripeMock.invoices.retrieve.mockResolvedValue(invoice({ status: 'paid', paymentIntentId: register(PM_SECONDARY, 'succeeded') }))
    const before = JSON.stringify(customer())

    const result = await handleInvoicePaymentFailed(stale, 'evt_fail_5')

    expect(result).toEqual({ handled: true, note: 'invoice already paid' })
    expect(stripeMock.invoices.pay).not.toHaveBeenCalled()
    expect(ledger()).toHaveLength(0)
    expect(JSON.stringify(customer())).toBe(before)
  })

  it('ignores invoices that are not tied to a subscription we know', async () => {
    seed()
    stubStripe()
    const unknown = { ...invoice({ status: 'open' }), parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_other' } } } as Stripe.Invoice
    expect(await handleInvoicePaymentFailed(unknown, 'evt_x')).toEqual({ handled: false, note: 'unknown subscription' })
    const oneOff = { ...invoice({ status: 'open' }), parent: null } as unknown as Stripe.Invoice
    expect(await handleInvoicePaymentFailed(oneOff, 'evt_y')).toEqual({ handled: false, note: 'not a subscription invoice' })
    expect(stripeMock.invoices.retrieve).not.toHaveBeenCalled()
  })
})

// ── invoice.paid ───────────────────────────────────────────────────────────

describe('handleInvoicePaid', () => {
  it('a paid invoice after a block restores access and clears the notice', async () => {
    seed({ billingStatus: 'past_due', billingBlockedAt: new Date('2026-09-01T00:00:00Z'), billingIssue: 'Your card was declined.' })
    const { register } = stubStripe({ subscriptionStatus: 'active' })
    const paid = invoice({ status: 'paid', paymentIntentId: register(PM_PRIMARY, 'succeeded') })

    const result = await handleInvoicePaid(paid, 'evt_paid_1')

    expect(result).toEqual({ handled: true })
    expect(customer()).toMatchObject({ billingStatus: 'active', billingBlockedAt: null, billingIssue: null })
    expect(terms()).toMatchObject({ subscriptionStatus: 'active', nextPaymentAt: new Date(PERIOD_END * 1000) })
    const rows = ledger('invoice_paid')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ stripeInvoiceId: 'in_1', stripePaymentMethodId: PM_PRIMARY, cardRank: 'primary', amountCents: 29_700, source: 'webhook' })
    expect(commissions.generateCommissionForHistory).toHaveBeenCalledTimes(1)
  })

  it('a redelivered invoice.paid does not write a second ledger row', async () => {
    seed({ billingStatus: 'past_due', billingBlockedAt: new Date() })
    const { register } = stubStripe()
    const paid = invoice({ status: 'paid', paymentIntentId: register(PM_PRIMARY, 'succeeded') })

    await handleInvoicePaid(paid, 'evt_paid_2')
    await handleInvoicePaid(paid, 'evt_paid_2')
    await handleInvoicePaid(paid, 'evt_paid_2_redelivered')

    expect(ledger('invoice_paid')).toHaveLength(1)
    expect(commissions.generateCommissionForHistory).toHaveBeenCalledTimes(1)
    expect(customer().billingStatus).toBe('active')
  })

  it('a trialing subscription that pays keeps the trialing status rather than jumping to active', async () => {
    seed({ billingStatus: 'past_due', billingBlockedAt: new Date() })
    const { register } = stubStripe({ subscriptionStatus: 'trialing' })
    await handleInvoicePaid(invoice({ status: 'paid', paymentIntentId: register(PM_PRIMARY, 'succeeded') }), 'evt_paid_3')
    expect(customer().billingStatus).toBe('trialing')
    expect(customer().billingBlockedAt).toBeNull()
  })

  it('still restores access when Stripe cannot be reached for the subscription refresh', async () => {
    seed({ billingStatus: 'past_due', billingBlockedAt: new Date() })
    const { register } = stubStripe()
    stripeMock.subscriptions.retrieve.mockRejectedValue(new Error('stripe down'))
    await handleInvoicePaid(invoice({ status: 'paid', paymentIntentId: register(PM_PRIMARY, 'succeeded') }), 'evt_paid_4')
    expect(customer()).toMatchObject({ billingStatus: 'active', billingBlockedAt: null })
  })

  it('a customer who is setup_paid when the first invoice pays becomes active', async () => {
    seed({ billingStatus: 'setup_paid' })
    const { register } = stubStripe()
    await handleInvoicePaid(invoice({ status: 'paid', paymentIntentId: register(PM_PRIMARY, 'succeeded') }), 'evt_paid_5')
    expect(customer().billingStatus).toBe('active')
  })
})

// ── customer.subscription.updated ──────────────────────────────────────────

describe('handleSubscriptionUpdated', () => {
  it('a delayed past_due event does not re-lock a customer whose invoice is already paid', async () => {
    seed({ billingStatus: 'active' })
    stubStripe({ subscriptionStatus: 'active', openInvoices: [] })

    const result = await handleSubscriptionUpdated(subscription('past_due'), 'evt_sub_1')

    expect(result).toEqual({ handled: true })
    expect(customer().billingStatus).toBe('active')
    expect(customer().billingBlockedAt).toBeNull()
  })

  it('restores a blocked customer once Stripe shows the subscription active with nothing open', async () => {
    seed({ billingStatus: 'past_due', billingBlockedAt: new Date(), billingIssue: 'declined' })
    stubStripe({ subscriptionStatus: 'active', openInvoices: [] })

    await handleSubscriptionUpdated(subscription('active'), 'evt_sub_2')

    expect(customer()).toMatchObject({ billingStatus: 'active', billingBlockedAt: null, billingIssue: null })
  })

  it('blocks when Stripe confirms past_due with an open invoice', async () => {
    seed({ billingStatus: 'active' })
    stubStripe({ subscriptionStatus: 'past_due', openInvoices: [invoice({ status: 'open' })] })

    await handleSubscriptionUpdated(subscription('past_due'), 'evt_sub_3')

    expect(customer().billingStatus).toBe('past_due')
    expect(customer().billingIssue).toBe('Your subscription payment is overdue.')
  })
})

// ── charge.refunded ────────────────────────────────────────────────────────

describe('handleChargeRefunded', () => {
  function charge(refunds: { id: string; amount: number }[]): Stripe.Charge {
    return {
      id: 'ch_1',
      object: 'charge',
      customer: STRIPE_CUSTOMER,
      payment_intent: 'pi_1',
      payment_method: PM_PRIMARY,
      payment_method_details: { card: { brand: 'visa', last4: '4242' } },
      refunds: { data: refunds.map((r) => ({ id: r.id, amount: r.amount, currency: 'usd', reason: 'requested_by_customer', created: PERIOD_END })) },
    } as unknown as Stripe.Charge
  }

  it('writes one ledger row per refund id, however many times the event is redelivered', async () => {
    seed()
    stubStripe()
    tables.payment_history.push({
      id: 'hist_paid',
      customerId: CUSTOMER,
      linkId: LINK,
      kind: 'invoice_paid',
      status: 'succeeded',
      stripeChargeId: 'ch_1',
      stripeRefundId: null,
    })

    const first = charge([{ id: 're_1', amount: 5_000 }])
    expect(await handleChargeRefunded(first, 'evt_ref_1')).toEqual({ handled: true })
    await handleChargeRefunded(first, 'evt_ref_1')
    // A second partial refund: the event carries both refunds.
    const second = charge([{ id: 're_1', amount: 5_000 }, { id: 're_2', amount: 2_500 }])
    await handleChargeRefunded(second, 'evt_ref_2')
    await handleChargeRefunded(second, 'evt_ref_2_redelivered')

    const refunds = ledger('refund')
    expect(refunds.map((r) => r.stripeRefundId).sort()).toEqual(['re_1', 're_2'])
    expect(refunds.map((r) => r.amountCents).sort()).toEqual([2_500, 5_000])
    expect(refunds.every((r) => r.linkId === LINK && r.customerId === CUSTOMER)).toBe(true)
    expect(commissions.generateCommissionForHistory).toHaveBeenCalledTimes(2)
    expect(stripeMock.refunds.list).not.toHaveBeenCalled()
  })

  it('does nothing for a charge it cannot attribute to a customer', async () => {
    seed()
    stubStripe()
    const stranger = { ...charge([{ id: 're_9', amount: 100 }]), customer: 'cus_unknown' } as Stripe.Charge
    expect(await handleChargeRefunded(stranger, 'evt_ref_9')).toEqual({ handled: false, note: 'unknown customer' })
    expect(ledger('refund')).toHaveLength(0)
  })
})

// ── daily retry ────────────────────────────────────────────────────────────

describe('retryPastDueInvoices', () => {
  it('primary still declines, secondary pays → invoice paid and access restored', async () => {
    seed({ billingStatus: 'past_due', billingBlockedAt: new Date(), billingIssue: 'declined' })
    stubStripe({ paying: [PM_SECONDARY], openInvoices: [invoice({ status: 'open' })] })

    const summary = await retryPastDueInvoices('cron')

    expect(summary).toMatchObject({ customers: 1, invoices: 1, paid: 1, failed: 0 })
    expect(summary.details[0]).toMatchObject({ customerId: CUSTOMER, invoiceId: 'in_1', result: 'paid', card: 'secondary' })
    expect(stripeMock.invoices.pay.mock.calls.map((c) => (c[1] as { payment_method: string }).payment_method)).toEqual([PM_PRIMARY, PM_SECONDARY])
    expect(ledger('invoice_failed')).toHaveLength(1)
    expect(ledger('invoice_paid')).toHaveLength(1)
    expect(ledger('invoice_paid')[0]).toMatchObject({ source: 'cron', cardRank: 'secondary' })
    expect(customer()).toMatchObject({ billingStatus: 'active', billingBlockedAt: null, billingIssue: null })
    expect(terms().subscriptionStatus).toBe('active')
  })

  it('both cards still decline → stays past_due and reports the failure', async () => {
    seed({ billingStatus: 'past_due', billingBlockedAt: new Date() })
    stubStripe({ paying: [], openInvoices: [invoice({ status: 'open' })] })

    const summary = await retryPastDueInvoices('cron')

    expect(summary).toMatchObject({ customers: 1, invoices: 1, paid: 0, failed: 1 })
    expect(summary.details[0]).toMatchObject({ result: 'failed', message: expect.stringContaining('declined') })
    expect(customer().billingStatus).toBe('past_due')
    expect(ledger('invoice_failed')).toHaveLength(2)
  })

  it('a past_due customer with nothing open any more (paid through Stripe) gets access back', async () => {
    seed({ billingStatus: 'past_due', billingBlockedAt: new Date() })
    stubStripe({ subscriptionStatus: 'active', openInvoices: [] })

    const summary = await retryPastDueInvoices('cron')

    expect(stripeMock.invoices.pay).not.toHaveBeenCalled()
    expect(summary.details[0]).toMatchObject({ result: 'skipped', message: 'no open invoices; access restored' })
    expect(customer()).toMatchObject({ billingStatus: 'active', billingBlockedAt: null })
  })

  it('leaves active customers alone', async () => {
    seed({ billingStatus: 'active' })
    stubStripe({ openInvoices: [invoice({ status: 'open' })] })
    const summary = await retryPastDueInvoices('cron')
    expect(summary).toMatchObject({ customers: 0, invoices: 0 })
    expect(stripeMock.invoices.list).not.toHaveBeenCalled()
  })
})
