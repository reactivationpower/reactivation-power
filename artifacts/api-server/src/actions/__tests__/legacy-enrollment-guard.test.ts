import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  enrollmentFlow: true,
  completed: false,
  createPayment: vi.fn(), confirmPayment: vi.fn(), retrievePayment: vi.fn(),
  createSetup: vi.fn(), retrieveSetup: vi.fn(), createSubscription: vi.fn(), gate: vi.fn(),
}))
vi.mock('@workspace/db', async importOriginal => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    db: {
      select: () => ({ from: (table: any) => ({ where: () => ({ limit: async () =>
        table === actual.customersTable
          ? [{ id: 'customer', stripeCustomerId: 'cus_fixture' }]
          : [{
            linkId: 'link', customerId: 'customer', type: 'subscription', enrollmentFlow: state.enrollmentFlow,
            setupFeeCents: 49900, monthlyCents: 33000, primaryIntentId: 'pi_existing',
            secondaryIntentId: 'seti_existing', completedAt: state.completed ? new Date() : null,
          }],
      }) }) }),
    },
  }
})
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({
    maybeSingle: async () => ({ data: { id: 'link', token: 'pay-token', name: 'Fixture', email: 'fixture@example.invalid', status: 'pending' } }),
  }) }) }) }),
}))
vi.mock('@/lib/stripe', () => ({ stripe: {
  paymentIntents: { create: state.createPayment, confirm: state.confirmPayment, retrieve: state.retrievePayment },
  setupIntents: { create: state.createSetup, retrieve: state.retrieveSetup },
  subscriptions: { create: state.createSubscription },
} }))
vi.mock('@/lib/agreements/store', () => ({
  agreementAllowsPayment: state.gate, onSetupFeePaid: vi.fn(), onSubscriptionStarted: vi.fn(),
}))
vi.mock('../payments', () => ({ PRODUCT_NAME: 'Patient Pipeline', provisionAccounts: vi.fn(), recordIntentPayment: vi.fn() }))
vi.mock('@/lib/mail', () => ({ sendPaymentReceivedEmail: vi.fn() }))

import { getSubscriptionCheckoutState, getTwoCardCheckoutState, loadLink, recordPrimaryCard, recordSecondaryCard } from '../subscriptions'

beforeEach(() => {
  vi.clearAllMocks()
  state.enrollmentFlow = true
  state.completed = false
  state.gate.mockResolvedValue({ ok: true }) // Even a signed agreement cannot enable this bypass.
})

describe('legacy public subscription endpoints cannot bypass enrollment confirmation', () => {
  it.each([false, true])('rejects enrollment links before Stripe access (completed=%s)', async completed => {
    state.completed = completed
    expect(await loadLink('pay-token')).toBeNull()
    expect(await getSubscriptionCheckoutState('pay-token')).toBeNull()
    expect(await getTwoCardCheckoutState('pay-token')).toBeNull()
    expect(await recordPrimaryCard('pay-token')).toMatchObject({ ok: false })
    expect(await recordSecondaryCard('pay-token')).toMatchObject({ ok: false })
    for (const spy of [state.createPayment, state.confirmPayment, state.retrievePayment,
      state.createSetup, state.retrieveSetup, state.createSubscription, state.gate])
      expect(spy).not.toHaveBeenCalled()
  })

  it('continues to resolve legacy subscriptions and recognize their completed checkout', async () => {
    state.enrollmentFlow = false
    state.completed = true
    expect(await loadLink('pay-token')).not.toBeNull()
    expect(await getSubscriptionCheckoutState('pay-token')).toMatchObject({ stage: 'done', clientSecret: null })
    expect(await recordPrimaryCard('pay-token')).toMatchObject({ ok: true, stage: 'done' })
    expect(await recordSecondaryCard('pay-token')).toMatchObject({ ok: true, stage: 'done' })
  })
})
