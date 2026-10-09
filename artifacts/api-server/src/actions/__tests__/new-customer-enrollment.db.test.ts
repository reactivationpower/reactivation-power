import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { drizzle } from 'drizzle-orm/node-postgres'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  db: null as any, pool:null as any, proxy: vi.fn(),
  stripeCreate: vi.fn(), welcome: vi.fn(), receipt: vi.fn(),
  attachReferral: vi.fn(async (..._args: unknown[]) => {}),
}))
vi.mock('@/lib/affiliates/attribution', () => ({ attachCustomerReferral: state.attachReferral }))
vi.mock('@/lib/affiliates/ledger', () => ({ queueAffiliateHistory: vi.fn(async () => {}) }))
vi.mock('@workspace/db', async original => ({
  ...await original<any>(),
  pool: { query: (...args:any[]) => state.pool.query(...args), connect: () => state.pool.connect() },
  db: new Proxy({}, { get: (_, key) => typeof state.db[key] === 'function' ? state.db[key].bind(state.db) : state.db[key] }),
}))
vi.mock('@replit/connectors-sdk', () => ({
  ReplitConnectors: class { proxy(...args: any[]) { return state.proxy(...args) } },
}))
vi.mock('@/lib/auth/admin-session', () => ({
  requireAdmin: async () => ({ userId: 'test-rep', name: 'Test rep', email: 'rep@example.test', role: 'sales_rep' }),
  getAdminSession: async () => null,
}))
vi.mock('@/lib/stripe', () => ({
  getStripeMode: () => 'test',
  stripe: { customers: { create: state.stripeCreate }, paymentIntents: { create: state.stripeCreate }, subscriptions: { create: state.stripeCreate } },
}))
vi.mock('@/lib/mail', async original => ({
  ...await original<any>(), sendPortalWelcomeEmail: state.welcome, sendPaymentReceivedEmail: state.receipt,
}))
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'payment_links') throw new Error(`Unexpected table ${table}`)
      return {
        select: () => ({ eq: (_: string, id: string) => ({
          maybeSingle: async () => ({ data: (await state.db.execute(sql`SELECT * FROM payment_links WHERE id = ${id}::uuid`)).rows[0] }),
          single: async () => ({ data: (await state.db.execute(sql`SELECT * FROM payment_links WHERE id = ${id}::uuid`)).rows[0] }),
        }) }),
        update: (values: any) => ({ eq: async (_: string, id: string) => {
          await state.db.execute(sql`UPDATE payment_links SET amount_cents = ${values.amount_cents} WHERE id = ${id}::uuid`)
          return { error: null }
        } }),
      }
    },
  }),
}))

const actual = await vi.importActual<typeof import('@workspace/db')>('@workspace/db')
const { createPaymentLink, retryCustomerEnrollment } = await import('../payments')
const { resendAgreement, getAgreementSendForm, updateAgreement, previewEnrollmentEmail } = await import('../agreements')
const { retryPendingEnrollmentInvitations } = await import('@/lib/agreements/enrollment-invitation')
const schema = `invitation_test_${randomUUID().replaceAll('-', '')}`
let scopedPool: any
const customer = {
  fullName: 'Test Buyer', businessName: 'Isolated practice', businessAddress: '1 Test Street',
  phone: '(555) 555-1234', ownerName: 'Test Owner', ownerPhone: '(555) 555-9876', email: 'buyer@example.test',
}
const input = (offer: any) => ({
  customer, offer, requestId: randomUUID(), staff: [{ name: 'Test staff', email: 'staff@example.test' }],
})
const rows = async (table: string) => (await scopedPool.query(`SELECT * FROM ${table}`)).rows
const tables = ['payment_links', 'customers', 'payment_link_terms', 'agreements', 'agreement_versions',
  'agreement_events', 'agreement_initials', 'agreement_deliveries', 'email_log', 'enrollment_invitations',
  'sales_leads','sales_jobs','sales_activities','affiliates','affiliate_attributions','affiliate_activity']

