import { randomBytes, randomUUID } from 'node:crypto'
import { get, put } from '@vercel/blob'
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm'
import {
  agreementEventsTable,
  agreementInitialsTable,
  agreementVersionsTable,
  agreementsTable,
  customerCardsTable,
  customersTable,
  db,
  paymentLinkTermsTable,
  type Agreement,
  type AgreementEvent,
  type AgreementEventType,
  type AgreementVersion,
  type Customer,
  type PaymentLinkTerms,
  type SignedSnapshot,
} from '@workspace/db'

import { appOrigin } from '@/lib/app-origin'
import { logger } from '@/lib/logger'
import { sendAgreementSignedEmail } from '@/lib/mail'
import { listAdminUsers } from '@/lib/data/admin-users'
import { tryGetRequestContext } from '@/lib/request-context'
import { getAdminClient } from '@/lib/supabase/admin'

import { buildCertificate, type Certificate } from './certificate'
import { AGREEMENT_DEFAULTS } from './defaults'
import { renderAgreementPdf } from './pdf'
import {
  DEFAULT_AGREEMENT_BODY,
  formatMoney,
  renderDocument,
  versionHash,
  type RenderedDocument,
} from './template'

/**
 * Agreement persistence + lifecycle shared by the admin/public actions and by
 * the subscription checkout (which reports payment milestones back here).
 */

export const AGREEMENT_PUBLIC_PATH = '/agreements'
export const agreementUrl = (token: string) => `${appOrigin()}${AGREEMENT_PUBLIC_PATH}/${token}`
export const agreementPdfUrl = (token: string) => `${appOrigin()}/api${AGREEMENT_PUBLIC_PATH}/${token}/pdf`

export const newId = () => randomUUID().replace(/-/g, '')
export const newToken = () => randomBytes(32).toString('base64url')

/** IP + browser of the current HTTP request, when running inside one. */
export function requestFingerprint(): { ip: string | null; userAgent: string | null } {
  const ctx = tryGetRequestContext()
  if (!ctx) return { ip: null, userAgent: null }
  const ip = ctx.req.ip || ctx.req.socket?.remoteAddress || null
  const ua = ctx.req.headers['user-agent']
  return { ip, userAgent: typeof ua === 'string' ? ua.slice(0, 500) : null }
}

export async function logAgreementEvent(
  agreementId: string,
  type: AgreementEventType,
  opts: {
    version?: number | null
    actor?: 'customer' | 'admin' | 'system'
    actorName?: string | null
    detail?: Record<string, unknown>
    fingerprint?: { ip: string | null; userAgent: string | null }
  } = {},
): Promise<AgreementEvent> {
  const fp = opts.fingerprint ?? requestFingerprint()
  const [row] = await db
    .insert(agreementEventsTable)
    .values({
      id: newId(),
      agreementId,
      type,
      version: opts.version ?? null,
      actor: opts.actor ?? 'customer',
      actorName: opts.actorName ?? null,
      ip: fp.ip,
      userAgent: fp.userAgent,
      detail: opts.detail ?? null,
    })
    .returning()
  await db
    .update(agreementsTable)
    .set({ lastActivityAt: row.createdAt, updatedAt: new Date() })
    .where(eq(agreementsTable.id, agreementId))
  return row
}

// ── Loading ────────────────────────────────────────────────────────

export interface LoadedAgreement {
  agreement: Agreement
  customer: Customer
  terms: PaymentLinkTerms | null
  version: AgreementVersion
}

async function hydrate(agreement: Agreement | undefined): Promise<LoadedAgreement | null> {
  if (!agreement) return null
  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, agreement.customerId)).limit(1)
  if (!customer) return null
  const [terms] = await db.select().from(paymentLinkTermsTable).where(eq(paymentLinkTermsTable.linkId, agreement.linkId)).limit(1)
  const [version] = await db
    .select()
    .from(agreementVersionsTable)
    .where(and(eq(agreementVersionsTable.agreementId, agreement.id), eq(agreementVersionsTable.version, agreement.currentVersion)))
    .limit(1)
  if (!version) return null
  return { agreement, customer, terms: terms ?? null, version }
}

