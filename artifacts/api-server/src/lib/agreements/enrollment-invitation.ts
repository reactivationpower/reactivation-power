import { and, eq, isNull, isNotNull, lt, or, sql } from 'drizzle-orm'
import { db, customersTable, paymentLinkTermsTable, enrollmentInvitationsTable } from '@workspace/db'
import { sendAgreementSentEmail } from '@/lib/mail'
import { logger } from '@/lib/logger'
import { agreementUrl, createAgreement, loadAgreementByLink, isSigned, isExpired } from './store'
import { AGREEMENT_DEFAULTS, COMPANY, agreementTitle } from './defaults'
import { DEFAULT_ONE_TIME_AGREEMENT_BODY, CALENDAR_AGREEMENT_BODY } from './template'
import type { Customer, PaymentLinkTerms } from '@workspace/db'
import type { TemplateDataMap } from '@/lib/mail'

export type InvitationOutcome = {
  status: 'pending' | 'sending' | 'provider_accepted' | 'failed'
  error?: string
}

/** Customer creation stays successful even if agreement creation or mail is unavailable. */
export async function inviteEnrollment(input: {
  customer: Customer
  terms: PaymentLinkTerms
  amountCents: number
  sender: { id: string; name: string }
}): Promise<InvitationOutcome> {
  const { customer, terms, sender } = input
  try {
    let loaded = await loadAgreementByLink(terms.linkId)
    if (!loaded) {
      const oneTime = terms.type === 'one_time'
      loaded = await createAgreement({
        customer, linkId: terms.linkId, sender, status: 'sent',
        terms: {
          termMonths: oneTime ? 0 : AGREEMENT_DEFAULTS.termMonths,
          monthlyCents: oneTime ? 0 : terms.monthlyCents,
          setupFeeCents: oneTime ? input.amountCents : terms.setupFeeCents,
          noticeDays: AGREEMENT_DEFAULTS.noticeDays,
          body: oneTime ? DEFAULT_ONE_TIME_AGREEMENT_BODY : CALENDAR_AGREEMENT_BODY,
        },
      })
    }
    if (isSigned(loaded.agreement)) {
      const [existing] = await db.select().from(enrollmentInvitationsTable).where(eq(enrollmentInvitationsTable.linkId, terms.linkId))
      return existing?.status === 'provider_accepted'
        ? { status: 'provider_accepted' }
        : { status: 'failed', error: 'Agreement already signed; no invitation sent.' }
    }
    const a = loaded.agreement
    // Snapshot once: retries MUST use identical content for provider idempotency,
    // even if staff subsequently edit terms. Explicit resends use current content.
    const snapshot = {
      linkId: terms.linkId, agreementId: a.id, recipient: a.signerDeliveryEmail ?? customer.email,
      payload: {
        name: customer.fullName,
        agreementTitle: terms.type === 'one_time' ? `${COMPANY.name} Full-Payment Service Agreement` : agreementTitle(a.termMonths),
        termMonths: a.termMonths, monthlyCents: a.monthlyCents, setupFeeCents: a.setupFeeCents,
        signUrl: agreementUrl(a.token), expiresAt: a.expiresAt?.toISOString() ?? null, resend: false,
      },
    }
    await db.insert(enrollmentInvitationsTable).values(snapshot).onConflictDoUpdate({
      target: enrollmentInvitationsTable.linkId,
      set: { agreementId: snapshot.agreementId, recipient: snapshot.recipient, payload: snapshot.payload },
      setWhere: isNull(enrollmentInvitationsTable.agreementId),
    })
    return await deliverEnrollmentInvitation(terms.linkId)
  } catch {
    logger.error({ linkId: terms.linkId }, 'Enrollment invitation unavailable; saved customer and offer are unaffected')
    return { status: 'failed', error: 'Customer and offer saved. Retry the enrollment email on this record.' }
  }
}

