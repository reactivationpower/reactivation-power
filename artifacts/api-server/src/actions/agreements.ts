import { and, desc, eq, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import {
  agreementInitialsTable,
  agreementsTable,
  customersTable,
  db,
  paymentLinkTermsTable,
  type Agreement,
  type AgreementEvent,
  type AgreementStatus,
  type AgreementVersion,
  type Customer,
  type SignatureType,
  type SignedSnapshot,
} from '@workspace/db'

import { requireAdmin } from '@/lib/auth/admin-session'
import { getStripeMode } from '@/lib/stripe'
import { sendAgreementSentEmail } from '@/lib/mail'
import { getAdminClient } from '@/lib/supabase/admin'
import { AGREEMENT_DEFAULTS, COMPANY, agreementTitle } from '@/lib/agreements/defaults'
import type { Certificate } from '@/lib/agreements/certificate'
import {
  AgreementConflictError,
  addVersion,
  agreementUrl,
  buildCertificateFor,
  createAgreement,
  effectiveStatus,
  isExpired,
  isSigned,
  listEvents,
  listVersions,
  loadAgreementById,
  loadAgreementByLink,
  loadAgreementByToken,
  logAgreementEvent,
  newId,
  onPaymentFailed,
  renderCurrent,
  requestFingerprint,
  snapshotFrom,
  validInitials,
  validateTerms,
  type AgreementTermsInput,
  type LoadedAgreement,
} from '@/lib/agreements/store'
import {
  DEFAULT_AGREEMENT_BODY,
  MERGE_FIELDS,
  renderDocument,
  validateTemplate,
  type RenderedDocument,
} from '@/lib/agreements/template'
import {
  getTwoCardCheckoutState,
  recordPrimaryCard,
  recordSecondaryCard,
  type TwoCardCheckoutState,
} from './subscriptions'

/**
 * Service agreements: admin send/edit/list and the public signing page.
 * Money arrives from the browser in dollars and is stored in cents.
 */

// ── Shapes shared with the SPA ─────────────────────────────────────

export interface AgreementTermsForm {
  termMonths: number
  monthlyDollars: number
  setupFeeDollars: number
  noticeDays?: number
  body?: string
}

export interface AgreementSummary {
  id: string
  token: string
  link_id: string
  customer_id: string
  customer_name: string
  business_name: string
  email: string
  rep_name: string | null
  status: AgreementStatus
  term_months: number
  monthly_cents: number
  setup_fee_cents: number
  current_version: number
  sent_at: string | null
  last_sent_at: string | null
  viewed_at: string | null
  signed_at: string | null
  setup_paid_at: string | null
  completed_at: string | null
  expires_at: string | null
  last_activity_at: string | null
  signer_name: string | null
  has_pdf: boolean
  public_url: string
  pdf_url: string
  locked: boolean
}

export interface AgreementVersionRow {
  version: number
  term_months: number
  monthly_cents: number
  setup_fee_cents: number
  notice_days: number
  body: string
  hash: string
  changed_by_name: string | null
  change_summary: string | null
  created_at: string
}

export interface AgreementEventRow {
  id: string
  type: AgreementEvent['type']
  version: number | null
  actor: string
  actor_name: string | null
  ip: string | null
  user_agent: string | null
  detail: Record<string, unknown> | null
  created_at: string
}

export interface AgreementDetail {
  agreement: AgreementSummary
  document: RenderedDocument | SignedSnapshot
  body: string
  notice_days: number
  initials: Record<string, string>
  versions: AgreementVersionRow[]
  events: AgreementEventRow[]
  signature: SignatureView | null
  certificate: Certificate | null
}

export interface SignatureView {
  type: SignatureType
  data: string
  signer_name: string
  signer_title: string | null
  signed_at: string
}

export interface PublicAgreement {
  token: string
  status: AgreementStatus
  version: number
  title: string
  customer: { full_name: string; business_name: string; email: string }
  amounts: { term_months: number; monthly_cents: number; setup_fee_cents: number; notice_days: number }
  document: RenderedDocument | SignedSnapshot
  initials: Record<string, string>
  signature: SignatureView | null
  certificate: Certificate | null
  expired: boolean
  expires_at: string | null
  signed: boolean
  completed: boolean
  pdf_url: string
  stripe_mode: 'test' | 'live'
  company: { name: string; email: string }
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)
const toCents = (dollars: unknown) => Math.round(Number(dollars) * 100)

function toSummary(a: Agreement, c: Customer, repName: string | null): AgreementSummary {
  return {
    id: a.id,
    token: a.token,
    link_id: a.linkId,
    customer_id: a.customerId,
    customer_name: c.fullName,
    business_name: c.businessName,
    email: c.email,
    rep_name: repName ?? a.sentByName,
    status: effectiveStatus(a),
    term_months: a.termMonths,
    monthly_cents: a.monthlyCents,
    setup_fee_cents: a.setupFeeCents,
    current_version: a.currentVersion,
    sent_at: iso(a.sentAt),
    last_sent_at: iso(a.lastSentAt),
    viewed_at: iso(a.viewedAt),
    signed_at: iso(a.signedAt),
    setup_paid_at: iso(a.setupPaidAt),
    completed_at: iso(a.completedAt),
    expires_at: iso(a.expiresAt),
    last_activity_at: iso(a.lastActivityAt),
    signer_name: a.signerName,
    has_pdf: Boolean(a.pdfPath),
    public_url: agreementUrl(a.token),
    pdf_url: `/api/agreements/${a.token}/pdf`,
    locked: isSigned(a),
  }
}

function signatureView(a: Agreement): SignatureView | null {
  if (!a.signedAt || !a.signatureType || !a.signatureData) return null
  return {
    type: a.signatureType,
    data: a.signatureData,
    signer_name: a.signerName ?? '',
    signer_title: a.signerTitle,
    signed_at: a.signedAt.toISOString(),
  }
}

function termsFromForm(form: AgreementTermsForm): { ok: true; value: AgreementTermsInput } | { ok: false; error: string } {
  const value: AgreementTermsInput = {
    termMonths: Math.round(Number(form.termMonths)),
    monthlyCents: toCents(form.monthlyDollars),
    setupFeeCents: toCents(form.setupFeeDollars ?? 0),
    noticeDays: form.noticeDays == null ? undefined : Math.round(Number(form.noticeDays)),
    body: typeof form.body === 'string' ? form.body : undefined,
  }
  const err = validateTerms(value)
  if (err) return { ok: false, error: err }
  if (value.body != null) {
    const tErr = validateTemplate(value.body)
    if (tErr) return { ok: false, error: tErr }
  }
  return { ok: true, value }
}

async function customerAndTermsForLink(linkId: string): Promise<{ customer: Customer; terms: typeof paymentLinkTermsTable.$inferSelect } | null> {
  const [terms] = await db.select().from(paymentLinkTermsTable).where(eq(paymentLinkTermsTable.linkId, linkId)).limit(1)
  if (!terms || terms.type !== 'subscription') return null
  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, terms.customerId)).limit(1)
  if (!customer) return null
  return { customer, terms }
}