export async function loadAgreementById(id: string): Promise<LoadedAgreement | null> {
  const [row] = await db.select().from(agreementsTable).where(eq(agreementsTable.id, id)).limit(1)
  return hydrate(row)
}

export async function loadAgreementByToken(token: string): Promise<LoadedAgreement | null> {
  if (!token || token.length < 16) return null
  const [row] = await db.select().from(agreementsTable).where(eq(agreementsTable.token, token)).limit(1)
  return hydrate(row)
}

export async function loadAgreementByLink(linkId: string): Promise<LoadedAgreement | null> {
  const [row] = await db
    .select()
    .from(agreementsTable)
    .where(eq(agreementsTable.linkId, linkId))
    .orderBy(desc(agreementsTable.createdAt))
    .limit(1)
  return hydrate(row)
}

export async function listVersions(agreementId: string): Promise<AgreementVersion[]> {
  return db
    .select()
    .from(agreementVersionsTable)
    .where(eq(agreementVersionsTable.agreementId, agreementId))
    .orderBy(desc(agreementVersionsTable.version))
}

export async function listEvents(agreementId: string): Promise<AgreementEvent[]> {
  return db
    .select()
    .from(agreementEventsTable)
    .where(eq(agreementEventsTable.agreementId, agreementId))
    .orderBy(asc(agreementEventsTable.createdAt))
}

// ── Rendering ──────────────────────────────────────────────────────

/** The document as the customer sees it right now (or, once signed, exactly as signed). */
export function renderCurrent(loaded: LoadedAgreement, asOf = new Date()): RenderedDocument {
  const { agreement, customer, version } = loaded
  return renderDocument(version.body, {
    customer,
    termMonths: version.termMonths,
    monthlyCents: version.monthlyCents,
    setupFeeCents: version.setupFeeCents,
    noticeDays: version.noticeDays,
    setupPaidAt: agreement.setupPaidAt,
    asOf,
  })
}

/** Initials that are still valid: their section hash matches the current text. */
export async function validInitials(loaded: LoadedAgreement, doc: RenderedDocument): Promise<Record<string, string>> {
  const rows = await db
    .select()
    .from(agreementInitialsTable)
    .where(eq(agreementInitialsTable.agreementId, loaded.agreement.id))
  const byId = new Map(doc.sections.map((s) => [s.id, s.hash]))
  const out: Record<string, string> = {}
  for (const r of rows) if (byId.get(r.sectionId) === r.sectionHash) out[r.sectionId] = r.initials
  return out
}

export function snapshotFrom(doc: RenderedDocument, initials: Record<string, string>): SignedSnapshot {
  return {
    title: doc.title,
    fields: doc.fields,
    sections: doc.sections.map((s) => ({
      id: s.id,
      title: s.title,
      paragraphs: s.paragraphs,
      requiresInitials: s.requiresInitials,
      hash: s.hash,
      initials: initials[s.id] ?? null,
    })),
  }
}

export const isSigned = (a: Agreement) => a.signedAt != null
export const isExpired = (a: Agreement) =>
  !isSigned(a) && a.expiresAt != null && a.expiresAt.getTime() < Date.now()

/** Display status, folding in expiry and "signed but payment not finished". */
export function effectiveStatus(a: Agreement): Agreement['status'] {
  if (a.status === 'completed') return 'completed'
  if (isSigned(a)) return a.status === 'payment_pending' ? 'payment_pending' : 'signed'
  if (isExpired(a)) return 'expired'
  return a.status
}

// ── Creation & versions ────────────────────────────────────────────

export interface AgreementTermsInput {
  termMonths: number
  monthlyCents: number
  setupFeeCents: number
  noticeDays?: number
  body?: string
}

