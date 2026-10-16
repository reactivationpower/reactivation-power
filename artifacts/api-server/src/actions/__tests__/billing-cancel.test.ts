import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * What the customer hears when an admin cancels their subscription:
 *
 *   - cancel now       → "subscription cancelled", access ended now, via the
 *                        once-per-subscription outbox (shared with the webhook)
 *   - cancel at term end → "cancellation scheduled" (installments continue),
 *                        never the cancelled notice
 *   - undo a scheduled cancellation → no email at all
 *
 * Stripe, the database and the mail transport are stubs; only the decisions
 * made by the actions are under test.
 */

const admin = { userId: 'adm_1', email: 'admin@example.com', name: 'Admin' }
vi.mock('@/lib/auth/admin-session', () => ({ requireAdmin: vi.fn(async () => admin) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/app-origin', () => ({ appOrigin: () => 'https://app.test' }))

const PERIOD_END = Math.floor(Date.now() / 1000) + 20 * 86_400
const AGREEMENT_END = new Date(Date.now() + 200 * 86_400_000)

const terms = {
  linkId: 'link_1',
  customerId: 'cust_1',
  type: 'subscription',
  stripeSubscriptionId: 'sub_1',
  subscriptionStatus: 'active',
  monthlyCents: 47_500,
  termMonths: 12,
  nextPaymentAt: new Date(PERIOD_END * 1000),
  agreementEnd: AGREEMENT_END,
  cancelAt: null as Date | null,
  canceledAt: null,
}
const customer = { id: 'cust_1', email: 'owner@example.com', fullName: 'Dr. Michael Chen', ownerName: null, billingStatus: 'active' }

const history: Record<string, unknown>[] = []
const customerUpdates: Record<string, unknown>[] = []
vi.mock('@workspace/db', () => {
  const customersTable = { __name: 'customers' }
  const paymentHistoryTable = { __name: 'payment_history', kind: 'kind', stripeSubscriptionId: 'sid' }
  const paymentLinkTermsTable = { __name: 'terms', linkId: 'linkId' }
  return {
    customersTable,
    paymentHistoryTable,
    paymentLinkTermsTable,
    db: {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [terms] }) }) }),
      update: (table: { __name: string }) => ({
        set: (patch: Record<string, unknown>) => ({
          where: async () => {
            if (table.__name === 'customers') customerUpdates.push(patch)
          },
        }),
      }),
      delete: () => ({ where: async () => undefined }),
    },
  }
})
vi.mock('drizzle-orm', () => ({ and: (...a: unknown[]) => a, eq: (a: unknown, b: unknown) => [a, b] }))

const stripeMock = { subscriptions: { cancel: vi.fn(), update: vi.fn(), retrieve: vi.fn() } }
vi.mock('@/lib/stripe', () => ({ stripe: stripeMock }))

vi.mock('@/lib/billing/dunning', () => ({
  contextForTerms: vi.fn(async () => ({ terms, customer, cards: [] })),
  recordHistory: vi.fn(async (row: Record<string, unknown>) => {
    history.push(row)
  }),
  restoreAccess: vi.fn(),
  retryPastDueInvoices: vi.fn(),
  syncSubscriptionRecord: vi.fn(async () => ({ terms, customer, cards: [] })),
}))

type CancelledArgs = { customer: { id: string }; subscriptionId: string; monthlyCents: number | null; accessEndsAt: Date }
const notifySubscriptionCancelled = vi.fn<(input: CancelledArgs) => Promise<'sent'>>(async () => 'sent')
vi.mock('@/lib/billing/notifications', () => ({ notifySubscriptionCancelled }))

const sendCancellationScheduledEmail = vi.fn<(to: string, data: Record<string, unknown>, options: { metadata: Record<string, unknown> }) => Promise<{ ok: boolean }>>(async () => ({ ok: true }))
vi.mock('@/lib/mail', () => ({ sendCancellationScheduledEmail }))

const { cancelSubscription, resumeSubscription } = await import('@/actions/billing')
const { remainingObligation } = await import('@/lib/billing/rules')

const subscription = (extra: Record<string, unknown> = {}) => ({
  id: 'sub_1',
  status: 'active',
  cancel_at: null,
  cancel_at_period_end: false,
  canceled_at: null,
  ended_at: null,
  items: { data: [{ current_period_end: PERIOD_END }] },
  ...extra,
})

beforeEach(() => {
  history.length = 0
  customerUpdates.length = 0
  terms.cancelAt = null
  for (const fn of Object.values(stripeMock.subscriptions)) fn.mockReset()
  notifySubscriptionCancelled.mockClear()
  sendCancellationScheduledEmail.mockClear()
})