async function toDetail(loaded: LoadedAgreement): Promise<AgreementDetail> {
  const { agreement, customer, terms, version } = loaded
  const doc = renderCurrent(loaded)
  const [versions, events] = await Promise.all([listVersions(agreement.id), listEvents(agreement.id)])
  const signed = isSigned(agreement)
  return {
    agreement: toSummary(agreement, customer, terms?.repName ?? null),
    document: signed && agreement.signedSnapshot ? { ...doc, ...agreement.signedSnapshot } : doc,
    body: version.body,
    notice_days: version.noticeDays,
    initials: signed && agreement.signedSnapshot
      ? Object.fromEntries(agreement.signedSnapshot.sections.filter((s) => s.initials).map((s) => [s.id, s.initials!]))
      : await validInitials(loaded, doc),
    versions: versions.map((v) => ({
      version: v.version,
      term_months: v.termMonths,
      monthly_cents: v.monthlyCents,
      setup_fee_cents: v.setupFeeCents,
      notice_days: v.noticeDays,
      body: v.body,
      hash: v.hash,
      changed_by_name: v.changedByName,
      change_summary: v.changeSummary,
      created_at: v.createdAt.toISOString(),
    })),
    events: events.map((e) => ({
      id: e.id,
      type: e.type,
      version: e.version,
      actor: e.actor,
      actor_name: e.actorName,
      ip: e.ip,
      user_agent: e.userAgent,
      detail: e.detail,
      created_at: e.createdAt.toISOString(),
    })),
    signature: signatureView(agreement),
    certificate: signed ? await buildCertificateFor(loaded) : null,
  }
}