export function validateTerms(t: AgreementTermsInput): string | null {
  if (!Number.isInteger(t.termMonths) || t.termMonths < 1 || t.termMonths > 60) return 'Term must be between 1 and 60 months.'
  if (!Number.isFinite(t.monthlyCents) || t.monthlyCents < 50) return 'Monthly amount must be at least $0.50.'
  if (!Number.isFinite(t.setupFeeCents) || t.setupFeeCents < 0) return 'Setup fee cannot be negative.'
  if (t.setupFeeCents > 0 && t.setupFeeCents < 50) return 'Setup fee must be $0 (waived) or at least $0.50.'
  if (t.monthlyCents > 99999999 || t.setupFeeCents > 99999999) return 'Amount is too large.'
  const notice = t.noticeDays ?? AGREEMENT_DEFAULTS.noticeDays
  if (!Number.isInteger(notice) || notice < 0 || notice > 365) return 'Notice period must be between 0 and 365 days.'
  return null
}

/** Keep the payment link's terms equal to the agreement so checkout, Stripe and reports read the same numbers. */
export async function syncTermsFromAgreement(a: Pick<Agreement, 'linkId' | 'termMonths' | 'monthlyCents' | 'setupFeeCents'>) {
  await db
    .update(paymentLinkTermsTable)
    .set({ termMonths: a.termMonths, monthlyCents: a.monthlyCents, setupFeeCents: a.setupFeeCents })
    .where(eq(paymentLinkTermsTable.linkId, a.linkId))
  // Supabase's amount_cents must stay > 0 and is what the legacy list shows
  await getAdminClient()
    .from('payment_links')
    .update({ amount_cents: a.setupFeeCents > 0 ? a.setupFeeCents : a.monthlyCents })
    .eq('id', a.linkId)
}

export async function createAgreement(input: {
  customer: Customer
  linkId: string
  terms: AgreementTermsInput
  sender: { id: string | null; name: string | null }
  /** 'sent' when created from the send form; 'draft' when auto-created for a legacy link. */
  status: 'draft' | 'sent'
}): Promise<LoadedAgreement> {
  const body = (input.terms.body ?? DEFAULT_AGREEMENT_BODY).replace(/\r\n?/g, '\n').trim()
  const noticeDays = input.terms.noticeDays ?? AGREEMENT_DEFAULTS.noticeDays
  const hash = versionHash({ ...input.terms, noticeDays, body })
  const id = newId()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + AGREEMENT_DEFAULTS.linkValidDays * 86400000)
  const [agreement] = await db
    .insert(agreementsTable)
    .values({
      id,
      token: newToken(),
      customerId: input.customer.id,
      linkId: input.linkId,
      status: input.status,
      termMonths: input.terms.termMonths,
      monthlyCents: input.terms.monthlyCents,
      setupFeeCents: input.terms.setupFeeCents,
      noticeDays,
      currentVersion: 1,
      currentHash: hash,
      sentById: input.sender.id,
      sentByName: input.sender.name,
      sentAt: input.status === 'sent' ? now : null,
      lastSentAt: input.status === 'sent' ? now : null,
      expiresAt,
    })
    // agreements.link_id is unique: a concurrent create for the same link
    // (legacy-link view racing an admin send) yields to the existing row.
    .onConflictDoNothing({ target: agreementsTable.linkId })
    .returning()
  if (!agreement) {
    const existing = await loadAgreementByLink(input.linkId)
    if (!existing) throw new Error('Agreement insert conflicted but no agreement exists for the link')
    return existing
  }
  await db.insert(agreementVersionsTable).values({
    id: newId(),
    agreementId: id,
    version: 1,
    termMonths: input.terms.termMonths,
    monthlyCents: input.terms.monthlyCents,
    setupFeeCents: input.terms.setupFeeCents,
    noticeDays,
    body,
    hash,
    changedById: input.sender.id,
    changedByName: input.sender.name,
    changeSummary: 'Initial version',
  })
  await syncTermsFromAgreement(agreement)
  await logAgreementEvent(id, 'created', { version: 1, actor: 'admin', actorName: input.sender.name })
  const loaded = await loadAgreementById(id)
  if (!loaded) throw new Error('Agreement vanished after insert')
  return loaded
}

