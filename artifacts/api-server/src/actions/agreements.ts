import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import {
  agreementInitialsTable,
  agreementEventsTable,
  agreementsTable,
  customersTable,
  db,
  paymentLinkTermsTable,
  enrollmentInvitationsTable,
  type Agreement,
  type AgreementEvent,
  type AgreementStatus,
  type AgreementVersion,
  type Customer,
  type SignatureType,
  type SignedSnapshot,
} from '@workspace/db'

import { requireAdmin } from '@/lib/auth/admin-session'
import { supersedeInitialInvitation } from '@/lib/agreements/enrollment-invitation'
import { getAdminSession } from '@/lib/auth/admin-session'
import { canAccessNotificationAgreement, notificationScope } from '@/lib/enrollment-notifications'
import { getStripeMode } from '@/lib/stripe'
import { sendAgreementSentEmail } from '@/lib/mail'
import { renderTemplate } from '@/lib/mail/templates'
import { emailLogTable } from '@workspace/db'
import { getAdminClient } from '@/lib/supabase/admin'
import { AGREEMENT_DEFAULTS, COMPANY, agreementTitle } from '@/lib/agreements/defaults'
import type { Certificate } from '@/lib/agreements/certificate'
import {
  AgreementConflictError,
  addVersion,
  agreementUrl,
  buildCertificateFor,
  createAgreement,
  completionDeliveryStatus,
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
  retryCompletionDelivery,
  requestFingerprint,
  snapshotFrom,
  validInitials,
  validateTerms,
  type AgreementTermsInput,
  type LoadedAgreement,
} from '@/lib/agreements/store'
import {
  CALENDAR_AGREEMENT_BODY,
  DEFAULT_ONE_TIME_AGREEMENT_BODY,
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
import { checkout as enrollmentCheckout, saveCard as saveEnrollmentCard, replaceCard as replaceEnrollmentPaymentCard, confirm as confirmEnrollmentPayment, reconcile as reconcileEnrollmentPayment } from './enrollment'

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
  delivery_email: string
  copy_emails: string[]
  pdf_ready: boolean
  delivery_status: Array<{ recipient: string; status: string; error?: string | null }>
  initial_delivery_status: Array<{ recipient: string; status: string; error?: string | null }>
  initial_invitation_status: string | null
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
  offer_type: 'one_time' | 'subscription'
  enrollment_flow: boolean
  pdf_ready: boolean
  delivery_status: Array<{ recipient: string; status: string; error?: string | null }>
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
    delivery_email: a.signerDeliveryEmail ?? c.email,
    copy_emails: a.copyEmails,
    pdf_ready: Boolean(a.pdfPath),
    delivery_status: [],
    initial_delivery_status: [],
    initial_invitation_status: null,
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

function termsFromForm(form: AgreementTermsForm, offerType: 'subscription' | 'one_time' = 'subscription'): { ok: true; value: AgreementTermsInput } | { ok: false; error: string } {
  const value: AgreementTermsInput = {
    termMonths: Math.round(Number(form.termMonths)),
    monthlyCents: toCents(form.monthlyDollars),
    setupFeeCents: toCents(form.setupFeeDollars ?? 0),
    noticeDays: form.noticeDays == null ? undefined : Math.round(Number(form.noticeDays)),
    body: typeof form.body === 'string' ? form.body : undefined,
  }
  const err = validateTerms(value, offerType)
  if (err) return { ok: false, error: err }
  if (value.body != null) {
    const tErr = validateTemplate(value.body)
    if (tErr) return { ok: false, error: tErr }
  }
  return { ok: true, value }
}

async function customerAndTermsForLink(linkId: string): Promise<{ customer: Customer; terms: typeof paymentLinkTermsTable.$inferSelect } | null> {
  const [terms] = await db.select().from(paymentLinkTermsTable).where(eq(paymentLinkTermsTable.linkId, linkId)).limit(1)
  if (!terms) return null
  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, terms.customerId)).limit(1)
  if (!customer) return null
  return { customer, terms }
}