// ── Admin: defaults, preview, send, edit, resend ───────────────────

/** Prefill for the send form: link amounts when the rep set them, otherwise the global defaults. */
export async function getAgreementSendForm(linkId: string): Promise<{
  ok: boolean
  error?: string
  form?: AgreementTermsForm & { body: string; noticeDays: number }
  defaults?: { termMonths: number; monthlyDollars: number; setupFeeDollars: number; noticeDays: number }
  mergeFields?: readonly string[]
  existing?: AgreementSummary | null
}> {
  await requireAdmin()
  const found = await customerAndTermsForLink(linkId)
  if (!found) return { ok: false, error: 'Agreements are only sent for subscription links.' }
  const existing = await loadAgreementByLink(linkId)
  const d = AGREEMENT_DEFAULTS
  const useLink = found.terms.monthlyCents > 0
  return {
    ok: true,
    form: existing
      ? {
          termMonths: existing.version.termMonths,
          monthlyDollars: existing.version.monthlyCents / 100,
          setupFeeDollars: existing.version.setupFeeCents / 100,
          noticeDays: existing.version.noticeDays,
          body: existing.version.body,
        }
      : {
          termMonths: d.termMonths,
          monthlyDollars: (useLink ? found.terms.monthlyCents : d.monthlyCents) / 100,
          setupFeeDollars: (useLink ? found.terms.setupFeeCents : d.setupFeeCents) / 100,
          noticeDays: d.noticeDays,
          body: DEFAULT_AGREEMENT_BODY,
        },
    defaults: {
      termMonths: d.termMonths,
      monthlyDollars: d.monthlyCents / 100,
      setupFeeDollars: d.setupFeeCents / 100,
      noticeDays: d.noticeDays,
    },
    mergeFields: MERGE_FIELDS,
    existing: existing ? toSummary(existing.agreement, existing.customer, existing.terms?.repName ?? null) : null,
  }
}

/** Merged preview of the agreement before it is sent or saved. */
export async function previewAgreement(
  linkId: string,
  form: AgreementTermsForm,
): Promise<{ ok: boolean; error?: string; document?: RenderedDocument }> {
  await requireAdmin()
  const found = await customerAndTermsForLink(linkId)
  if (!found) return { ok: false, error: 'Customer not found.' }
  const parsed = termsFromForm(form)
  if (!parsed.ok) return { ok: false, error: parsed.error }
  const t = parsed.value
  return {
    ok: true,
    document: renderDocument(t.body ?? DEFAULT_AGREEMENT_BODY, {
      customer: found.customer,
      termMonths: t.termMonths,
      monthlyCents: t.monthlyCents,
      setupFeeCents: t.setupFeeCents,
      noticeDays: t.noticeDays ?? AGREEMENT_DEFAULTS.noticeDays,
    }),
  }
}