export function describeChange(prev: AgreementVersion, next: AgreementTermsInput & { body: string; noticeDays: number }): string {
  const parts: string[] = []
  if (prev.termMonths !== next.termMonths) parts.push(`term ${prev.termMonths} → ${next.termMonths} months`)
  if (prev.monthlyCents !== next.monthlyCents) parts.push(`monthly ${formatMoney(prev.monthlyCents)} → ${formatMoney(next.monthlyCents)}`)
  if (prev.setupFeeCents !== next.setupFeeCents) parts.push(`setup fee ${formatMoney(prev.setupFeeCents)} → ${formatMoney(next.setupFeeCents)}`)
  if (prev.noticeDays !== next.noticeDays) parts.push(`notice ${prev.noticeDays} → ${next.noticeDays} days`)
  if (prev.body.trim() !== next.body.trim()) parts.push('agreement text edited')
  return parts.length ? parts.join(', ') : 'no changes'
}

/** Write a new version. Callers must have checked the agreement is not signed. */
/** Thrown when an edit races a signature or another edit; callers surface it as a friendly error. */
export class AgreementConflictError extends Error {
  constructor(message = 'The agreement changed while you were editing it. Reload and try again.') {
    super(message)
    this.name = 'AgreementConflictError'
  }
}

export async function addVersion(
  loaded: LoadedAgreement,
  terms: AgreementTermsInput,
  editor: { id: string | null; name: string | null },
): Promise<LoadedAgreement> {
  const body = (terms.body ?? loaded.version.body).replace(/\r\n?/g, '\n').trim()
  const noticeDays = terms.noticeDays ?? loaded.version.noticeDays
  const hash = versionHash({ ...terms, noticeDays, body })
  const summary = describeChange(loaded.version, { ...terms, body, noticeDays })
  if (summary === 'no changes') return loaded
  const expected = loaded.agreement.currentVersion
  const version = expected + 1
  // Edit and sign are linearized here: the bump only lands if the agreement is
  // still unsigned and still on the version the admin was looking at, so a
  // signature can never end up on a version older than the current one.
  const agreement = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(agreementsTable)
      .set({
        termMonths: terms.termMonths,
        monthlyCents: terms.monthlyCents,
        setupFeeCents: terms.setupFeeCents,
        noticeDays,
        currentVersion: version,
        currentHash: hash,
        updatedAt: new Date(),
      })
      .where(
        and(eq(agreementsTable.id, loaded.agreement.id), eq(agreementsTable.currentVersion, expected), isNull(agreementsTable.signedAt)),
      )
      .returning()
    if (!row) {
      const [cur] = await tx
        .select({ signedAt: agreementsTable.signedAt })
        .from(agreementsTable)
        .where(eq(agreementsTable.id, loaded.agreement.id))
        .limit(1)
      throw new AgreementConflictError(
        cur?.signedAt ? 'The customer signed this agreement while you were editing it; it can no longer be changed.' : undefined,
      )
    }
    await tx.insert(agreementVersionsTable).values({
      id: newId(),
      agreementId: loaded.agreement.id,
      version,
      termMonths: terms.termMonths,
      monthlyCents: terms.monthlyCents,
      setupFeeCents: terms.setupFeeCents,
      noticeDays,
      body,
      hash,
      changedById: editor.id,
      changedByName: editor.name,
      changeSummary: summary,
    })
    return row
  })
  await syncTermsFromAgreement(agreement)
  await logAgreementEvent(agreement.id, 'edited', {
    version,
    actor: 'admin',
    actorName: editor.name,
    detail: { summary },
  })
  const next = await loadAgreementById(agreement.id)
  if (!next) throw new Error('Agreement vanished after update')
  return next
}

// ── Payment milestones (called from the subscription checkout) ─────

/** True when the subscription checkout may charge/save cards for this link. */
export async function agreementAllowsPayment(linkId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const loaded = await loadAgreementByLink(linkId)
  if (!loaded) return { ok: false, error: 'The service agreement must be signed before payment.' }
  const a = loaded.agreement
  if (!isSigned(a)) return { ok: false, error: 'Please sign the service agreement first.' }
  if (a.signedVersion !== a.currentVersion)
    return { ok: false, error: 'The agreement changed after it was signed. Please review and sign the current version.' }
  return { ok: true }
}