export async function deliverEnrollmentInvitation(linkId: string): Promise<InvitationOutcome> {
  const now = new Date()
  const [previous] = await db.select().from(enrollmentInvitationsTable).where(eq(enrollmentInvitationsTable.linkId, linkId))
  if (previous?.status === 'provider_accepted') return { status: 'provider_accepted' }
  if (previous?.status === 'superseded') return { status: 'failed', error: 'Initial email replaced by an explicit send. Review email history and use Resend Email if needed.' }
  const loaded = await loadAgreementByLink(linkId)
  if (!loaded || isSigned(loaded.agreement) || isExpired(loaded.agreement) || loaded.agreement.currentVersion !== 1)
    return { status: 'failed', error: 'Agreement changed, signed, or expired. Review the saved agreement; use explicit Resend Email if needed.' }
  const [claimed] = await db.update(enrollmentInvitationsTable).set({
    status: 'sending', attempts: sql`${enrollmentInvitationsTable.attempts} + 1`,
    firstAttemptAt: sql`coalesce(${enrollmentInvitationsTable.firstAttemptAt}, ${now})`, updatedAt: now,
  }).where(and(eq(enrollmentInvitationsTable.linkId, linkId),
    isNotNull(enrollmentInvitationsTable.agreementId), isNotNull(enrollmentInvitationsTable.payload),
    or(eq(enrollmentInvitationsTable.status, 'pending'), eq(enrollmentInvitationsTable.status, 'failed'),
      and(eq(enrollmentInvitationsTable.status, 'sending'), lt(enrollmentInvitationsTable.updatedAt, new Date(now.getTime() - 120_000)))),
    // Resend retains keys for 24 hours. Never replay an ambiguous attempt beyond it.
    or(sql`${enrollmentInvitationsTable.firstAttemptAt} is null`,
      sql`${enrollmentInvitationsTable.firstAttemptAt} > ${new Date(now.getTime() - 23 * 3600_000)}`),
  )).returning()
  if (!claimed) {
    const [existing] = await db.select().from(enrollmentInvitationsTable).where(eq(enrollmentInvitationsTable.linkId, linkId))
    if (existing?.status === 'provider_accepted') return { status: 'provider_accepted' }
    if (existing?.firstAttemptAt && existing.firstAttemptAt.getTime() <= now.getTime() - 23 * 3600_000)
      return { status: 'failed', error: 'Safe retry window expired. Review email history, then use explicit Resend Email if needed.' }
    return { status: existing?.status === 'superseded' ? 'failed' : existing?.status ?? 'pending' }
  }
  const result = await sendAgreementSentEmail(claimed.recipient, claimed.payload as unknown as TemplateDataMap['agreement_sent'], {
    idempotencyKey: `enrollment-initial-${claimed.agreementId}`,
    metadata: { agreementId: claimed.agreementId, resend: false, initialInvitation: true },
  })
  const status = result.ok ? 'provider_accepted' : result.uncertain ? 'sending' : 'failed'
  try {
    await db.update(enrollmentInvitationsTable).set({ status, emailLogId: result.logId, updatedAt: new Date() })
      .where(and(eq(enrollmentInvitationsTable.linkId, linkId), eq(enrollmentInvitationsTable.status, 'sending'),
        eq(enrollmentInvitationsTable.attempts, claimed.attempts)))
  } catch {
    // Don't turn a known acceptance into a reported provider failure.
    // The lease and stable key still protect recovery of this unresolved row.
    logger.error({ linkId }, 'Could not persist enrollment email outcome')
  }
  return { status, ...(!result.ok ? { error: result.uncertain
    ? 'Send outcome is not confirmed. Check again on this saved record; retries reuse the same invitation.'
    : 'Email provider did not accept the invitation. Retry on this saved record.' } : {}) }
}

/** Deliberate staff sends replace a queued initial retry, never share its key. */
export async function supersedeInitialInvitation(linkId: string): Promise<void> {
  await db.update(enrollmentInvitationsTable).set({ status: 'superseded', updatedAt: new Date() })
    .where(and(eq(enrollmentInvitationsTable.linkId, linkId),
      or(eq(enrollmentInvitationsTable.status, 'pending'), eq(enrollmentInvitationsTable.status, 'failed'), eq(enrollmentInvitationsTable.status, 'sending'))))
}

/** Only newly queued invitations, never historical customers. No billing calls. */
export async function retryPendingEnrollmentInvitations(): Promise<void> {
  try {
    const due = await db.select({ linkId: enrollmentInvitationsTable.linkId }).from(enrollmentInvitationsTable)
      .where(and(
        or(eq(enrollmentInvitationsTable.status, 'pending'), eq(enrollmentInvitationsTable.status, 'failed'), eq(enrollmentInvitationsTable.status, 'sending')),
        lt(enrollmentInvitationsTable.attempts, 5),
        lt(enrollmentInvitationsTable.updatedAt, new Date(Date.now() - 5 * 60_000)),
        or(sql`${enrollmentInvitationsTable.firstAttemptAt} is null`,
          sql`${enrollmentInvitationsTable.firstAttemptAt} > ${new Date(Date.now() - 23 * 3600_000)}`),
      )).limit(20)
    for (const row of due) {
      const [terms] = await db.select().from(paymentLinkTermsTable).where(eq(paymentLinkTermsTable.linkId, row.linkId)).limit(1)
      if (!terms?.enrollmentFlow) continue
      const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, terms.customerId)).limit(1)
      const links = await db.execute(sql`SELECT amount_cents FROM payment_links WHERE id = ${row.linkId}::uuid`)
      if (!customer || !links.rows[0]) continue
      await inviteEnrollment({
        customer, terms, amountCents: Number(links.rows[0].amount_cents),
        sender: { id: terms.repId ?? 'system', name: terms.repName ?? 'System' },
      })
    }
  } catch {
    logger.error('Enrollment email retry unavailable; saved customers and offers are unaffected')
  }
}