async function emailSignRequest(loaded: LoadedAgreement, resend: boolean): Promise<boolean> {
  const { agreement, customer } = loaded
  const res = await sendAgreementSentEmail(
    customer.email,
    {
      name: customer.fullName,
      agreementTitle: agreementTitle(agreement.termMonths),
      termMonths: agreement.termMonths,
      monthlyCents: agreement.monthlyCents,
      setupFeeCents: agreement.setupFeeCents,
      signUrl: agreementUrl(agreement.token),
      expiresAt: agreement.expiresAt?.toISOString() ?? null,
      resend,
    },
    { metadata: { agreementId: agreement.id, customerId: customer.id, resend } },
  )
  return res.ok
}

/**
 * Create the agreement for a subscription link and email the signing link.
 * If a draft/sent agreement already exists (e.g. auto-created for a legacy
 * link) it is updated in place rather than duplicated.
 */
export async function sendAgreement(
  linkId: string,
  form: AgreementTermsForm,
): Promise<{ ok: boolean; error?: string; emailed?: boolean; detail?: AgreementDetail }> {
  const admin = await requireAdmin()
  const found = await customerAndTermsForLink(linkId)
  if (!found) return { ok: false, error: 'Agreements are only sent for subscription links.' }
  const parsed = termsFromForm(form)
  if (!parsed.ok) return { ok: false, error: parsed.error }

  let loaded = await loadAgreementByLink(linkId)
  if (loaded && isSigned(loaded.agreement)) return { ok: false, error: 'This agreement is already signed.' }
  const first = !loaded?.agreement.sentAt
  const sender = { id: admin.userId, name: admin.name || admin.email }
  if (loaded) {
    try {
      loaded = await addVersion(loaded, parsed.value, sender)
    } catch (err) {
      if (err instanceof AgreementConflictError) return { ok: false, error: err.message }
      throw err
    }
  } else {
    loaded = await createAgreement({ customer: found.customer, linkId, terms: parsed.value, sender, status: 'sent' })
  }
  const now = new Date()
  await db
    .update(agreementsTable)
    .set({
      status: loaded.agreement.status === 'draft' ? 'sent' : loaded.agreement.status,
      sentById: loaded.agreement.sentById ?? sender.id,
      sentByName: loaded.agreement.sentByName ?? sender.name,
      sentAt: loaded.agreement.sentAt ?? now,
      lastSentAt: now,
      expiresAt: new Date(now.getTime() + AGREEMENT_DEFAULTS.linkValidDays * 86400000),
      updatedAt: now,
    })
    .where(eq(agreementsTable.id, loaded.agreement.id))
  await logAgreementEvent(loaded.agreement.id, first ? 'sent' : 'resent', {
    version: loaded.agreement.currentVersion,
    actor: 'admin',
    actorName: sender.name,
    detail: { to: found.customer.email },
  })
  const fresh = await loadAgreementById(loaded.agreement.id)
  if (!fresh) return { ok: false, error: 'Agreement not found after send.' }
  const emailed = await emailSignRequest(fresh, !first)
  revalidatePath('/admin/agreements')
  revalidatePath(`/admin/payments/${linkId}`)
  return { ok: true, emailed, detail: await toDetail(fresh) }
}

/** Edit term, amounts or text on an unsigned agreement: new version, customer page updates live. */
export async function updateAgreement(
  id: string,
  form: AgreementTermsForm,
): Promise<{ ok: boolean; error?: string; detail?: AgreementDetail }> {
  const admin = await requireAdmin()
  const loaded = await loadAgreementById(id)
  if (!loaded) return { ok: false, error: 'Agreement not found.' }
  if (isSigned(loaded.agreement)) return { ok: false, error: 'This agreement is signed and can no longer be edited.' }
  const parsed = termsFromForm(form)
  if (!parsed.ok) return { ok: false, error: parsed.error }
  let next: LoadedAgreement
  try {
    next = await addVersion(loaded, parsed.value, { id: admin.userId, name: admin.name || admin.email })
  } catch (err) {
    if (err instanceof AgreementConflictError) return { ok: false, error: err.message }
    throw err
  }
  revalidatePath('/admin/agreements')
  revalidatePath(`/admin/agreements/${id}`)
  revalidatePath(`/admin/payments/${loaded.agreement.linkId}`)
  return { ok: true, detail: await toDetail(next) }
}