export async function onSetupFeePaid(
  linkId: string,
  detail: { amountCents: number; card: { brand: string; last4: string } | null; paidAt: Date },
): Promise<void> {
  const loaded = await loadAgreementByLink(linkId)
  if (!loaded || loaded.agreement.setupPaidAt) return
  await db
    .update(agreementsTable)
    .set({ setupPaidAt: detail.paidAt, updatedAt: new Date() })
    .where(eq(agreementsTable.id, loaded.agreement.id))
  await logAgreementEvent(loaded.agreement.id, 'setup_fee_paid', {
    version: loaded.agreement.currentVersion,
    detail: {
      amount: detail.amountCents > 0 ? formatMoney(detail.amountCents) : 'Waived — card saved',
      card: detail.card ? `${detail.card.brand} •••• ${detail.card.last4}` : null,
    },
  })
}

export async function onPaymentFailed(linkId: string, message: string): Promise<void> {
  const loaded = await loadAgreementByLink(linkId)
  if (!loaded || !isSigned(loaded.agreement) || loaded.agreement.status === 'completed') return
  await db
    .update(agreementsTable)
    .set({ status: 'payment_pending', updatedAt: new Date() })
    .where(eq(agreementsTable.id, loaded.agreement.id))
  await logAgreementEvent(loaded.agreement.id, 'payment_failed', {
    version: loaded.agreement.currentVersion,
    detail: { message: message.slice(0, 300) },
  })
}

/** Subscription created: mark completed, build the PDF, email the signed copy. */
export async function onSubscriptionStarted(
  linkId: string,
  detail: { monthlyCents: number; firstChargeAt: Date | null },
): Promise<void> {
  const loaded = await loadAgreementByLink(linkId)
  if (!loaded || loaded.agreement.status === 'completed') return
  const id = loaded.agreement.id
  await logAgreementEvent(id, 'subscription_started', {
    version: loaded.agreement.currentVersion,
    detail: {
      monthly: formatMoney(detail.monthlyCents),
      firstCharge: detail.firstChargeAt
        ? detail.firstChargeAt.toLocaleDateString('en-US', { dateStyle: 'medium', timeZone: 'America/New_York' })
        : null,
    },
  })
  const completedAt = new Date()
  await db
    .update(agreementsTable)
    .set({ status: 'completed', completedAt, updatedAt: completedAt })
    .where(eq(agreementsTable.id, id))
  await logAgreementEvent(id, 'completed', { version: loaded.agreement.currentVersion, actor: 'system' })
  try {
    const fresh = await loadAgreementById(id)
    if (fresh) {
      const pdf = await generateAndStorePdf(fresh)
      await sendSignedCopies(fresh, pdf)
    }
  } catch (err) {
    logger.error({ err, agreementId: id }, 'agreement completion follow-up failed')
  }
}

// ── PDF ────────────────────────────────────────────────────────────

export async function buildCertificateFor(loaded: LoadedAgreement): Promise<Certificate> {
  return buildCertificate(loaded.agreement, loaded.customer.email, await listEvents(loaded.agreement.id))
}

export async function buildPdf(loaded: LoadedAgreement): Promise<Buffer> {
  const a = loaded.agreement
  if (!a.signedSnapshot) throw new Error('Agreement is not signed')
  return renderAgreementPdf({
    snapshot: a.signedSnapshot,
    signature: {
      type: a.signatureType,
      data: a.signatureData,
      signerName: a.signerName,
      signerTitle: a.signerTitle,
      signedAt: a.signedAt,
    },
    amounts: { termMonths: a.termMonths, monthlyCents: a.monthlyCents, setupFeeCents: a.setupFeeCents },
    certificate: await buildCertificateFor(loaded),
    publicUrl: agreementUrl(a.token),
  })
}

export function pdfFileName(loaded: LoadedAgreement): string {
  const biz = (loaded.customer.businessName || loaded.customer.fullName).replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `Service-Agreement-${biz || 'customer'}.pdf`
}