describe('cancel now', () => {
  it('shuts access off and sends the cancelled notice with access ending now', async () => {
    const now = Math.floor(Date.now() / 1000)
    stripeMock.subscriptions.cancel.mockResolvedValue(subscription({ status: 'canceled', canceled_at: now, ended_at: now }))
    const before = Date.now()

    const result = await cancelSubscription({ linkId: 'link_1', when: 'now' })

    expect(result).toMatchObject({ ok: true, status: 'canceled', cancelAt: null })
    expect(customerUpdates[0]).toMatchObject({ billingStatus: 'canceled' })
    expect(history.map((h) => h.kind)).toEqual(['subscription_canceled'])
    expect(notifySubscriptionCancelled).toHaveBeenCalledTimes(1)
    const args = notifySubscriptionCancelled.mock.calls[0][0]
    expect(args).toMatchObject({ subscriptionId: 'sub_1', monthlyCents: 47_500, customer: { id: 'cust_1' } })
    expect(args.accessEndsAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(args.accessEndsAt.getTime()).toBeLessThanOrEqual(Date.now())
    expect(sendCancellationScheduledEmail).not.toHaveBeenCalled()
  })

  it('sends nothing when Stripe refuses the cancellation', async () => {
    stripeMock.subscriptions.cancel.mockRejectedValue(new Error('No such subscription'))
    const result = await cancelSubscription({ linkId: 'link_1', when: 'now' })
    expect(result).toEqual({ ok: false, error: 'No such subscription' })
    expect(notifySubscriptionCancelled).not.toHaveBeenCalled()
    expect(customerUpdates).toHaveLength(0)
  })
})

describe('cancel at end of term', () => {
  it('confirms the scheduled cancellation and what is still owed, not the cancelled notice', async () => {
    const cancelAt = Math.floor(AGREEMENT_END.getTime() / 1000)
    stripeMock.subscriptions.update.mockResolvedValue(subscription({ cancel_at: cancelAt }))

    const result = await cancelSubscription({ linkId: 'link_1', when: 'term_end' })

    expect(result).toMatchObject({ ok: true, cancelAt: new Date(cancelAt * 1000).toISOString() })
    expect(stripeMock.subscriptions.update).toHaveBeenCalledWith('sub_1', { cancel_at: cancelAt, proration_behavior: 'none' })
    expect(history.map((h) => h.kind)).toEqual(['cancellation_scheduled'])
    expect(notifySubscriptionCancelled).not.toHaveBeenCalled()
    expect(sendCancellationScheduledEmail).toHaveBeenCalledTimes(1)

    const expected = remainingObligation({ nextPaymentAt: terms.nextPaymentAt, agreementEnd: AGREEMENT_END, monthlyCents: 47_500 })
    expect(expected.payments).toBeGreaterThan(0) // the point of the dedicated email: charges continue
    const [to, data, options] = sendCancellationScheduledEmail.mock.calls[0]
    expect(to).toBe('owner@example.com')
    expect(data).toMatchObject({
      name: 'Dr. Michael Chen',
      cancelAt: new Date(cancelAt * 1000).toISOString(),
      remainingPayments: expected.payments,
      remainingCents: expected.totalCents,
      monthlyCents: 47_500,
      nextPaymentAt: expected.dates[0]?.toISOString() ?? null,
      billingUrl: 'https://app.test/portal/billing',
    })
    expect(options.metadata).toMatchObject({ customerId: 'cust_1', linkId: 'link_1', subscriptionId: 'sub_1', source: 'admin' })
  })

  it('does not re-send when the same end date was already scheduled', async () => {
    const cancelAt = Math.floor(AGREEMENT_END.getTime() / 1000)
    terms.cancelAt = new Date(cancelAt * 1000)
    stripeMock.subscriptions.update.mockResolvedValue(subscription({ cancel_at: cancelAt }))

    await cancelSubscription({ linkId: 'link_1', when: 'term_end' })

    expect(sendCancellationScheduledEmail).not.toHaveBeenCalled()
    expect(notifySubscriptionCancelled).not.toHaveBeenCalled()
  })

  it('falls back to the current period when no agreement end is on file, and still confirms', async () => {
    const saved = terms.agreementEnd
    ;(terms as { agreementEnd: Date | null }).agreementEnd = null
    stripeMock.subscriptions.update.mockResolvedValue(subscription({ cancel_at_period_end: true }))
    try {
      const result = await cancelSubscription({ linkId: 'link_1', when: 'term_end' })
      expect(result).toMatchObject({ ok: true })
      expect(stripeMock.subscriptions.update).toHaveBeenCalledWith('sub_1', { cancel_at_period_end: true, proration_behavior: 'none' })
      expect(sendCancellationScheduledEmail).toHaveBeenCalledTimes(1)
      const [, data] = sendCancellationScheduledEmail.mock.calls[0]
      expect(data).toMatchObject({ cancelAt: new Date(PERIOD_END * 1000).toISOString(), remainingPayments: 0, remainingCents: 0 })
      expect(notifySubscriptionCancelled).not.toHaveBeenCalled()
    } finally {
      terms.agreementEnd = saved
    }
  })
})

describe('undo a scheduled cancellation', () => {
  it('emails nothing', async () => {
    stripeMock.subscriptions.retrieve.mockResolvedValue(subscription({ cancel_at: PERIOD_END }))
    stripeMock.subscriptions.update.mockResolvedValue(subscription())

    const result = await resumeSubscription({ linkId: 'link_1' })

    expect(result).toEqual({ ok: true, status: 'active' })
    expect(stripeMock.subscriptions.update).toHaveBeenCalledWith('sub_1', { cancel_at: '' })
    expect(history.map((h) => h.kind)).toEqual(['subscription_updated'])
    expect(notifySubscriptionCancelled).not.toHaveBeenCalled()
    expect(sendCancellationScheduledEmail).not.toHaveBeenCalled()
  })
})