async function toDetail(loaded: LoadedAgreement): Promise<AgreementDetail> {
  const { agreement, customer, terms, version } = loaded
  const doc = renderCurrent(loaded)
  const [versions, events] = await Promise.all([listVersions(agreement.id), listEvents(agreement.id)])
  const sentLogs = await db.select({ recipient: emailLogTable.recipient, status: emailLogTable.status, error: emailLogTable.error })
    .from(emailLogTable).where(and(
      eq(emailLogTable.type, 'agreement_sent'),
      sql`${emailLogTable.metadata}->>'agreementId' = ${agreement.id}`,
    )).orderBy(desc(emailLogTable.createdAt))
  const recipients = new Set<string>()
  const initialDelivery = sentLogs.filter(row => {
    if (recipients.has(row.recipient)) return false
    recipients.add(row.recipient)
    return true
  }).map(row => ({ ...row, status: row.status === 'sent' ? 'provider_accepted' : row.status }))
  const [invitation] = await db.select().from(enrollmentInvitationsTable)
    .where(eq(enrollmentInvitationsTable.linkId, agreement.linkId)).limit(1)
  if (invitation && !['provider_accepted'].includes(invitation.status)) {
    const current = initialDelivery.find(row => row.recipient === invitation.recipient)
    if (!current) initialDelivery.push({ recipient: invitation.recipient, status: invitation.status, error: null })
  }
  const signed = isSigned(agreement)
  return {
    agreement: {
      ...toSummary(agreement, customer, terms?.repName ?? null),
      delivery_status: await completionDeliveryStatus(loaded),
      initial_delivery_status: initialDelivery,
      initial_invitation_status: invitation?.status ?? null,
    },
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
  customerEmail?: string
  customerName?: string
}> {
  await requireAdmin()
  const found = await customerAndTermsForLink(linkId)
  if (!found) return { ok: false, error: 'Agreements are only sent for subscription links.' }
  const existing = await loadAgreementByLink(linkId)
  const d = AGREEMENT_DEFAULTS
  const useLink = found.terms.monthlyCents > 0
  const oneTime = found.terms.type === 'one_time'
  const { data: link } = oneTime
    ? await getAdminClient().from('payment_links').select('amount_cents').eq('id', linkId).maybeSingle()
    : { data: null }
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
          termMonths: oneTime ? 0 : d.termMonths,
          monthlyDollars: oneTime ? 0 : (useLink ? found.terms.monthlyCents : d.monthlyCents) / 100,
          setupFeeDollars: oneTime ? Number(link?.amount_cents ?? 0) / 100 : (useLink ? found.terms.setupFeeCents : d.setupFeeCents) / 100,
          noticeDays: d.noticeDays,
          body: oneTime ? DEFAULT_ONE_TIME_AGREEMENT_BODY : found.terms.billingAnchor === 'calendar_month' ? CALENDAR_AGREEMENT_BODY : DEFAULT_AGREEMENT_BODY,
        },
    defaults: {
      termMonths: d.termMonths,
      monthlyDollars: d.monthlyCents / 100,
      setupFeeDollars: d.setupFeeCents / 100,
      noticeDays: d.noticeDays,
    },
    mergeFields: MERGE_FIELDS,
    customerEmail: found.customer.email,
    customerName: found.customer.fullName,
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
  const parsed = termsFromForm(form, found.terms.type)
  if (!parsed.ok) return { ok: false, error: parsed.error }
  const t = parsed.value
  return {
    ok: true,
    document: renderDocument(t.body ?? (found.terms.type === 'one_time' ? DEFAULT_ONE_TIME_AGREEMENT_BODY : found.terms.billingAnchor === 'calendar_month' ? CALENDAR_AGREEMENT_BODY : DEFAULT_AGREEMENT_BODY), {
      customer: found.customer,
      termMonths: t.termMonths,
      monthlyCents: t.monthlyCents,
      setupFeeCents: t.setupFeeCents,
      noticeDays: t.noticeDays ?? AGREEMENT_DEFAULTS.noticeDays,
      billingAnchor: found.terms.billingAnchor,
      offerType: found.terms.type,
    }),
  }
}

function deliveryAddresses(input: { signerEmail?: string; copyEmails?: string[] } | undefined, customerEmail: string) {
  const valid = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  const signerEmail = (input?.signerEmail ?? customerEmail).trim().toLowerCase()
  const copyEmails = [...new Set((input?.copyEmails ?? []).map(e => e.trim().toLowerCase()).filter(Boolean))]
  if (!valid(signerEmail) || copyEmails.length > 5 || copyEmails.some(e => !valid(e)))
    throw new Error('Enter a valid delivery email and up to five valid copy addresses.')
  return { signerEmail, copyEmails: copyEmails.filter(e => e !== signerEmail) }
}