describe.skipIf(!process.env.SUPABASE_DB_URL)('New Customer → agreement → mocked Resend (isolated Postgres)', () => {
  beforeAll(async () => {
    actual.pool.options.max = 2
    await actual.pool.query(`CREATE SCHEMA "${schema}"`)
    scopedPool = new (actual.pool.constructor as any)({ ...actual.pool.options, max: 3 })
    scopedPool.on('connect', (client: any) => { void client.query(`SET search_path TO "${schema}"`) })
    state.db = drizzle(scopedPool)
    state.pool = scopedPool
    for (const table of tables.filter(t => t !== 'enrollment_invitations')) {
      await scopedPool.query(`CREATE TABLE ${table} (LIKE public.${table} INCLUDING ALL)`)
    }
    await scopedPool.query(readFileSync(new URL('../../../../../lib/db/migrations/0028_complex_slipstream.sql', import.meta.url), 'utf8'))
  }, 30_000)
  beforeEach(async () => {
    await scopedPool.query(`TRUNCATE ${tables.join(', ')}`)
    vi.clearAllMocks()
    state.proxy.mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: randomUUID() }) })
  })
  afterAll(async () => {
    await scopedPool?.end()
    await actual.pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    await actual.pool.end()
  }, 20_000)

  it.each([
    [{ type: 'one_time', amountDollars: 2345.67 }, 0, 0, 234567, '$2,345.67'],
    [{ type: 'subscription', monthlyDollars: 321.45, setupFeeDollars: 123.45 }, 12, 32145, 12345, '$321.45'],
    [{ type: 'subscription', monthlyDollars: 250.25, setupFeeDollars: 0 }, 12, 25025, 0, '$250.25'],
  ])('uses negotiated %j without billing or staff copies', async (offer, term, monthly, setup, displayed) => {
    const result = await createPaymentLink(input(offer))
    expect(result).toMatchObject({ ok: true, invitation: { status: 'provider_accepted' } })
    const [a] = await rows('agreements')
    expect(a).toMatchObject({ term_months: term, monthly_cents: monthly, setup_fee_cents: setup,
      signed_at: null, completed_at: null, copy_emails: [] })
    const [terms] = await rows('payment_link_terms')
    expect(terms).toMatchObject({ monthly_cents: monthly, setup_fee_cents: setup, stripe_subscription_id: null, completed_at: null })
    expect(state.proxy).toHaveBeenCalledTimes(1)
    const options = state.proxy.mock.calls[0]![2]
    expect(options.headers['Idempotency-Key']).toBe(`enrollment-initial-${a.id}`)
    expect(options.body).toMatchObject({ from: 'Patient Pipeline <team@patientpipeline.app>', to: [customer.email] })
    expect(options.body.html).toContain(`https://patientpipeline.app/agreements/${a.token}`)
    expect(options.body.html).toContain(displayed)
    expect((await rows('email_log'))[0]).toMatchObject({ status: 'sent', type: 'agreement_sent' })
    expect(JSON.stringify(await rows('email_log'))).not.toContain(a.token)
    expect(state.stripeCreate).not.toHaveBeenCalled()
    expect(state.attachReferral).toHaveBeenCalledWith(result.link!.customer_id, customer.email, customer.phone)
    expect(state.welcome).not.toHaveBeenCalled()
    expect(state.receipt).not.toHaveBeenCalled()
  })

  it('rejects invalid creation without saving or sending', async () => {
    const result = await createPaymentLink(input({ type: 'one_time', amountDollars: 0 }))
    expect(result.ok).toBe(false)
    expect(await rows('customers')).toHaveLength(0)
    expect(await rows('payment_links')).toHaveLength(0)
    expect(state.proxy).not.toHaveBeenCalled()
  })

  it('rolls back failed offer persistence and sends nothing', async () => {
    await scopedPool.query('ALTER TABLE payment_link_terms ADD CONSTRAINT test_reject CHECK (monthly_cents < 90000)')
    try {
      const result = await createPaymentLink(input({ type: 'subscription', monthlyDollars: 1000, setupFeeDollars: 0 }))
      expect(result.ok).toBe(false)
      expect(await rows('customers')).toHaveLength(0)
      expect(await rows('payment_links')).toHaveLength(0)
      expect(await rows('enrollment_invitations')).toHaveLength(0)
      expect(state.proxy).not.toHaveBeenCalled()
    } finally {
      await scopedPool.query('ALTER TABLE payment_link_terms DROP CONSTRAINT test_reject')
    }
  })

  it('preserves the saved enrollment on provider failure; retry sends the identical initial request', async () => {
    state.proxy.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ message: 'secret signing token echoed' }) })
    const request = input({ type: 'subscription', monthlyDollars: 199.99, setupFeeDollars: 0 })
    const first = await createPaymentLink(request)
    expect(first).toMatchObject({ ok: true, invitation: { status: 'failed' } })
    expect(await rows('agreements')).toHaveLength(1)
    expect((await rows('email_log'))[0]).toMatchObject({ status: 'failed', error: 'Resend rejected the email (HTTP 403)' })
    const retry = await retryCustomerEnrollment(first.link!.id)
    expect(retry.invitation.status).toBe('provider_accepted')
    expect(state.proxy.mock.calls[0]![2]).toEqual(state.proxy.mock.calls[1]![2])
    const duplicate = await createPaymentLink(request)
    expect(duplicate.link!.id).toBe(first.link!.id)
    expect(duplicate.invitation!.status).toBe('provider_accepted')
    expect(await rows('payment_links')).toHaveLength(1)
    expect(await rows('agreement_versions')).toHaveLength(1)
    expect(state.proxy).toHaveBeenCalledTimes(2)
  })

  it('concurrent duplicate submissions save one link, agreement and initial email', async () => {
    const request = input({ type: 'one_time', amountDollars: 1500 })
    const results = await Promise.all([createPaymentLink(request), createPaymentLink(request), createPaymentLink(request)])
    expect(results.every(r => r.ok)).toBe(true)
    expect(new Set(results.map(r => r.link!.id)).size).toBe(1)
    expect(await rows('customers')).toHaveLength(1)
    expect(await rows('agreements')).toHaveLength(1)
    expect(await rows('agreement_versions')).toHaveLength(1)
    expect(state.proxy).toHaveBeenCalledTimes(1)
  }, 20_000)
  it('sales lead enrollment preserves affiliate attribution and authenticated actor while retrying the same saved customer and offer', async () => {
    await scopedPool.query("INSERT INTO affiliates(id,business_name,email,status,referral_code) VALUES('affiliate-fixture','Fixture partner','partner@example.test','approved','fixture-code')")
    await scopedPool.query("INSERT INTO sales_leads(id,email,first_name,last_name,source,affiliate_id) VALUES('sales-fixture',$1,'Test','Buyer','website','affiliate-fixture')",[customer.email])
    const request={...input({type:'one_time',amountDollars:1500}),salesLeadId:'sales-fixture'}
    const first=await createPaymentLink(request)
    expect(first).toMatchObject({ok:true,invitation:{status:'provider_accepted'}})
    expect((await rows('sales_leads'))[0]).toMatchObject({stage:'Won',customer_id:first.link!.customer_id,affiliate_id:'affiliate-fixture',automation_state:'converted'})
    expect((await rows('affiliate_activity'))[0]).toMatchObject({actor:'test-rep',customer_id:first.link!.customer_id})
    expect((await rows('sales_activities'))[0]).toMatchObject({kind:'conversion',author_id:'test-rep',author_name:'Test rep'})
    const retried=await createPaymentLink(request)
    expect(retried.link!.id).toBe(first.link!.id)
    for(const table of ['customers','payment_links','affiliate_attributions','affiliate_activity','sales_activities']) expect(await rows(table)).toHaveLength(1)
    expect(state.proxy).toHaveBeenCalledTimes(1)
    expect(state.stripeCreate).not.toHaveBeenCalled()
  },20000)

  it('keeps customer/link when agreement persistence fails and retries atomically', async () => {
    await scopedPool.query('ALTER TABLE agreement_versions ADD CONSTRAINT test_reject CHECK (setup_fee_cents = 0)')
    let saved: any
    try {
      saved = await createPaymentLink(input({ type: 'one_time', amountDollars: 2000 }))
      expect(saved).toMatchObject({ ok: true, invitation: { status: 'failed' } })
      expect(await rows('payment_links')).toHaveLength(1)
      expect(await rows('agreements')).toHaveLength(0)
      expect(state.proxy).not.toHaveBeenCalled()
    } finally {
      await scopedPool.query('ALTER TABLE agreement_versions DROP CONSTRAINT test_reject')
    }
    expect((await retryCustomerEnrollment(saved.link.id)).invitation.status).toBe('provider_accepted')
    expect(await rows('agreements')).toHaveLength(1)
  })

  it('recovers a stale sending lease, but does not replay beyond provider retention', async () => {
    state.proxy.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
    const saved = await createPaymentLink(input({ type: 'one_time', amountDollars: 1900 }))
    await scopedPool.query("UPDATE enrollment_invitations SET status = 'sending', updated_at = now() - interval '6 minutes'")
    await retryPendingEnrollmentInvitations()
    expect(state.proxy).toHaveBeenCalledTimes(2)
    await scopedPool.query("UPDATE enrollment_invitations SET status = 'sending', first_attempt_at = now() - interval '25 hours', updated_at = now() - interval '6 minutes'")
    const expired = await retryCustomerEnrollment(saved.link!.id)
    expect(expired.invitation.error).toContain('window expired')
    expect(state.proxy).toHaveBeenCalledTimes(2)
  })

  it('recovers the atomically saved delivery intent even before any agreement exists', async () => {
    await scopedPool.query('ALTER TABLE agreement_versions ADD CONSTRAINT test_reject CHECK (setup_fee_cents = 0)')
    try {
      const saved = await createPaymentLink(input({ type: 'one_time', amountDollars: 2345.67 }))
      expect(saved.ok).toBe(true)
      expect((await rows('enrollment_invitations'))[0]).toMatchObject({
        link_id: saved.link!.id, agreement_id: null, payload: null, status: 'pending', attempts: 0,
      })
      expect(await rows('agreements')).toHaveLength(0)
      expect(state.proxy).not.toHaveBeenCalled()
    } finally {
      await scopedPool.query('ALTER TABLE agreement_versions DROP CONSTRAINT test_reject')
    }
    await scopedPool.query("UPDATE enrollment_invitations SET updated_at = now() - interval '6 minutes'")
    await retryPendingEnrollmentInvitations()
    expect(await rows('payment_links')).toHaveLength(1)
    expect(await rows('agreements')).toHaveLength(1)
    expect((await rows('enrollment_invitations'))[0].status).toBe('provider_accepted')
    expect(state.proxy).toHaveBeenCalledTimes(1)
    expect(state.proxy.mock.calls[0]![2].body.html).toContain('$2,345.67')
    expect(state.stripeCreate).not.toHaveBeenCalled()
  })

  it('preserves edit, preview, delivery options and explicit resends as new requests', async () => {
    const saved = await createPaymentLink(input({ type: 'subscription', monthlyDollars: 250, setupFeeDollars: 0 }))
    const [a] = await rows('agreements')
    const form = await getAgreementSendForm(saved.link!.id)
    expect(form.form).toMatchObject({ monthlyDollars: 250, setupFeeDollars: 0, termMonths: 12 })
    expect((await previewEnrollmentEmail(saved.link!.id, form.form!)).html).toContain('patientpipeline.app')
    const edited = await updateAgreement(a.id, { ...form.form!, monthlyDollars: 225 })
    expect(edited.ok).toBe(true)
    expect((await rows('agreement_versions')).length).toBe(2)
    const resend = await resendAgreement(a.id, { signerEmail: 'signer@example.test', copyEmails: ['copy@example.test'] })
    expect(resend).toMatchObject({ ok: true, deliveryStatus: 'provider_accepted' })
    expect(state.proxy).toHaveBeenCalledTimes(3)
    expect(state.proxy.mock.calls[1]![2].headers).toBeUndefined()
    expect(state.proxy.mock.calls[1]![2].body.to).toEqual(['signer@example.test'])
    expect(state.proxy.mock.calls[2]![2].body.to).toEqual(['copy@example.test'])
    expect(state.proxy.mock.calls[2]![2].body.html).not.toContain(`/agreements/${a.token}`)
  })

  it('reports an active send as sending without starting another attempt', async () => {
    state.proxy.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
    const saved = await createPaymentLink(input({ type: 'one_time', amountDollars: 1300 }))
    await scopedPool.query("UPDATE enrollment_invitations SET status = 'sending', updated_at = now()")
    expect((await retryCustomerEnrollment(saved.link!.id)).invitation.status).toBe('sending')
    expect(state.proxy).toHaveBeenCalledTimes(1)
  })

  it('records a lost provider response as pending and retries within the same provider key', async () => {
    state.proxy.mockRejectedValueOnce(new Error('Network response lost with secret signing token'))
    const saved = await createPaymentLink(input({ type: 'one_time', amountDollars: 1350 }))
    expect(saved).toMatchObject({ ok: true, invitation: { status: 'sending' } })
    expect((await rows('email_log'))[0].status).toBe('pending')
    expect(JSON.stringify(await rows('email_log'))).not.toContain('secret signing token')
    await scopedPool.query("UPDATE enrollment_invitations SET updated_at = now() - interval '6 minutes'")
    await retryPendingEnrollmentInvitations()
    expect((await rows('enrollment_invitations'))[0].status).toBe('provider_accepted')
    expect(state.proxy.mock.calls[0]![2]).toEqual(state.proxy.mock.calls[1]![2])
  })

  it('limits background attempts and stops retrying when a deliberate send replaces the initial invitation', async () => {
    state.proxy.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    const saved = await createPaymentLink(input({ type: 'one_time', amountDollars: 1300 }))
    await scopedPool.query("UPDATE enrollment_invitations SET attempts = 5, updated_at = now() - interval '6 minutes'")
    await retryPendingEnrollmentInvitations()
    expect(state.proxy).toHaveBeenCalledTimes(1)
    const [a] = await rows('agreements')
    state.proxy.mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: randomUUID() }) })
    expect((await resendAgreement(a.id)).deliveryStatus).toBe('provider_accepted')
    expect((await rows('enrollment_invitations'))[0].status).toBe('superseded')
    expect((await retryCustomerEnrollment(saved.link!.id)).invitation.error).toContain('explicit send')
    expect(state.proxy).toHaveBeenCalledTimes(2)
  })
})