/** Re-send the signing link (extends the expiry). */
export async function resendAgreement(id: string): Promise<{ ok: boolean; error?: string; emailed?: boolean }> {
  const admin = await requireAdmin()
  const loaded = await loadAgreementById(id)
  if (!loaded) return { ok: false, error: 'Agreement not found.' }
  if (isSigned(loaded.agreement)) return { ok: false, error: 'This agreement is already signed.' }
  const now = new Date()
  await db
    .update(agreementsTable)
    .set({
      status: loaded.agreement.status === 'draft' ? 'sent' : loaded.agreement.status,
      sentAt: loaded.agreement.sentAt ?? now,
      sentById: loaded.agreement.sentById ?? admin.userId,
      sentByName: loaded.agreement.sentByName ?? (admin.name || admin.email),
      lastSentAt: now,
      expiresAt: new Date(now.getTime() + AGREEMENT_DEFAULTS.linkValidDays * 86400000),
      updatedAt: now,
    })
    .where(eq(agreementsTable.id, id))
  await logAgreementEvent(id, loaded.agreement.sentAt ? 'resent' : 'sent', {
    version: loaded.agreement.currentVersion,
    actor: 'admin',
    actorName: admin.name || admin.email,
    detail: { to: loaded.customer.email },
  })
  const fresh = await loadAgreementById(id)
  const emailed = fresh ? await emailSignRequest(fresh, Boolean(loaded.agreement.sentAt)) : false
  revalidatePath(`/admin/agreements/${id}`)
  return { ok: true, emailed }
}

// ── Admin: hub & detail ────────────────────────────────────────────

export async function listAgreements(): Promise<AgreementSummary[]> {
  await requireAdmin()
  const rows = await db
    .select({ agreement: agreementsTable, customer: customersTable, repName: paymentLinkTermsTable.repName })
    .from(agreementsTable)
    .innerJoin(customersTable, eq(customersTable.id, agreementsTable.customerId))
    .leftJoin(paymentLinkTermsTable, eq(paymentLinkTermsTable.linkId, agreementsTable.linkId))
    .orderBy(desc(agreementsTable.lastActivityAt))
  return rows.map((r) => toSummary(r.agreement, r.customer, r.repName))
}

export async function getAgreementDetail(id: string): Promise<AgreementDetail | null> {
  await requireAdmin()
  const loaded = await loadAgreementById(id)
  return loaded ? toDetail(loaded) : null
}

/** Agreement state for the customer record (payment detail page). */
export async function getAgreementForLink(linkId: string): Promise<AgreementSummary | null> {
  await requireAdmin()
  const loaded = await loadAgreementByLink(linkId)
  return loaded ? toSummary(loaded.agreement, loaded.customer, loaded.terms?.repName ?? null) : null
}

/**
 * Legacy subscription links must go through the agreement. Returns the
 * agreement token for a subscription link, creating a draft agreement with
 * the link's own amounts if none exists yet.
 */