async function emailSignRequest(loaded: LoadedAgreement, resend: boolean): Promise<{ accepted: boolean; logIds: string[] }> {
  const { agreement, customer } = loaded
  const data = {
      name: customer.fullName,
      agreementTitle: loaded.terms?.type === 'one_time' ? `${COMPANY.name} Full-Payment Service Agreement` : agreementTitle(agreement.termMonths),
      termMonths: agreement.termMonths,
      monthlyCents: agreement.monthlyCents,
      setupFeeCents: agreement.setupFeeCents,
      signUrl: agreementUrl(agreement.token),
      expiresAt: agreement.expiresAt?.toISOString() ?? null,
      resend,
    }
  const recipients = [agreement.signerDeliveryEmail ?? customer.email, ...(agreement.copyEmails ?? [])]
  const results = await Promise.all(recipients.map((to, index) => sendAgreementSentEmail(to, { ...data, copyOnly: index > 0 },
    { metadata: { agreementId: agreement.id, customerId: customer.id, resend } })))
  return { accepted: results.every(r => r.ok), logIds: results.map(r => r.logId) }
}

export async function previewEnrollmentEmail(linkId: string, form: AgreementTermsForm) {
  await requireAdmin()
  const found = await customerAndTermsForLink(linkId)
  if (!found) return { ok: false, error: 'Customer not found.' }
  const parsed = termsFromForm(form, found.terms.type)
  if (!parsed.ok) return parsed
  const { data: link } = await getAdminClient().from('payment_links').select('token').eq('id', linkId).single()
  if (!link) return { ok: false, error: 'Link not found.' }
  const data = {
    name: found.customer.fullName,
    agreementTitle: found.terms.type === 'one_time' ? `${COMPANY.name} Full-Payment Service Agreement` : agreementTitle(parsed.value.termMonths),
    termMonths: parsed.value.termMonths,
    monthlyCents: parsed.value.monthlyCents,
    setupFeeCents: parsed.value.setupFeeCents,
    signUrl: agreementUrl((await loadAgreementByLink(linkId))?.agreement.token ?? 'link-created-when-sent'),
    expiresAt: null, resend: false,
  }
  const rendered = renderTemplate('agreement_sent', data)
  const copy = renderTemplate('agreement_sent', { ...data, copyOnly: true })
  return { ok: true, subject: rendered.subject, html: rendered.html, previewText: rendered.previewText,
    copySubject: copy.subject, copyHtml: copy.html }
}

/**
 * Create the agreement for a subscription link and email the signing link.
 * If a draft/sent agreement already exists (e.g. auto-created for a legacy
 * link) it is updated in place rather than duplicated.
 */
export async function sendAgreement(
  linkId: string,
  form: AgreementTermsForm,
  delivery?: { signerEmail?: string; copyEmails?: string[] },
): Promise<{ ok: boolean; error?: string; emailed?: boolean; deliveryStatus?: 'failed' | 'provider_accepted'; detail?: AgreementDetail }> {
  const admin = await requireAdmin()
  const found = await customerAndTermsForLink(linkId)
  if (!found) return { ok: false, error: 'Customer not found.' }
  const parsed = termsFromForm(form, found.terms.type)
  if (!parsed.ok) return { ok: false, error: parsed.error }
  let addresses: ReturnType<typeof deliveryAddresses>
  try { addresses = deliveryAddresses(delivery, found.customer.email) }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Invalid email addresses.' } }

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
      signerDeliveryEmail: addresses.signerEmail,
      copyEmails: addresses.copyEmails,
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
  await supersedeInitialInvitation(linkId)
  const sent = await emailSignRequest(fresh, !first)
  revalidatePath('/admin/agreements')
  revalidatePath(`/admin/payments/${linkId}`)
  return { ok: true, emailed: sent.accepted, deliveryStatus: sent.accepted ? 'provider_accepted' : 'failed', detail: await toDetail(fresh) }
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
  const parsed = termsFromForm(form, loaded.terms?.type)
  if (!parsed.ok) return { ok: false, error: parsed.error }
  let next: LoadedAgreement
  try {
    next = await addVersion(loaded, parsed.value, { id: admin.userId, name: admin.name || admin.email })
  } catch (err) {
    if (err instanceof AgreementConflictError) return { ok: false, error: err.message }
    throw err
  }
  if (next.agreement.currentVersion !== loaded.agreement.currentVersion)
    await supersedeInitialInvitation(loaded.agreement.linkId)
  revalidatePath('/admin/agreements')
  revalidatePath(`/admin/agreements/${id}`)
  revalidatePath(`/admin/payments/${loaded.agreement.linkId}`)
  return { ok: true, detail: await toDetail(next) }
}

