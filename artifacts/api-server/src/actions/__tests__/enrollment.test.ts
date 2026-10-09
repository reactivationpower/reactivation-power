import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  terms: {} as any, cards: [] as any[], signed: true, committed: false,
  intent: {} as any,
  create: vi.fn(), confirm: vi.fn(), retrieve: vi.fn(),
}))
vi.mock('@workspace/db', async importOriginal => {
  const actual = await importOriginal<any>()
  function query(table?: any): any {
    const q: any = {
      from: (t: any) => query(t), where: () => q,
      then: (resolve: any) => Promise.resolve(table === actual.customerCardsTable ? state.cards : [state.terms]).then(resolve),
    }
    return q
  }
  const db: any = {
    select: () => query(),
    update: () => ({ set: (values: any) => ({ where: async () => Object.assign(state.terms, values) }) }),
    execute: vi.fn(),
    transaction: async (fn: any) => {
      state.committed = false
      const result = await fn(db)
      state.committed = true
      return result
    },
  }
  return { ...actual, db }
})
vi.mock('@/lib/stripe', () => ({
  getStripeMode: () => 'test',
  stripe: { paymentIntents: { create: state.create, confirm: state.confirm, retrieve: state.retrieve } },
}))
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({ from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'link', token: 'token', amount_cents: 490000 } }) }) }),
  }) }),
}))
vi.mock('@/lib/agreements/store', () => ({
  loadAgreementByToken: async () => ({
    terms: state.terms,
    agreement: { linkId: 'link', id: 'agreement', currentVersion: 1, setupFeeCents: state.terms.setupFeeCents, monthlyCents: state.terms.monthlyCents, termMonths: state.terms.termMonths, signedAt: state.signed ? new Date() : null },
    customer: { id: 'customer', stripeCustomerId: 'cus_test', fullName: 'Fixture', email: 'fixture@example.invalid' },
  }),
  agreementAllowsPayment: async () => state.signed ? { ok: true } : { ok: false, error: 'Sign first.' },
  onSetupFeePaid: vi.fn(), onSubscriptionStarted: vi.fn(),
}))
vi.mock('../subscriptions', () => ({ activateSubscription: vi.fn() }))
vi.mock('../payments', () => ({ PRODUCT_NAME: 'Patient Pipeline', provisionAccounts: vi.fn(), recordIntentPayment: vi.fn() }))
import { checkout, confirm } from '../enrollment'

beforeEach(() => {
  vi.clearAllMocks()
  state.signed = true
  state.committed = false
  state.terms = { linkId: 'link', customerId: 'customer', type: 'subscription', enrollmentFlow: true, enrollmentStripeMode: 'test', setupFeeCents: 49900, monthlyCents: 33000 }
  state.cards = [
    { id: 'first', stripePaymentMethodId: 'pm_first', fingerprint: 'first', rank: 'primary' },
    { id: 'second', stripePaymentMethodId: 'pm_second', fingerprint: 'second', rank: 'secondary' },
  ]
  state.intent = { id: 'pi_test', status: 'requires_confirmation', payment_method: 'pm_first' }
  state.create.mockResolvedValue(state.intent)
  state.confirm.mockImplementation(async () => {
    expect(state.committed).toBe(true)
    expect(state.terms.enrollmentPaymentIntentId).toBe('pi_test')
    return { ...state.intent, status: 'requires_action', client_secret: 'test-only' }
  })
  state.retrieve.mockImplementation(async () => state.intent)
})

describe('agreement-first enrollment', () => {
  it('does not create a payment or card-save intent before signing', async () => {
    state.signed = false
    expect((await checkout('token')).checkout?.stage).toBe('awaiting_signature')
    expect(await confirm('token', 'first')).toEqual({ ok: false, error: 'Sign first.' })
    expect(state.create).not.toHaveBeenCalled()
  })
  it('requires two saved cards for subscriptions', async () => {
    state.cards.pop()
    expect((await confirm('token', 'first')).ok).toBe(false)
    expect(state.create).not.toHaveBeenCalled()
  })
  it('rejects different payment-method IDs sharing a Stripe fingerprint', async () => {
    state.cards[1].fingerprint = 'first'
    expect((await confirm('token', 'first')).ok).toBe(false)
    expect(state.create).not.toHaveBeenCalled()
  })
  it('allows one card for full payment and persists its intent before authentication', async () => {
    state.terms.type = 'one_time'
    state.terms.setupFeeCents = 490000
    state.cards.pop()
    expect(await confirm('token', 'first')).toMatchObject({ ok: true, requiresAction: true })
    expect(state.create.mock.calls[0][0].amount).toBe(490000)
  })
  it('preserves the durable intent after an initial decline instead of rolling it back', async () => {
    state.confirm.mockRejectedValue(new Error('Declined'))
    state.retrieve.mockResolvedValue({ ...state.intent, status: 'requires_payment_method', last_payment_error: { message: 'Declined' } })
    expect(await confirm('token', 'first')).toEqual({ ok: false, error: 'Declined' })
    expect(state.committed).toBe(true)
    expect(state.terms.enrollmentPaymentIntentId).toBe('pi_test')
  })
  it('never declares a processing payment complete', async () => {
    state.confirm.mockResolvedValue({ ...state.intent, status: 'processing' })
    expect(await confirm('token', 'first')).toEqual({ ok: true, processing: true })
    expect(state.terms.completedAt).toBeUndefined()
  })
  it('does not silently change cards while another payment awaits authentication', async () => {
    state.terms.enrollmentPaymentIntentId = 'pi_test'
    state.intent.status = 'requires_action'
    await expect(confirm('token', 'second')).rejects.toThrow('different card')
    expect(state.confirm).not.toHaveBeenCalled()
    expect(state.create).not.toHaveBeenCalled()
  })
})