export async function agreementTokenForLink(linkToken: string): Promise<string | null> {
  const supabase = getAdminClient()
  const { data } = await supabase.from('payment_links').select('id').eq('token', linkToken).maybeSingle()
  if (!data) return null
  const linkId = String(data.id)
  const existing = await loadAgreementByLink(linkId)
  if (existing) return existing.agreement.token
  const found = await customerAndTermsForLink(linkId)
  if (!found) return null
  const terms: AgreementTermsInput = {
    termMonths: found.terms.termMonths || AGREEMENT_DEFAULTS.termMonths,
    monthlyCents: found.terms.monthlyCents || AGREEMENT_DEFAULTS.monthlyCents,
    setupFeeCents: found.terms.monthlyCents > 0 ? found.terms.setupFeeCents : AGREEMENT_DEFAULTS.setupFeeCents,
  }
  const created = await createAgreement({
    customer: found.customer,
    linkId,
    terms,
    sender: { id: found.terms.repId, name: found.terms.repName },
    status: 'sent',
  })
  await logAgreementEvent(created.agreement.id, 'sent', {
    version: 1,
    actor: 'system',
    detail: { via: 'subscription link' },
  })
  return created.agreement.token
}

// ── Public: signing page ───────────────────────────────────────────

async function toPublic(loaded: LoadedAgreement): Promise<PublicAgreement> {
  const { agreement: a, customer, version } = loaded
  const signed = isSigned(a)
  const doc = renderCurrent(loaded)
  return {
    token: a.token,
    status: effectiveStatus(a),
    version: a.currentVersion,
    title: signed && a.signedSnapshot ? a.signedSnapshot.title : doc.title,
    customer: { full_name: customer.fullName, business_name: customer.businessName, email: customer.email },
    amounts: {
      term_months: a.termMonths,
      monthly_cents: a.monthlyCents,
      setup_fee_cents: a.setupFeeCents,
      notice_days: version.noticeDays,
    },
    document: signed && a.signedSnapshot ? a.signedSnapshot : doc,
    initials: signed && a.signedSnapshot
      ? Object.fromEntries(a.signedSnapshot.sections.filter((s) => s.initials).map((s) => [s.id, s.initials!]))
      : await validInitials(loaded, doc),
    signature: signatureView(a),
    certificate: signed ? await buildCertificateFor(loaded) : null,
    expired: isExpired(a),
    expires_at: iso(a.expiresAt),
    signed,
    completed: a.status === 'completed',
    pdf_url: `/api/agreements/${a.token}/pdf`,
    stripe_mode: getStripeMode(),
    company: { name: COMPANY.name, email: COMPANY.supportEmail },
  }
}

/** Public: the agreement for the signing / signed-copy page. Records the first view. */
export async function getAgreementPublic(token: string): Promise<PublicAgreement | null> {
  const loaded = await loadAgreementByToken(token)
  if (!loaded) return null
  const a = loaded.agreement
  if (!isSigned(a) && !isExpired(a) && (!a.viewedAt || a.viewedAt < (a.lastSentAt ?? a.viewedAt))) {
    // First view (or first view after a re-send): status + audit event
    const now = new Date()
    await db
      .update(agreementsTable)
      .set({ viewedAt: now, status: a.status === 'sent' || a.status === 'draft' ? 'viewed' : a.status, updatedAt: now })
      .where(eq(agreementsTable.id, a.id))
    await logAgreementEvent(a.id, 'viewed', { version: a.currentVersion })
  }
  const fresh = await loadAgreementByToken(token)
  return fresh ? toPublic(fresh) : null
}

/** Public: cheap poll for live updates. */
export async function getAgreementVersion(token: string): Promise<{ version: number; status: AgreementStatus; hash: string } | null> {
  const [row] = await db
    .select({ version: agreementsTable.currentVersion, hash: agreementsTable.currentHash, a: agreementsTable })
    .from(agreementsTable)
    .where(eq(agreementsTable.token, token))
    .limit(1)
  if (!row) return null
  return { version: row.version, hash: row.hash, status: effectiveStatus(row.a) }
}

