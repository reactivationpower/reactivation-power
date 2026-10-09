import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { PoolClient } from '@workspace/db'
import type { Request, Response } from 'express'
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const isolated = vi.hoisted(() => ({ acquire: null as null | (() => Promise<PoolClient>), schema: '' }))
vi.mock('@workspace/db', async original => {
  const actual = await original<typeof import('@workspace/db')>()
  const facade = {
    connect: () => isolated.acquire!(),
    query: async (text: string, values?: unknown[]) => {
      const client = await isolated.acquire!()
      try { return await client.query(text, values) } finally { client.release() }
    },
  }
  const { drizzle } = await import('drizzle-orm/node-postgres')
  return { ...actual, pool: facade, db: drizzle(facade as never) }
})
vi.mock('@/lib/mail/send', () => ({ sendEmail: vi.fn().mockResolvedValue({ ok: true, logId: 'mock-mail' }) }))
vi.mock('@/lib/stripe', () => ({ stripe: { charges: { retrieve: vi.fn() } } }))
vi.mock('@/lib/auth/admin-session', () => ({ requireAdmin: vi.fn().mockResolvedValue({ userId: 'fixture-admin', role: 'super_admin' }) }))

const actual = await vi.importActual<typeof import('@workspace/db')>('@workspace/db')
const { pool, db, paymentHistoryTable } = await import('@workspace/db')
const { processAffiliateHistory, processAffiliateDispute, recordAffiliateEligibility } = await import('./ledger')
const { resolveQualifiedReferral, attachCustomerReferral, referralFromRequest, captureReferral, recordAffiliateConversion } = await import('./attribution')
const { affiliateReport } = await import('./reports')
const { recordWire, deliverPayout } = await import('./payouts')
const { sendAccess, verifyAccess, affiliateSession, revokeAccess, trustedAffiliateIp } = await import('./access')
const { cleanupAffiliateTelemetry } = await import('./retention')
const actions = await import('@/actions/affiliates')
const { authDigest } = await import('@/lib/auth/portal-password')
const { sendEmail } = await import('@/lib/mail/send')
const { stripe } = await import('@/lib/stripe')
const { runWithRequestContext } = await import('@/lib/request-context')
const partnerA = randomUUID(), partnerB = randomUUID(), customerId = randomUUID(), linkId = randomUUID()
const email = `fixture-${randomUUID()}@example.invalid`
const at = new Date('2026-02-15T15:00:00Z')
const req = (cookies = {}): Request => ({ cookies, secure: false, socket: { remoteAddress: '127.0.0.1' }, header: () => undefined } as unknown as Request)
const res = () => ({ cookie: vi.fn(), clearCookie: vi.fn() }) as unknown as Response
const context = <T>(fn: () => Promise<T>, request = req(), response = res()) => runWithRequestContext(request, response, fn)

