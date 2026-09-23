/**
 * Agreement lifecycle guarantees against the real Supabase Postgres schema:
 * one agreement per link, edit vs sign linearized, and the payment gate.
 * Skipped when SUPABASE_DB_URL is not available (e.g. a bare CI runner).
 */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const supabaseUpdate = vi.fn(async () => ({ error: null }))
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: () => ({
      update: () => ({ eq: supabaseUpdate }),
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
    }),
  }),
}))
const sendAgreementSignedEmail = vi.fn(async (..._args: unknown[]) => ({ ok: true }))
vi.mock('@/lib/mail', () => ({
  sendAgreementSignedEmail: (...args: unknown[]) => sendAgreementSignedEmail(...args),
  sendAgreementSentEmail: vi.fn(async () => ({ ok: true })),
}))
vi.mock('@/lib/data/admin-users', () => ({ listAdminUsers: async () => [] }))
vi.mock('@vercel/blob', () => ({ put: vi.fn(), get: vi.fn() }))

const hasDb = Boolean(process.env.SUPABASE_DB_URL)
const d = describe.skipIf(!hasDb)

d('agreement lifecycle', () => {
  let db: typeof import('@workspace/db').db
  let schema: typeof import('@workspace/db')
  let store: typeof import('../store')
  let actions: typeof import('@/actions/agreements')
  const customerId = `test-cust-${randomUUID()}`
  const linkId = `test-link-${randomUUID()}`
  const customer = {
    id: customerId,
    fullName: 'Race Tester',
    businessName: 'Race Dental',
    email: `race-${randomUUID()}@example.test`,
  }

  beforeAll(async () => {
    schema = await import('@workspace/db')
    db = schema.db
    store = await import('../store')
    actions = await import('@/actions/agreements')
    await db.insert(schema.customersTable).values(customer as never)
    await db.insert(schema.paymentLinkTermsTable).values({
      linkId,
      token: `tok-${randomUUID()}`,
      customerId,
      type: 'subscription',
      setupFeeCents: 47500,
      monthlyCents: 47500,
      termMonths: 12,
    } as never)
  })

  afterAll(async () => {
    const { eq } = await import('drizzle-orm')
    const rows = await db.select({ id: schema.agreementsTable.id }).from(schema.agreementsTable).where(eq(schema.agreementsTable.linkId, linkId))
    for (const r of rows) {
      await db.delete(schema.agreementEventsTable).where(eq(schema.agreementEventsTable.agreementId, r.id))
      await db.delete(schema.agreementInitialsTable).where(eq(schema.agreementInitialsTable.agreementId, r.id))
      await db.delete(schema.agreementVersionsTable).where(eq(schema.agreementVersionsTable.agreementId, r.id))
    }
    await db.delete(schema.agreementsTable).where(eq(schema.agreementsTable.linkId, linkId))
    await db.delete(schema.paymentLinkTermsTable).where(eq(schema.paymentLinkTermsTable.linkId, linkId))
    await db.delete(schema.customersTable).where(eq(schema.customersTable.id, customerId))
  })

  const terms = { termMonths: 12, monthlyCents: 47500, setupFeeCents: 47500 }
  const sender = { id: null, name: 'Test Rep' }

  it('creates exactly one agreement per link under concurrent creation', async () => {
    const [a, b] = await Promise.all([
      store.createAgreement({ customer: customer as never, linkId, terms, sender, status: 'sent' }),
      store.createAgreement({ customer: customer as never, linkId, terms, sender, status: 'sent' }),
    ])
    expect(a.agreement.id).toBe(b.agreement.id)
    const { eq } = await import('drizzle-orm')
    const rows = await db.select().from(schema.agreementsTable).where(eq(schema.agreementsTable.linkId, linkId))
    expect(rows).toHaveLength(1)
  })

  it('blocks payment until the current version is signed, then allows it', async () => {
    const loaded = (await store.loadAgreementByLink(linkId))!
    expect(await store.agreementAllowsPayment(linkId)).toMatchObject({ ok: false })

    // Initial every section, then sign the current version
    const doc = store.renderCurrent(loaded)
    for (const s of doc.sections.filter((x) => x.requiresInitials)) {
      const r = await actions.recordAgreementInitials(loaded.agreement.token, { version: 1, sectionId: s.id, initials: 'RT' })
      expect(r.ok).toBe(true)
    }
    const stale = await actions.signAgreement(loaded.agreement.token, {
      version: 99,
      consent: true,
      signerName: 'Race Tester',
      signerTitle: 'Owner',
      signatureType: 'typed',
      signatureData: 'Race Tester',
    })
    expect(stale).toMatchObject({ ok: false, stale: true })

    const signed = await actions.signAgreement(loaded.agreement.token, {
      version: 1,
      consent: true,
      signerName: 'Race Tester',
      signerTitle: 'Owner',
      signatureType: 'typed',
      signatureData: 'Race Tester',
    })
    expect(signed.ok).toBe(true)
    expect(await store.agreementAllowsPayment(linkId)).toEqual({ ok: true })
    // Signing does not send the signed copy; that goes out on completion (with the PDF)
    expect(sendAgreementSignedEmail).not.toHaveBeenCalled()
  })

  it('rejects an admin edit that races a signature (no version bump after signing)', async () => {
    const fresh = (await store.loadAgreementByLink(linkId))!
    // Simulate the admin having loaded the agreement before the customer signed
    const asSeenBeforeSign = { ...fresh, agreement: { ...fresh.agreement, signedAt: null, status: 'viewed' as const } }
    await expect(store.addVersion(asSeenBeforeSign, { ...terms, monthlyCents: 35000 }, sender)).rejects.toBeInstanceOf(
      store.AgreementConflictError,
    )
    const after = (await store.loadAgreementByLink(linkId))!
    expect(after.agreement.currentVersion).toBe(1)
    expect(after.agreement.signedVersion).toBe(1)
    expect(await store.agreementAllowsPayment(linkId)).toEqual({ ok: true })
  })

  it('rejects a stale-version edit on an unsigned agreement', async () => {
    const fresh = (await store.loadAgreementByLink(linkId))!
    const { eq } = await import('drizzle-orm')
    // Reset to unsigned for this scenario
    await db
      .update(schema.agreementsTable)
      .set({ signedAt: null, signedVersion: null, status: 'viewed' })
      .where(eq(schema.agreementsTable.id, fresh.agreement.id))
    const unsigned = (await store.loadAgreementByLink(linkId))!
    const v2 = await store.addVersion(unsigned, { ...terms, monthlyCents: 35000 }, sender)
    expect(v2.agreement.currentVersion).toBe(2)
    // A second editor still holding v1 must not overwrite v2
    await expect(store.addVersion(unsigned, { ...terms, monthlyCents: 30000 }, sender)).rejects.toBeInstanceOf(store.AgreementConflictError)
    const after = (await store.loadAgreementByLink(linkId))!
    expect(after.agreement.currentVersion).toBe(2)
    expect(after.agreement.monthlyCents).toBe(35000)
  })

  it('payment failure after signing keeps the signature and marks payment pending', async () => {
    const fresh = (await store.loadAgreementByLink(linkId))!
    // The amount change invalidated the initials on the fees section; re-initial what is missing
    const doc = store.renderCurrent(fresh)
    const valid = await store.validInitials(fresh, doc)
    const missing = doc.sections.filter((s) => s.requiresInitials && !valid[s.id])
    expect(missing.length).toBeGreaterThan(0)
    for (const s of missing) {
      expect((await actions.recordAgreementInitials(fresh.agreement.token, { version: 2, sectionId: s.id, initials: 'RT' })).ok).toBe(true)
    }
    const signed = await actions.signAgreement(fresh.agreement.token, {
      version: 2,
      consent: true,
      signerName: 'Race Tester',
      signerTitle: 'Owner',
      signatureType: 'typed',
      signatureData: 'Race Tester',
    })
    expect(signed.ok).toBe(true)
    await store.onPaymentFailed(linkId, 'Your card was declined.')
    const after = (await store.loadAgreementByLink(linkId))!
    expect(after.agreement.status).toBe('payment_pending')
    expect(after.agreement.signedAt).not.toBeNull()
    expect(await store.agreementAllowsPayment(linkId)).toEqual({ ok: true })
    expect(sendAgreementSignedEmail).not.toHaveBeenCalled()
  })
})