const INITIALS_RE = /^[A-Za-z][A-Za-z.\-' ]{0,5}$/

/** Public: save the initials for one section of the current version. */
export async function recordAgreementInitials(
  token: string,
  input: { version: number; sectionId: string; initials: string },
): Promise<{ ok: boolean; error?: string; stale?: boolean; initials?: Record<string, string> }> {
  const loaded = await loadAgreementByToken(token)
  if (!loaded) return { ok: false, error: 'This agreement link is not valid.' }
  const a = loaded.agreement
  if (isSigned(a)) return { ok: false, error: 'This agreement is already signed.' }
  if (isExpired(a)) return { ok: false, error: 'This signing link has expired. Ask us to re-send it.' }
  if (Number(input.version) !== a.currentVersion)
    return { ok: false, stale: true, error: 'The agreement was updated. Please review the new version.' }
  const initials = String(input.initials ?? '').trim().toUpperCase()
  if (!INITIALS_RE.test(initials)) return { ok: false, error: 'Enter your initials (1–6 letters).' }
  const doc = renderCurrent(loaded)
  const section = doc.sections.find((s) => s.id === input.sectionId)
  if (!section || !section.requiresInitials) return { ok: false, error: 'That section does not need initials.' }
  const fp = requestFingerprint()
  await db
    .insert(agreementInitialsTable)
    .values({
      id: newId(),
      agreementId: a.id,
      sectionId: section.id,
      sectionHash: section.hash,
      version: a.currentVersion,
      initials,
      ip: fp.ip,
      userAgent: fp.userAgent,
    })
    .onConflictDoUpdate({
      target: [agreementInitialsTable.agreementId, agreementInitialsTable.sectionId],
      set: { sectionHash: section.hash, version: a.currentVersion, initials, ip: fp.ip, userAgent: fp.userAgent, createdAt: new Date() },
    })
  await logAgreementEvent(a.id, 'initialed', {
    version: a.currentVersion,
    detail: { sectionId: section.id, sectionTitle: section.title, initials },
  })
  return { ok: true, initials: await validInitials(loaded, doc) }
}

export interface SignInput {
  version: number
  consent: boolean
  signerName: string
  signerTitle: string
  signatureType: SignatureType
  /** Typed: the typed name. Drawn: PNG data URL from the canvas. */
  signatureData: string
  /** Initials entered on this page (also saved individually as typed); used as a final safety net. */
  initials?: Record<string, string>
}

const MAX_SIGNATURE_BYTES = 400_000

/** Public: record the signature. Payment happens next (see getAgreementCheckout). */
export async function signAgreement(
  token: string,
  input: SignInput,
): Promise<{ ok: boolean; error?: string; stale?: boolean; missing?: string[] }> {
  const loaded = await loadAgreementByToken(token)
  if (!loaded) return { ok: false, error: 'This agreement link is not valid.' }
  const a = loaded.agreement
  if (isSigned(a)) return { ok: true }
  if (isExpired(a)) return { ok: false, error: 'This signing link has expired. Ask us to re-send it.' }
  if (Number(input.version) !== a.currentVersion)
    return { ok: false, stale: true, error: 'The agreement was updated after you loaded it. Please review the new version and sign again.' }
  if (input.consent !== true) return { ok: false, error: 'Please agree to sign electronically.' }
  const signerName = String(input.signerName ?? '').trim().slice(0, 120)
  const signerTitle = String(input.signerTitle ?? '').trim().slice(0, 80)
  if (signerName.length < 2) return { ok: false, error: 'Enter your full name as the signer.' }
  if (!signerTitle) return { ok: false, error: 'Enter your title (for example Owner or Office Manager).' }
  const signatureType: SignatureType = input.signatureType === 'drawn' ? 'drawn' : 'typed'
  const signatureData = String(input.signatureData ?? '')
  if (signatureType === 'drawn') {
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signatureData) || signatureData.length > MAX_SIGNATURE_BYTES)
      return { ok: false, error: 'Please draw your signature.' }
  } else if (signatureData.trim().length < 2 || signatureData.length > 120) {
    return { ok: false, error: 'Please type your signature.' }
  }

  const doc = renderCurrent(loaded)
  const fp = requestFingerprint()
  // Initials submitted with the form that were not saved individually
  for (const s of doc.sections) {
    const typed = input.initials?.[s.id]
    if (s.requiresInitials && typed && INITIALS_RE.test(typed.trim().toUpperCase())) {
      await recordAgreementInitials(token, { version: a.currentVersion, sectionId: s.id, initials: typed })
    }
  }
  const initials = await validInitials(loaded, doc)
  const missing = doc.sections.filter((s) => s.requiresInitials && !initials[s.id]).map((s) => s.title)
  if (missing.length) return { ok: false, error: `Please initial: ${missing.join(', ')}.`, missing }

  const now = new Date()
  const snapshot = snapshotFrom(doc, initials)
  await logAgreementEvent(a.id, 'consented', { version: a.currentVersion, fingerprint: fp })
  const [updated] = await db
    .update(agreementsTable)
    .set({
      status: 'signed',
      signedAt: now,
      signedVersion: a.currentVersion,
      documentHash: doc.hash,
      signedSnapshot: snapshot,
      consentAt: now,
      signerName,
      signerTitle,
      signatureType,
      signatureData: signatureType === 'typed' ? signatureData.trim() : signatureData,
      signerIp: fp.ip,
      signerUserAgent: fp.userAgent,
      updatedAt: now,
    })
    .where(and(eq(agreementsTable.id, a.id), eq(agreementsTable.currentVersion, a.currentVersion), isNull(agreementsTable.signedAt)))
    .returning()
  if (!updated) return { ok: false, stale: true, error: 'The agreement changed while you were signing. Please review and sign again.' }
  await logAgreementEvent(a.id, 'signed', {
    version: a.currentVersion,
    fingerprint: fp,
    detail: { signatureType, signerName, signerTitle, documentHash: doc.hash },
  })
  revalidatePath('/admin/agreements')
  return { ok: true }
}