/** Re-send the signing link (extends the expiry). */
export async function resendAgreement(id: string, delivery?: { signerEmail?: string; copyEmails?: string[] }): Promise<{ ok: boolean; error?: string; emailed?: boolean; deliveryStatus?: 'failed' | 'provider_accepted' }> {
  const admin = await requireAdmin()
  const loaded = await loadAgreementById(id)
  if (!loaded) return { ok: false, error: 'Agreement not found.' }
  if (isSigned(loaded.agreement)) return { ok: false, error: 'This agreement is already signed.' }
  let addresses: ReturnType<typeof deliveryAddresses>
  try { addresses = deliveryAddresses(delivery, loaded.agreement.signerDeliveryEmail ?? loaded.customer.email) }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Invalid email addresses.' } }
  await supersedeInitialInvitation(loaded.agreement.linkId)
  const now = new Date()
  await db
    .update(agreementsTable)
    .set({
      status: loaded.agreement.status === 'draft' ? 'sent' : loaded.agreement.status,
      sentAt: loaded.agreement.sentAt ?? now,
      sentById: loaded.agreement.sentById ?? admin.userId,
      sentByName: loaded.agreement.sentByName ?? (admin.name || admin.email),
      lastSentAt: now,
      signerDeliveryEmail: addresses.signerEmail,
      copyEmails: delivery?.copyEmails ? addresses.copyEmails : loaded.agreement.copyEmails,
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
  const result = fresh ? await emailSignRequest(fresh, Boolean(loaded.agreement.sentAt)) : null
  revalidatePath(`/admin/agreements/${id}`)
  return { ok: true, emailed: result?.accepted ?? false, deliveryStatus: result?.accepted ? 'provider_accepted' : 'failed' }
}

// ── Admin: hub & detail ────────────────────────────────────────────

export async function listAgreements(): Promise<AgreementSummary[]> {
  const admin = await requireAdmin()
  const rows = await db
    .select({ agreement: agreementsTable, customer: customersTable, repName: paymentLinkTermsTable.repName })
    .from(agreementsTable)
    .innerJoin(customersTable, eq(customersTable.id, agreementsTable.customerId))
    .leftJoin(paymentLinkTermsTable, eq(paymentLinkTermsTable.linkId, agreementsTable.linkId))
    .where(notificationScope(admin, 'customers'))
    .orderBy(desc(agreementsTable.lastActivityAt))
  return rows.map((r) => toSummary(r.agreement, r.customer, r.repName))
}

export async function getAgreementDetail(id: string): Promise<AgreementDetail | null> {
  const admin = await requireAdmin()
  if (!await canAccessNotificationAgreement(admin, id)) return null
  const loaded = await loadAgreementById(id)
  return loaded ? toDetail(loaded) : null
}

/** Agreement state for the customer record (payment detail page). */
export async function getAgreementForLink(linkId: string): Promise<AgreementSummary | null> {
  await requireAdmin()
  const loaded = await loadAgreementByLink(linkId)
  return loaded ? (await toDetail(loaded)).agreement : null
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
  if (!found || found.terms.type !== 'subscription') return null
  const terms: AgreementTermsInput = {
    termMonths: found.terms.termMonths || AGREEMENT_DEFAULTS.termMonths,
    monthlyCents: found.terms.monthlyCents || AGREEMENT_DEFAULTS.monthlyCents,
    setupFeeCents: found.terms.monthlyCents > 0 ? found.terms.setupFeeCents : AGREEMENT_DEFAULTS.setupFeeCents,
    body: found.terms.enrollmentFlow ? CALENDAR_AGREEMENT_BODY : DEFAULT_AGREEMENT_BODY,
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
    offer_type: loaded.terms?.type ?? 'subscription',
    enrollment_flow: loaded.terms?.enrollmentFlow ?? false,
    pdf_ready: Boolean(a.pdfPath),
    delivery_status: a.status === 'completed' ? await completionDeliveryStatus(loaded) : [],
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

/** Loading data is not evidence of an actual screen display. */
export async function getAgreementPublic(token: string): Promise<PublicAgreement | null> {
  const loaded = await loadAgreementByToken(token)
  return loaded ? toPublic(loaded) : null
}

/** Explicit acknowledgment after rendered document + trusted human interaction.
 * A shared link establishes no viewer identity. Staff previews do not count.
 */
export async function acknowledgeAgreementDisplay(token: string, version: number) {
  if (await getAdminSession()) return { ok: true }
  const loaded = await loadAgreementByToken(token)
  if (!loaded || isExpired(loaded.agreement) || loaded.agreement.signedAt ||
    loaded.agreement.currentVersion !== version) return { ok: false }
  const a = loaded.agreement
  const fingerprint = requestFingerprint()
  await db.transaction(async tx => {
    const [ack] = await tx.update(agreementsTable).set({
      displayAcknowledgedAt: new Date(),
      viewedAt: sql`coalesce(${agreementsTable.viewedAt}, now())`,
      status: sql`case when ${agreementsTable.status} in ('sent','draft') then 'viewed' else ${agreementsTable.status} end`,
      updatedAt: new Date(),
    }).where(and(eq(agreementsTable.id, a.id), eq(agreementsTable.currentVersion, version),
      isNull(agreementsTable.displayAcknowledgedAt), isNull(agreementsTable.signedAt),
      loaded.terms?.enrollmentFlow ? sql`true` : isNull(agreementsTable.viewedAt))).returning()
    if (ack) await tx.insert(agreementEventsTable).values({
      id: newId(), agreementId: a.id, type: 'viewed', version,
      ip: fingerprint.ip, userAgent: fingerprint.userAgent,
      actor: 'customer', detail: { source: 'display_acknowledged', viewerIdentity: 'unknown_shared_link' },
    })
  })
  return { ok: true }
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
  if (loaded.terms.enrollmentFlow) return { ok: false, error: 'Use the enrollment card flow for this agreement.' }
  if (!isSigned(loaded.agreement) && isExpired(loaded.agreement)) return { ok: false, error: 'This signing link has expired.' }
  const checkout = await getTwoCardCheckoutState(loaded.terms.token)
  if (!checkout) return { ok: false, error: 'The subscription link for this agreement is no longer active.' }
  return { ok: true, checkout }
}

export async function recordAgreementPrimaryCard(token: string) {
  const loaded = await loadAgreementByToken(token)
  if (!loaded || !loaded.terms) return { ok: false, error: 'This agreement link is not valid.' }
  if (loaded.terms.enrollmentFlow) return { ok: false, error: 'Use the enrollment card flow for this agreement.' }
  const res = await recordPrimaryCard(loaded.terms.token)
  if (!res.ok && res.error) await onPaymentFailed(loaded.agreement.linkId, res.error)
  return res
}

export async function recordAgreementSecondaryCard(token: string) {
  const loaded = await loadAgreementByToken(token)
  if (!loaded || !loaded.terms) return { ok: false, error: 'This agreement link is not valid.' }
  if (loaded.terms.enrollmentFlow) return { ok: false, error: 'Use the enrollment card flow for this agreement.' }
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

export const getEnrollmentCheckout = enrollmentCheckout
export const recordEnrollmentCard = saveEnrollmentCard
export const replaceEnrollmentCard = replaceEnrollmentPaymentCard
export const confirmEnrollment = confirmEnrollmentPayment
export const reconcileEnrollment = reconcileEnrollmentPayment

export async function retryAgreementCompletion(id: string) {
  await requireAdmin()
  try {
    await retryCompletionDelivery(id)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not retry document delivery.' }
  }
}

export async function retryEnrollmentDelivery(token: string) {
  const loaded = await loadAgreementByToken(token)
  if (!loaded?.terms?.enrollmentFlow || loaded.agreement.status !== 'completed')
    return { ok: false, error: 'Enrollment is not complete.' }
  try {
    await retryCompletionDelivery(loaded.agreement.id)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not retry document delivery.' }
  }
}