describe.skipIf(!process.env.SUPABASE_DB_URL)('affiliate program isolated Postgres fixtures', { timeout: 20000 }, () => {
  beforeAll(async () => {
    actual.pool.options.max = 4
    isolated.schema = `affiliate_test_${randomUUID().replaceAll('-', '')}`
    await actual.pool.query(`CREATE SCHEMA "${isolated.schema}"`)
    isolated.acquire = async () => {
      const c = await actual.pool.connect()
      await c.query(`SET search_path TO "${isolated.schema}"`)
      return c
    }
    for (const table of ['customers', 'payment_link_terms', 'payment_history', 'email_log', 'portal_auth_limits']) {
      await pool.query(`CREATE TABLE ${table} (LIKE public.${table} INCLUDING ALL)`)
    }
    const migration = await readFile(new URL('../../../../../lib/db/migrations/0026_affiliate_program.sql', import.meta.url), 'utf8')
    await pool.query(migration)
    await pool.query(await readFile(new URL('../../../../../lib/db/migrations/0027_affiliate_cash_evidence.sql', import.meta.url), 'utf8'))
  }, 30000)
  afterAll(async () => {
    if (isolated.schema) await actual.pool.query(`DROP SCHEMA IF EXISTS "${isolated.schema}" CASCADE`)
    await actual.pool.end()
  })
  beforeEach(async () => {
    vi.mocked(sendEmail).mockClear().mockResolvedValue({ ok: true, logId: 'mock-mail' })
    await pool.query(`TRUNCATE affiliates,affiliate_rules,affiliate_leads,affiliate_attributions,affiliate_sessions,affiliate_challenges,
      affiliate_activity,affiliate_ledger,affiliate_reversals,affiliate_disputes,affiliate_payouts,affiliate_payout_allocations,
      affiliate_customer_states,affiliate_history_work,customers,payment_history,payment_link_terms,email_log,portal_auth_limits CASCADE`)
    await pool.query(`INSERT INTO affiliates(id,business_name,email,status,referral_code) VALUES
      ($1,'Partner A',$3,'approved',$4),($2,'Partner B','partner-b@example.invalid','approved',$5)`,
    [partnerA, partnerB, email, 'A'.repeat(32), 'B'.repeat(32)])
    for (const p of [partnerA, partnerB]) {
      await pool.query(`INSERT INTO affiliate_rules(id,affiliate_id,rules,status,effective_at,actor,reason)
        VALUES($1,$2,$3,'approved','2026-01-01','fixture','fixture')`,
      [randomUUID(), p, { monthly: { kind: 'percent', value: 1000 }, one_time: { kind: 'flat', value: 2500 } }])
    }
    await pool.query(`INSERT INTO customers(id,email,full_name,business_name,billing_status) VALUES($1,'practice@example.invalid','Fixture Owner','Fixture Practice','active')`, [customerId])
    await pool.query(`INSERT INTO payment_link_terms(link_id,token,customer_id,type,monthly_cents)
      VALUES($1,$2,$3,'subscription',10000)`, [linkId, randomUUID(), customerId])
    await pool.query(`INSERT INTO affiliate_attributions(id,customer_id,affiliate_id,effective_at,actor,reason)
      VALUES($1,$2,$3,'2026-01-01','fixture','fixture')`, [randomUUID(), customerId, partnerA])
  })
  async function payment(overrides: Partial<typeof paymentHistoryTable.$inferInsert> = {}) {
    const [row] = await db.insert(paymentHistoryTable).values({
      id: randomUUID(), customerId, linkId, kind: 'invoice_paid', status: 'succeeded',
      amountCents: 10000, stripeInvoiceId: `in_${randomUUID()}`, stripeChargeId: `ch_${randomUUID()}`,
      occurredAt: at, ...overrides,
    }).returning()
    return row!
  }
  it('snapshots defaults and overrides prospectively; excludes setup and preserves rep ledger separation', async () => {
    const first = await payment()
    await Promise.all([processAffiliateHistory(first), processAffiliateHistory(first)])
    expect((await affiliateReport(partnerA)).earned_cents).toBe(1000)
    await pool.query(`INSERT INTO affiliate_rules(id,affiliate_id,customer_id,rules,status,effective_at,actor,reason)
      VALUES($1,$2,$3,$4,'approved','2026-03-01','fixture','override')`,
    [randomUUID(), partnerA, customerId, { monthly: { kind: 'flat', value: 1500 }, one_time: { kind: 'percent', value: 2000 } }])
    await processAffiliateHistory(await payment({ occurredAt: new Date('2026-03-15'), stripeInvoiceId: null }))
    expect((await affiliateReport(partnerA)).entries).toHaveLength(1) // setup
    await processAffiliateHistory(await payment({ occurredAt: new Date('2026-03-15') }))
    const report = await affiliateReport(partnerA)
    expect(report.earned_cents).toBe(2500)
    expect(report.entries.map(e => e.rule.value).sort()).toEqual([1000, 1500])
  })
  it('earns flat one-time per closed paid sale, not per duplicate charge or failed payment', async () => {
    await pool.query("UPDATE payment_link_terms SET type='one_time' WHERE link_id=$1", [linkId])
    const row = await payment({ stripeInvoiceId: null })
    await processAffiliateHistory(row)
    await processAffiliateHistory(await payment({ stripeInvoiceId: null }))
    await processAffiliateHistory(await payment({ status: 'failed' }))
    expect((await affiliateReport(partnerA)).earned_cents).toBe(2500)
  })
  it('claws back only associated commission; partial refunds, overlapping dispute and recovery do not double count', async () => {
    const row = await payment()
    await processAffiliateHistory(row)
    const refund = await payment({ kind: 'refund', status: 'refunded', stripeChargeId: row.stripeChargeId, stripeInvoiceId: null, stripeRefundId: `re_${randomUUID()}`, amountCents: 5000, occurredAt: new Date('2026-05-01T16:00:00Z') })
    await processAffiliateHistory(refund)
    await processAffiliateHistory(refund)
    expect((await affiliateReport(partnerA)).earned_cents).toBe(500)
    vi.mocked(stripe.charges.retrieve).mockResolvedValue({ id: row.stripeChargeId!, amount_refunded: 5000, payment_intent: null } as never)
    const dispute = { id: `dp_${randomUUID()}`, charge: row.stripeChargeId, amount: 10000, status: 'lost', created: 1777651200 } as never
    await processAffiliateDispute(dispute, new Date('2026-05-02T16:00:00Z'))
    expect((await affiliateReport(partnerA)).earned_cents).toBe(0)
    await processAffiliateDispute({ ...dispute as object, status: 'won' } as never, new Date('2026-06-01T16:00:00Z'))
    expect((await affiliateReport(partnerA)).earned_cents).toBe(500)
  })
  it('reconciles refund-before-payment and dispute-before-payment without duplicate or lost earnings', async () => {
    const key = `ch_${randomUUID()}`
    const refund = await payment({ kind: 'refund', status: 'refunded', amountCents: 10000, stripeChargeId: key, stripeRefundId: `re_${randomUUID()}`, stripeInvoiceId: null, occurredAt: new Date('2026-04-01') })
    await processAffiliateHistory(refund)
    await processAffiliateHistory(await payment({ stripeChargeId: key }))
    expect((await affiliateReport(partnerA)).earned_cents).toBe(0)
  })
  it('uses unique cash-flow evidence for disjoint partial refunds/disputes, restores principal, and ignores older delivery', async () => {
    const row = await payment()
    await processAffiliateHistory(row)
    vi.mocked(stripe.charges.retrieve).mockResolvedValue({ id: row.stripeChargeId!, amount_refunded: 5000, payment_intent: null } as never)
    const dispute = { id: `dp_${randomUUID()}`, charge: row.stripeChargeId, amount: 5000, status: 'lost', created: 1777651200,
      balance_transactions: [{ amount: -5000, fee: 1500 }] } as never
    await processAffiliateDispute(dispute, new Date('2026-05-02T16:00:00Z'))
    expect((await affiliateReport(partnerA)).earned_cents).toBe(0) // 50% refunded + separate 50% withdrawn, NOT the fee
    await processAffiliateDispute({ ...dispute as object, status: 'won', balance_transactions: [{ amount: -5000 }, { amount: 5000 }] } as never, new Date('2026-06-01T16:00:00Z'))
    expect((await affiliateReport(partnerA)).earned_cents).toBe(500)
    await processAffiliateDispute(dispute, new Date('2026-05-02T16:00:00Z'))
    expect((await affiliateReport(partnerA)).earned_cents).toBe(500)
  })
  it('uses eligibility at transaction time; late pause delivery reverses only payments during pause, not earlier earnings', async () => {
    await processAffiliateHistory(await payment())
    await processAffiliateHistory(await payment({ occurredAt: new Date('2026-04-10') }))
    await recordAffiliateEligibility(customerId, false, new Date('2026-04-01'), `evt_${randomUUID()}`)
    expect((await affiliateReport(partnerA)).earned_cents).toBe(1000)
    await processAffiliateHistory(await payment({ occurredAt: new Date('2026-01-15'),
      stripeInvoiceId: 'in_before_submission', stripeChargeId: 'ch_before_submission', stripePaymentIntentId: 'pi_before_submission' }))
    expect((await affiliateReport(partnerA)).earned_cents).toBe(2000)
    await processAffiliateHistory(await payment({ occurredAt: new Date('2026-04-15') }))
    expect((await affiliateReport(partnerA)).earned_cents).toBe(2000)
  })
  it('serializes partial wires and duplicate requests, retains negative balances across inactive months, retries mail independently', async () => {
    const row = await payment()
    await processAffiliateHistory(row)
    vi.mocked(sendEmail).mockResolvedValueOnce({ ok: false, logId: 'failed-mail', error: 'Provider rejected email' })
    const wire = { affiliateId: partnerA, period: '2026-02', amountCents: 400, paymentDate: '2026-03-03', reference: 'Affiliate payment for February 2026', key: randomUUID() }
    const paid = await recordWire(wire, 'fixture')
    expect(paid.emailSent).toBe(false)
    expect((await affiliateReport(partnerA)).balance_cents).toBe(600)
    await deliverPayout(paid.payoutId)
    await recordWire(wire, 'fixture')
    expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(2)
    const attempts = await Promise.allSettled([recordWire({ ...wire, amountCents: 600, key: randomUUID() }, 'fixture'), recordWire({ ...wire, amountCents: 600, key: randomUUID() }, 'fixture')])
    expect(attempts.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    await processAffiliateHistory(await payment({ kind: 'refund', status: 'refunded', amountCents: 10000, stripeChargeId: row.stripeChargeId, stripeInvoiceId: null, stripeRefundId: `re_${randomUUID()}`, occurredAt: new Date('2026-07-15') }))
    expect((await affiliateReport(partnerA)).balance_cents).toBe(-1000)
    await expect(recordWire({ ...wire, amountCents: 1, period: '2026-08', key: randomUUID() }, 'fixture')).rejects.toThrow()
    await processAffiliateHistory(await payment({ occurredAt: new Date('2026-10-15'), amountCents: 20000 }))
    expect((await affiliateReport(partnerA)).balance_cents).toBe(1000)
    await expect(pool.query('UPDATE affiliate_ledger SET cents=0')).rejects.toThrow('immutable')
  })
  it('protects qualified submission for five elapsed days, switches only on resubmission, then locks conversion', async () => {
    const input = { email: 'fresh-lead@example.invalid', phone: '2025550197', practiceName: 'Fresh Practice' }
    const first = await resolveQualifiedReferral({ ...input, affiliateId: partnerA }, new Date('2026-02-01T12:00:00Z'))
    expect((await resolveQualifiedReferral({ ...input, affiliateId: partnerB }, new Date('2026-02-02T12:00:00Z'))).affiliateId).toBe(partnerA)
    expect((await pool.query('SELECT affiliate_id FROM affiliate_leads WHERE id=$1', [first.leadId])).rows[0].affiliate_id).toBe(partnerA)
    expect((await resolveQualifiedReferral({ ...input, affiliateId: partnerB }, new Date('2026-02-06T12:00:00Z'))).affiliateId).toBe(partnerB)
    await pool.query('DELETE FROM affiliate_attributions')
    await attachCustomerReferral(customerId, input.email, input.phone)
    // Fixture timestamps need to precede the historical synthetic transaction.
    await pool.query("UPDATE affiliate_attributions SET effective_at='2026-02-06' WHERE customer_id=$1", [customerId])
    await processAffiliateHistory(await payment())
    expect((await resolveQualifiedReferral({ ...input, affiliateId: partnerA }, new Date('2026-04-01'))).affiliateId).toBe(partnerB)
  })
  it('rejects self-referral, inactive and tampered context; only the latest eligible click wins', async () => {
    const response = res()
    await context(() => captureReferral('A'.repeat(32)), req(), response)
    const cookie = vi.mocked(response.cookie).mock.calls[0]![1]
    expect(await context(() => referralFromRequest('practice@example.invalid'), req({ pp_referral: cookie }))).toBe(partnerA)
    expect(await context(() => referralFromRequest(email), req({ pp_referral: cookie }))).toBeNull()
    expect(await context(() => referralFromRequest('practice@example.invalid'), req({ pp_referral: cookie + 'tamper' }))).toBeNull()
    await pool.query("UPDATE affiliates SET status='inactive' WHERE id=$1", [partnerA])
    expect(await context(() => referralFromRequest('practice@example.invalid'), req({ pp_referral: cookie }))).toBeNull()
    expect(await context(() => captureReferral('invalid'))).toBe(false)
  })
  it('locks a waived-fee conversion, including an unattributed qualified lead, without inventing earnings', async () => {
    const input = { email: 'practice@example.invalid', phone: '', practiceName: 'Fixture Practice' }
    await pool.query('DELETE FROM affiliate_attributions')
    const lead = await resolveQualifiedReferral({ ...input, affiliateId: null }, new Date('2026-02-01'))
    await recordAffiliateConversion(customerId, new Date('2026-02-02'))
    expect((await resolveQualifiedReferral({ ...input, affiliateId: partnerA }, new Date('2026-03-01'))).affiliateId).toBeNull()
    expect((await pool.query('SELECT converted_customer_id FROM affiliate_leads WHERE id=$1', [lead.leadId])).rows[0].converted_customer_id).toBe(customerId)
    expect((await affiliateReport(partnerA)).entries).toHaveLength(0)
  })
  it('keeps distinct qualified emails sharing one phone separate through attachment, conversion, commissions and portal reads', async () => {
    await pool.query('DELETE FROM affiliate_attributions')
    const phone = '2025550198'
    const first = await resolveQualifiedReferral({ email: 'first-practice@example.invalid', phone, practiceName: 'First Practice', affiliateId: partnerA }, new Date('2026-02-01'))
    const second = await resolveQualifiedReferral({ email: 'second-practice@example.invalid', phone, practiceName: 'Second Practice', affiliateId: partnerB }, new Date('2026-02-02'))
    expect(second.leadId).not.toBe(first.leadId)
    expect(second.affiliateId).toBe(partnerB)
    await pool.query("UPDATE customers SET email='SECOND-practice@example.invalid',phone=$2,business_name='Second Practice' WHERE id=$1", [customerId, phone])
    await attachCustomerReferral(customerId, ' SECOND-practice@example.invalid ', phone)
    await pool.query("UPDATE affiliate_attributions SET effective_at='2026-02-02' WHERE customer_id=$1", [customerId])
    await processAffiliateHistory(await payment())
    const [a, b] = await Promise.all([affiliateReport(partnerA), affiliateReport(partnerB)])
    expect(a.practices).toHaveLength(0)
    expect(a.entries).toHaveLength(0)
    expect(a.payments).toHaveLength(0)
    expect(JSON.stringify(a)).not.toContain('Second Practice')
    expect(b.practices.map(p => p.business_name)).toEqual(['Second Practice'])
    expect(b.earned_cents).toBe(1000)
    const leads = (await pool.query('SELECT id,affiliate_id,converted_customer_id FROM affiliate_leads')).rows
    expect(leads.find(l => l.id === first.leadId)).toMatchObject({ affiliate_id: partnerA, converted_customer_id: null })
    expect(leads.find(l => l.id === second.leadId)).toMatchObject({ affiliate_id: partnerB, converted_customer_id: customerId })
  })
  it('attaches a qualified exact-email submission AFTER link creation at the paid conversion, not to earlier history', async () => {
    await pool.query('DELETE FROM affiliate_attributions')
    await pool.query("UPDATE affiliates SET created_at='2026-01-01'")
    await pool.query("UPDATE payment_link_terms SET created_at='2026-01-02' WHERE link_id=$1", [linkId])
    const lead = await resolveQualifiedReferral({ email: 'practice@example.invalid', phone: '2025550198', practiceName: 'Fixture Practice', affiliateId: partnerA }, new Date('2026-02-01'))
    // No attachCustomerReferral here: the payment link already existed when the form was submitted.
    expect((await pool.query('SELECT id FROM affiliate_attributions')).rows).toHaveLength(0)
    await processAffiliateHistory(await payment())
    const report = await affiliateReport(partnerA)
    expect(report.earned_cents).toBe(1000)
    expect(report.practices.map(p => p.business_name)).toEqual(['Fixture Practice'])
    expect(report.payments).toHaveLength(1)
    const attribution = (await pool.query('SELECT * FROM affiliate_attributions WHERE customer_id=$1', [customerId])).rows[0]
    expect(attribution.lead_id).toBe(lead.leadId)
    expect(new Date(attribution.effective_at).getTime()).toBe(at.getTime())
    // Out-of-order older delivery cannot create another attribution or award earlier commission.
    await processAffiliateHistory(await payment({ occurredAt: new Date('2026-01-15') }))
    expect((await affiliateReport(partnerA)).earned_cents).toBe(1000)
  })
  it('attaches a waived-setup conversion after link creation, but respects explicit admin removal', async () => {
    await pool.query('DELETE FROM affiliate_attributions')
    await pool.query("UPDATE affiliates SET created_at='2026-01-01'")
    await resolveQualifiedReferral({ email: 'practice@example.invalid', phone: '', practiceName: 'Fixture Practice', affiliateId: partnerA }, new Date('2026-02-01'))
    await recordAffiliateConversion(customerId, new Date('2026-02-02'))
    expect((await pool.query('SELECT affiliate_id,converted_at FROM affiliate_attributions WHERE customer_id=$1', [customerId])).rows[0].affiliate_id).toBe(partnerA)
    expect((await affiliateReport(partnerA)).earned_cents).toBe(0)
    await actions.assignAffiliate({ affiliateId: null, customerId, reason: 'Explicit admin removal must remain effective' })
    await processAffiliateHistory(await payment({ occurredAt: new Date(Date.now() + 1000) }))
    expect((await affiliateReport(partnerA)).earned_cents).toBe(0)
  })
  it('does not automatically assign an already-converted customer when its first qualified referral arrives later', async () => {
    await pool.query('DELETE FROM affiliate_attributions')
    await pool.query("UPDATE affiliates SET created_at='2026-01-01'")
    await payment({ occurredAt: new Date('2026-01-15') }) // Actual prior conversion, not an estimated or uncollected payment.
    await resolveQualifiedReferral({ email: 'practice@example.invalid', phone: '', practiceName: 'Fixture Practice', affiliateId: partnerA }, new Date('2026-02-01'))
    await attachCustomerReferral(customerId, 'practice@example.invalid', '')
    await processAffiliateHistory(await payment())
    expect((await pool.query('SELECT id FROM affiliate_attributions WHERE customer_id=$1', [customerId])).rows).toHaveLength(0)
    expect((await affiliateReport(partnerA)).earned_cents).toBe(0)
  })
  it('leaves a phone-only enrollment unattributed and cannot lock or disclose the other practice', async () => {
    await pool.query('DELETE FROM affiliate_attributions')
    const phone = '2025550198'
    const lead = await resolveQualifiedReferral({ email: 'first-practice@example.invalid', phone, practiceName: 'First Practice', affiliateId: partnerA }, new Date('2026-02-01'))
    await pool.query("UPDATE customers SET email='unmatched-practice@example.invalid',phone=$2,business_name='Unmatched Practice' WHERE id=$1", [customerId, phone])
    await attachCustomerReferral(customerId, 'unmatched-practice@example.invalid', phone)
    await recordAffiliateConversion(customerId, new Date('2026-02-02'))
    await processAffiliateHistory(await payment())
    expect((await pool.query('SELECT id FROM affiliate_attributions WHERE customer_id=$1', [customerId])).rows).toHaveLength(0)
    expect((await pool.query('SELECT converted_at FROM affiliate_leads WHERE id=$1', [lead.leadId])).rows[0].converted_at).toBeNull()
    const report = await affiliateReport(partnerA)
    expect(report.entries).toHaveLength(0)
    expect(report.payments).toHaveLength(0)
    expect(report.practices).toHaveLength(0)
    expect(JSON.stringify(report)).not.toContain('Unmatched Practice')
  })
  it('requires single-use inbox proof; typed email, replay, expired links and revoked sessions do not authorize', async () => {
    const p = (await pool.query('SELECT * FROM affiliates WHERE id=$1', [partnerA])).rows[0]
    await sendAccess(p)
    const data = vi.mocked(sendEmail).mock.calls.at(-1)![2] as { loginUrl: string }
    const token = new URLSearchParams(new URL(data.loginUrl).hash.slice(1)).get('token')!
    expect(await context(() => verifyAccess('wrong@example.invalid', token))).toBe(false)
    const response = res()
    expect(await context(() => verifyAccess(email, token), req(), response)).toBe(true)
    const sessionCookie = vi.mocked(response.cookie).mock.calls[0]![1]
    expect(await affiliateSession(req({ pp_affiliate: sessionCookie }))).toBeTruthy()
    expect(await context(() => verifyAccess(email, token))).toBe(false)
    await revokeAccess(partnerA, 'fixture', 'Revoke fixture')
    expect(await affiliateSession(req({ pp_affiliate: sessionCookie }))).toBeNull()
    expect(await context(() => actions.requestAffiliateAccess({ email: 'unknown@example.invalid' }))).toEqual({ ok: true })
  })
  it('projects only permitted fields and isolates affiliate scopes and audits admin corrections', async () => {
    await processAffiliateHistory(await payment())
    const report = await affiliateReport(partnerA)
    expect(JSON.stringify(report)).not.toMatch(/practice@example|card_last4|owner_name|full_name|phone|agreement/)
    expect((await affiliateReport(partnerB)).practices).toHaveLength(0)
    expect((await affiliateReport(partnerB)).entries).toHaveLength(0)
    await expect(actions.assignAffiliate({ affiliateId: partnerB, customerId, reason: '' })).rejects.toThrow()
    await actions.assignAffiliate({ affiliateId: partnerB, customerId, reason: 'Correct erroneous referral' })
    expect((await affiliateReport(partnerA)).earned_cents).toBe(1000)
    expect((await pool.query("SELECT * FROM affiliate_activity WHERE action='customer_attribution_corrected'")).rows[0].reason).toBe('Correct erroneous referral')
  })
  it('retains financial/admin audit but limits IP/location and telemetry; ignores untrusted geography/forwarded hops', async () => {
    await pool.query(`INSERT INTO affiliate_activity(id,affiliate_id,action,actor,telemetry,ip,country,region,occurred_at) VALUES
      ($1,$4,'old_admin','fixture',false,'203.0.113.1','US','NY',now()-interval '40 days'),
      ($2,$4,'old_visit','affiliate',true,'203.0.113.1','US','NY',now()-interval '100 days'),
      ($3,$4,'recent_visit','affiliate',true,'203.0.113.1','US','NY',now())`, [randomUUID(), randomUUID(), randomUUID(), partnerA])
    await cleanupAffiliateTelemetry()
    const rows = (await pool.query('SELECT action,ip FROM affiliate_activity ORDER BY action')).rows
    expect(rows).toHaveLength(2)
    expect(rows.find(r => r.action === 'old_admin').ip).toBeNull()
    const request = req()
    request.header = ((key: string) => key === 'x-forwarded-for' ? '1.2.3.4,203.0.113.12' : key === 'x-country' ? 'US' : undefined) as never
    expect(trustedAffiliateIp(request)).toBe('203.0.113.12')
  })
})