/**
 * Public: both card steps for the agreement's subscription link. Intents are
 * prepared before signing so cards can be entered on the same page; the
 * server refuses to record a card until the agreement is signed.
 */
export async function getAgreementCheckout(token: string): Promise<{ ok: boolean; error?: string; checkout?: TwoCardCheckoutState }> {
  const loaded = await loadAgreementByToken(token)
  if (!loaded || !loaded.terms) return { ok: false, error: 'This agreement link is not valid.' }
  if (!isSigned(loaded.agreement) && isExpired(loaded.agreement)) return { ok: false, error: 'This signing link has expired.' }
  const checkout = await getTwoCardCheckoutState(loaded.terms.token)
  if (!checkout) return { ok: false, error: 'The subscription link for this agreement is no longer active.' }
  return { ok: true, checkout }
}

export async function recordAgreementPrimaryCard(token: string) {
  const loaded = await loadAgreementByToken(token)
  if (!loaded || !loaded.terms) return { ok: false, error: 'This agreement link is not valid.' }
  const res = await recordPrimaryCard(loaded.terms.token)
  if (!res.ok && res.error) await onPaymentFailed(loaded.agreement.linkId, res.error)
  return res
}

export async function recordAgreementSecondaryCard(token: string) {
  const loaded = await loadAgreementByToken(token)
  if (!loaded || !loaded.terms) return { ok: false, error: 'This agreement link is not valid.' }
  const res = await recordSecondaryCard(loaded.terms.token)
  if (!res.ok && res.error && !res.duplicate) await onPaymentFailed(loaded.agreement.linkId, res.error)
  return res
}

/** Public: the browser's card confirmation failed (declined, etc.) — keep the signature, note the failure. */
export async function recordAgreementPaymentFailure(token: string, message: string): Promise<{ ok: boolean }> {
  const loaded = await loadAgreementByToken(token)
  if (!loaded) return { ok: false }
  await onPaymentFailed(loaded.agreement.linkId, String(message ?? 'Card declined').slice(0, 300))
  return { ok: true }
}

export type { AgreementVersion }