/** Render, store in Blob, and remember the path. Returns the bytes for immediate use (email attachment). */
export async function generateAndStorePdf(loaded: LoadedAgreement): Promise<Buffer> {
  const bytes = await buildPdf(loaded)
  const stamp = new Date()
  try {
    const blob = await put(`agreements/${loaded.agreement.id}/${pdfFileName(loaded)}`, bytes, {
      access: 'private',
      addRandomSuffix: true,
      contentType: 'application/pdf',
    })
    await db
      .update(agreementsTable)
      .set({ pdfPath: blob.pathname, pdfGeneratedAt: stamp, updatedAt: stamp })
      .where(eq(agreementsTable.id, loaded.agreement.id))
    await logAgreementEvent(loaded.agreement.id, 'pdf_generated', { actor: 'system', detail: { path: blob.pathname } })
  } catch (err) {
    logger.error({ err, agreementId: loaded.agreement.id }, 'agreement pdf upload failed')
  }
  return bytes
}

/** Stored PDF bytes, generating (and storing) them when missing. */
export async function getOrCreatePdf(loaded: LoadedAgreement): Promise<Buffer> {
  const a = loaded.agreement
  if (a.pdfPath && a.pdfGeneratedAt && a.completedAt && a.pdfGeneratedAt >= a.completedAt) {
    try {
      const result = await get(a.pdfPath, { access: 'private' })
      if (result && result.statusCode === 200) return Buffer.from(await new Response(result.stream).arrayBuffer())
    } catch (err) {
      logger.warn({ err, agreementId: a.id }, 'stored agreement pdf unavailable; regenerating')
    }
  }
  // Not stored yet (signed but payment pending) or stale: render fresh. Only
  // persist once the agreement is complete so the stored copy is final.
  return a.status === 'completed' ? generateAndStorePdf(loaded) : buildPdf(loaded)
}

// ── Emails ─────────────────────────────────────────────────────────

async function adminRecipients(loaded: LoadedAgreement): Promise<string[]> {
  const out = new Set<string>()
  try {
    const admins = await listAdminUsers()
    for (const u of admins) {
      if (!u.active) continue
      if (u.role === 'super_admin' || u.id === loaded.agreement.sentById) out.add(u.email.toLowerCase())
    }
  } catch (err) {
    logger.error({ err }, 'could not list admins for agreement copy')
  }
  out.delete(loaded.customer.email.toLowerCase())
  return [...out]
}

export async function sendSignedCopies(loaded: LoadedAgreement, pdf: Buffer): Promise<void> {
  const a = loaded.agreement
  if (!a.signedAt || !a.signedSnapshot) return
  const base = {
    signerName: a.signerName ?? loaded.customer.fullName,
    businessName: loaded.customer.businessName || loaded.customer.fullName,
    agreementTitle: a.signedSnapshot.title,
    termMonths: a.termMonths,
    monthlyCents: a.monthlyCents,
    setupFeeCents: a.setupFeeCents,
    signedAt: a.signedAt.toISOString(),
    agreementUrl: agreementUrl(a.token),
  }
  const attachments = [{ filename: pdfFileName(loaded), content: pdf, contentType: 'application/pdf' }]
  await sendAgreementSignedEmail(
    loaded.customer.email,
    { ...base, name: loaded.customer.fullName, adminCopy: false },
    { metadata: { agreementId: a.id, customerId: loaded.customer.id }, attachments },
  )
  for (const to of await adminRecipients(loaded)) {
    await sendAgreementSignedEmail(
      to,
      { ...base, name: 'Team', adminCopy: true },
      { metadata: { agreementId: a.id, customerId: loaded.customer.id, adminCopy: true }, attachments },
    )
  }
}

// ── Cards on file (for admin detail) ───────────────────────────────

export async function cardsForLink(customerId: string, linkId: string) {
  return db
    .select()
    .from(customerCardsTable)
    .where(and(eq(customerCardsTable.customerId, customerId), eq(customerCardsTable.linkId, linkId), eq(customerCardsTable.active, true)))
}

export async function agreementsForLinks(linkIds: string[]): Promise<Map<string, Agreement>> {
  if (!linkIds.length) return new Map()
  const rows = await db.select().from(agreementsTable).where(inArray(agreementsTable.linkId, linkIds))
  const map = new Map<string, Agreement>()
  for (const r of rows) {
    const cur = map.get(r.linkId)
    if (!cur || cur.createdAt < r.createdAt) map.set(r.linkId, r)
  }
  return map
}
