import { attachCustomerReferral } from '@/lib/affiliates/attribution'
import { queueAffiliateHistory } from '@/lib/affiliates/ledger'
import { revalidatePath } from 'next/cache'
import { canDeleteLink, cleanCustomer, type CustomerInput } from '@/lib/billing/rules'

import { requireAdmin } from '@/lib/auth/admin-session'
import { requireSeller, scopedProspect, assertSellerLink, audit as resellerAudit } from '@/lib/resellers/store'
import { assertPrices, type StandardPrices } from '@/lib/resellers/policy'
import { getAdminClient } from '@/lib/supabase/admin'
import { getStripeMode, stripe } from '@/lib/stripe'
import { cardFromIntent, recordHistory } from '@/lib/billing/dunning'
import { MAX_STAFF } from '@workspace/shared/types'
import { sendPaymentReceivedEmail, sendPortalWelcomeEmail } from '@/lib/mail'
import {
  customerCardsTable,
  customersTable,
  db,
  paymentHistoryTable,
  paymentLinkTermsTable,
  enrollmentInvitationsTable,
  type Customer,
  type CustomerCard,
  type PaymentHistory,
  type PaymentLinkTerms,
} from '@workspace/db'
import { createHash, randomBytes } from 'crypto'
import { inviteEnrollment, type InvitationOutcome } from '@/lib/agreements/enrollment-invitation'
import { linkSalesCustomerInTransaction } from '@/lib/sales-leads/conversion'
import { transaction } from '@/lib/sales-leads/store'
import { drizzle } from 'drizzle-orm/node-postgres'
import { logger } from '@/lib/logger'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'

export const PRODUCT_NAME = 'Reactivation Power Access'

export interface StaffMember {
  name: string
  email: string
}

export interface PaymentLink {
  id: string
  token: string
  name: string
  email: string
  phone: string | null
  staff: StaffMember[]
  amount_cents: number
  status: 'pending' | 'paid'
  paid_at: string | null
  created_at: string
  participant_id: string | null
  provisioned_at: string | null
  // ── Billing terms (drizzle tables, null for legacy links) ──
  type: 'one_time' | 'subscription'
  customer_id: string | null
  rep_id: string | null
  rep_name: string | null
  setup_fee_cents: number
  monthly_cents: number
  setup_paid_at: string | null
  stripe_subscription_id: string | null
  subscription_status: string | null
  next_payment_at: string | null
  agreement_start: string | null
  agreement_end: string | null
  completed_at: string | null
  /** Scheduled cancellation (end of term), if any. */
  cancel_at: string | null
  canceled_at: string | null
  /** Where a subscription link is in its checkout. */
  stage: 'primary' | 'secondary' | 'done'
  business_name: string | null
  enrollment_flow: boolean
}

export type { CustomerInput } from '@/lib/billing/rules'

export type OfferInput =
  | { type: 'one_time'; amountDollars: number }
  | { type: 'subscription'; monthlyDollars: number; setupFeeDollars: number }

export interface CardOnFile {
  id: string
  brand: string
  last4: string
  exp_month: number | null
  exp_year: number | null
  rank: 'primary' | 'secondary'
  active: boolean
}

export interface CustomerRecord {
  id: string
  full_name: string
  business_name: string
  business_address: string
  phone: string
  owner_name: string
  owner_phone: string
  email: string
  stripe_customer_id: string | null
  billing_status: string
  billing_blocked_at: string | null
  billing_issue: string | null
  participant_id: string | null
  created_by_name: string | null
}

/** One row of the customer's billing ledger (charges, refunds, changes). */
export interface PaymentHistoryEntry {
  id: string
  kind: PaymentHistory['kind']
  status: PaymentHistory['status']
  amount_cents: number
  currency: string
  description: string
  failure_message: string | null
  card_rank: string | null
  card_brand: string | null
  card_last4: string | null
  stripe_invoice_id: string | null
  stripe_payment_intent_id: string | null
  stripe_charge_id: string | null
  stripe_refund_id: string | null
  source: PaymentHistory['source']
  actor_admin_name: string | null
  occurred_at: string
  /** Cents still refundable on this charge (only for successful charges). */
  refundable_cents: number
}

const LINK_COLUMNS =
  'id, token, name, email, phone, staff, amount_cents, status, paid_at, created_at, participant_id, provisioned_at'

/** A provisioned portal account shown on the payment detail page. */
export interface ProvisionedAccount {
  id: string
  first_name: string
  last_name: string
  email: string
  role: 'owner' | 'staff'
  is_active: boolean
}

function sanitizeStaff(input: unknown): StaffMember[] {
  if (!Array.isArray(input)) return []
  return input
    .slice(0, 5)
    .map((s) => ({
      name: String((s as StaffMember)?.name ?? '').trim().slice(0, 120),
      email: String((s as StaffMember)?.email ?? '').trim().slice(0, 254),
    }))
    .filter((s) => s.name || s.email)
}

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null)

function stageOf(t: PaymentLinkTerms | undefined): PaymentLink['stage'] {
  if (!t || t.type !== 'subscription') return t?.completedAt ? 'done' : 'primary'
  if (t.completedAt) return 'done'
  if (t.setupPaidAt) return 'secondary'
  return 'primary'
}

function toCustomerRecord(c: Customer): CustomerRecord {
  return {
    id: c.id,
    full_name: c.fullName,
    business_name: c.businessName,
    business_address: c.businessAddress,
    phone: c.phone,
    owner_name: c.ownerName,
    owner_phone: c.ownerPhone,
    email: c.email,
    stripe_customer_id: c.stripeCustomerId,
    billing_status: c.billingStatus,
    billing_blocked_at: iso(c.billingBlockedAt),
    billing_issue: c.billingIssue,
    participant_id: c.participantId,
    created_by_name: c.createdByName,
  }
}

export function toHistoryEntry(h: PaymentHistory, refundedCents = 0): PaymentHistoryEntry {
  return {
    id: h.id,
    kind: h.kind,
    status: h.status,
    amount_cents: h.amountCents,
    currency: h.currency,
    description: h.description,
    failure_message: h.failureMessage,
    card_rank: h.cardRank,
    card_brand: h.cardBrand,
    card_last4: h.cardLast4,
    stripe_invoice_id: h.stripeInvoiceId,
    stripe_payment_intent_id: h.stripePaymentIntentId,
    stripe_charge_id: h.stripeChargeId,
    stripe_refund_id: h.stripeRefundId,
    source: h.source,
    actor_admin_name: h.actorAdminName,
    occurred_at: h.occurredAt.toISOString(),
    refundable_cents: h.status === 'succeeded' && h.stripeChargeId ? Math.max(0, h.amountCents - refundedCents) : 0,
  }
}

function toCardOnFile(c: CustomerCard): CardOnFile {
  return {
    id: c.id,
    brand: c.brand,
    last4: c.last4,
    exp_month: c.expMonth,
    exp_year: c.expYear,
    rank: c.rank,
    active: c.active,
  }
}

/** Combine Supabase link rows with their billing terms + customer. */
async function mergeLinks(rows: Record<string, unknown>[]): Promise<PaymentLink[]> {
  const ids = rows.map((r) => String(r.id))
  const terms = ids.length
    ? await db.select().from(paymentLinkTermsTable).where(inArray(paymentLinkTermsTable.linkId, ids))
    : []
  const termsById = new Map(terms.map((t) => [t.linkId, t]))
  const customerIds = [...new Set(terms.map((t) => t.customerId))]
  const customers = customerIds.length
    ? await db.select().from(customersTable).where(inArray(customersTable.id, customerIds))
    : []
  const customerById = new Map(customers.map((c) => [c.id, c]))
  return rows.map((r) => {
    const t = termsById.get(String(r.id))
    const c = t ? customerById.get(t.customerId) : undefined
    return {
      ...(r as unknown as PaymentLink),
      type: t?.type ?? 'one_time',
      customer_id: t?.customerId ?? null,
      rep_id: t?.repId ?? null,
      rep_name: t?.repName ?? null,
      setup_fee_cents: t?.setupFeeCents ?? 0,
      monthly_cents: t?.monthlyCents ?? 0,
      setup_paid_at: iso(t?.setupPaidAt),
      stripe_subscription_id: t?.stripeSubscriptionId ?? null,
      subscription_status: t?.subscriptionStatus ?? null,
      next_payment_at: iso(t?.nextPaymentAt),
      agreement_start: iso(t?.agreementStart),
      agreement_end: iso(t?.agreementEnd),
      completed_at: iso(t?.completedAt),
      cancel_at: iso(t?.cancelAt),
      canceled_at: iso(t?.canceledAt),
      stage: stageOf(t),
      business_name: c?.businessName || null,
      enrollment_flow: t?.enrollmentFlow ?? false,
    }
  })
}

/** Split a single display name into first / last for the participants table. */
function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { first: 'Customer', last: '' }
  if (parts.length === 1) return { first: parts[0], last: '' }
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] }
}

/**
 * Turn a paid link into portal accounts: the buyer becomes an owner
 * (viewer) and each staff member becomes a staff account under them.
 *
 * Idempotent and non-fatal — an account that already exists for an email
 * is reused rather than duplicated, and any failure here is logged
 * without disturbing the payment record itself.
 */
export async function provisionAccounts(linkId: string): Promise<string | null> {
  const supabase = getAdminClient()
  const { data: link } = await supabase
    .from('payment_links')
    .select('id, name, email, phone, staff, participant_id')
    .eq('id', linkId)
    .maybeSingle()
  if (!link) return null
  if (link.participant_id) return link.participant_id as string

  const email = String(link.email).toLowerCase()
  const { first, last } = splitName(String(link.name))

  // Reuse an existing account with this email instead of duplicating
  const { data: existing } = await supabase
    .from('participants')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  let ownerId = existing?.id as string | undefined
  if (!ownerId) {
    const { data: created, error } = await supabase
      .from('participants')
      .insert({
        first_name: first,
        last_name: last,
        email,
        phone: link.phone ?? null,
        role: 'owner',
      })
      .select('id')
      .single()
    if (error || !created) {
      console.error('[v0] provision owner failed:', error?.message)
      return null
    }
    ownerId = created.id
    // Enrollment-flow owners get the "account active" email instead (sent
    // after every completed enrollment, new account or not), not both.
    const [terms] = await db.select({ enrollmentFlow: paymentLinkTermsTable.enrollmentFlow })
      .from(paymentLinkTermsTable).where(eq(paymentLinkTermsTable.linkId, linkId))
    if (!terms?.enrollmentFlow) {
      await sendPortalWelcomeEmail({
        participantId: created.id,
        firstName: first,
        email,
        role: 'owner',
        source: 'payment',
      })
    }
  }

  // Staff members become sub-accounts under the owner
  const staff = sanitizeStaff(link.staff).filter((s) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email),
  )
  for (const member of staff.slice(0, MAX_STAFF)) {
    const staffEmail = member.email.toLowerCase()
    const { data: dupe } = await supabase
      .from('participants')
      .select('id')
      .eq('email', staffEmail)
      .maybeSingle()
    if (dupe) continue
    const staffName = splitName(member.name || staffEmail.split('@')[0])
    const { data: staffRow, error } = await supabase
      .from('participants')
      .insert({
        first_name: staffName.first,
        last_name: staffName.last,
        email: staffEmail,
        parent_id: ownerId,
        role: 'staff',
      })
      .select('id')
      .single()
    if (error || !staffRow) {
      console.error('[v0] provision staff failed:', error?.message)
      continue
    }
    await sendPortalWelcomeEmail({
      participantId: staffRow.id,
      firstName: staffName.first,
      email: staffEmail,
      role: 'staff',
      ownerName: String(link.name),
      source: 'payment',
    })
  }

  await supabase
    .from('payment_links')
    .update({
      participant_id: ownerId,
      provisioned_at: new Date().toISOString(),
    })
    .eq('id', link.id)

  // The billing gate resolves a portal login to its customer through this id.
  if (ownerId) {
    const [terms] = await db
      .select({ customerId: paymentLinkTermsTable.customerId })
      .from(paymentLinkTermsTable)
      .where(eq(paymentLinkTermsTable.linkId, String(link.id)))
      .limit(1)
    if (terms) {
      await db
        .update(customersTable)
        .set({ participantId: ownerId, updatedAt: new Date() })
        .where(eq(customersTable.id, terms.customerId))
    }
  }

  revalidatePath('/admin/participants')
  return ownerId ?? null
}

function toCents(dollars: unknown): number {
  return Math.round(Number(dollars) * 100)
}

/** Find the customer with this email or create one; refresh details either way. */
async function upsertCustomer(
  c: CustomerInput,
  rep: { userId: string; name: string | null; email: string },
  connection: Pick<typeof db, 'select' | 'update' | 'insert'> = db,
): Promise<Customer> {
  const fields = {
    fullName: c.fullName,
    businessName: c.businessName,
    businessAddress: c.businessAddress,
    phone: c.phone,
    ownerName: c.ownerName,
    ownerPhone: c.ownerPhone,
    email: c.email,
    updatedAt: new Date(),
  }
  const matches = await connection.select().from(customersTable).where(sql`lower(trim(${customersTable.email}))=${c.email}`).limit(2)
  if (matches.length > 1) throw new Error('Multiple customers match this email. Resolve the duplicate records before enrollment.')
  const [existing] = matches
  if (existing) {
    const [updated] = await connection
      .update(customersTable)
      .set(fields)
      .where(eq(customersTable.id, existing.id))
      .returning()
    return updated
  }
  const [created] = await connection
    .insert(customersTable)
    .values({
      id: randomBytes(16).toString('hex'),
      ...fields,
      createdById: rep.userId,
      createdByName: rep.name || rep.email,
    })
    .returning()
  return created
}

/**
 * Create a customer record plus a payment link with a unique, unguessable
 * token. The link is attributed to the signed-in admin (the rep).
 */
export async function createPaymentLink(input: {
  customer: CustomerInput
  staff?: StaffMember[]
  offer: OfferInput
  requestId?: string
  salesLeadId?: string
  existingCustomerId?: string
  resellerProspectId?: string
}): Promise<{ ok: boolean; error?: string; link?: PaymentLink; invitation?: InvitationOutcome }> {
  const rep = await requireSeller()
  if (rep.companyId && (!input.resellerProspectId || input.salesLeadId || input.existingCustomerId))
    throw new Error('Create reseller offers from an assigned prospect.')
  if (input.requestId != null && !/^[0-9a-f-]{36}$/i.test(input.requestId))
    return { ok: false, error: 'Invalid creation request. Reopen New Customer.' }

  const cleaned = cleanCustomer(input.customer)
  if (!cleaned.ok) return { ok: false, error: cleaned.error }
  const customerInput = cleaned.value

  const offer = input.offer
  let amountCents: number
  let setupFeeCents = 0
  let monthlyCents = 0
  if (offer?.type === 'subscription') {
    monthlyCents = toCents(offer.monthlyDollars)
    setupFeeCents = toCents(offer.setupFeeDollars)
    if (!Number.isFinite(monthlyCents) || monthlyCents < 50)
      return { ok: false, error: 'Monthly amount must be at least $0.50.' }
    if (!Number.isFinite(setupFeeCents) || setupFeeCents < 0)
      return { ok: false, error: 'Setup fee cannot be negative.' }
    if (setupFeeCents > 0 && setupFeeCents < 50)
      return { ok: false, error: 'Setup fee must be $0 (waived) or at least $0.50.' }
    if (monthlyCents > 99999999 || setupFeeCents > 99999999)
      return { ok: false, error: 'Amount is too large.' }
    // Supabase's payment_links.amount_cents must be > 0; payment_link_terms is
    // the source of truth for subscription amounts, so for a waived setup fee
    // we store the monthly amount here purely to satisfy that constraint.
    amountCents = setupFeeCents > 0 ? setupFeeCents : monthlyCents
  } else if (offer?.type === 'one_time') {
    amountCents = toCents(offer.amountDollars)
    if (!Number.isFinite(amountCents) || amountCents < 50)
      return { ok: false, error: 'Amount must be at least $0.50.' }
    if (amountCents > 99999999) return { ok: false, error: 'Amount is too large.' }
  } else {
    return { ok: false, error: 'Choose full price or subscription.' }
  }

  // A request key survives lost responses. Atomic creation and a database lock
  // prevent duplicate links across workers, without deduplicating genuine new offers.
  const token = input.requestId
    ? createHash('sha256').update(`${rep.userId}:${input.requestId}`).digest('base64url')
    : randomBytes(32).toString('base64url')
  let data: Record<string, unknown>
  try {
    data = await transaction(async client => {
      const tx = drizzle(client)
      let lead: Record<string, any> | undefined
      const prospect = input.resellerProspectId ? await scopedProspect(rep, input.resellerProspectId, client, true) : null
      if (prospect) {
        const company = (await client.query('SELECT * FROM reseller_companies WHERE id=$1 FOR SHARE', [prospect.company_id])).rows[0]
        if (!company || company.terminated_at) throw new Error('This reseller relationship has ended.')
        const member = (await client.query('SELECT active FROM reseller_members WHERE user_id=$1 FOR SHARE', [prospect.salesperson_id])).rows[0]
        const actingMember = rep.companyId ? (await client.query('SELECT active FROM reseller_members WHERE user_id=$1 FOR SHARE', [rep.userId])).rows[0] : null
        if (!member?.active || (rep.companyId && !actingMember?.active)) throw new Error('This reseller member is deactivated.')
        if (prospect.do_not_contact || ['Lost','Do Not Contact'].includes(prospect.stage)) throw new Error('This prospect is closed to enrollment.')
        if (prospect.email.toLowerCase() !== customerInput.email) throw new Error('Enrollment email must match the reseller prospect.')
      }
      if (input.salesLeadId) {
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`sales-send:${input.salesLeadId}`])
        lead = (await client.query('SELECT * FROM sales_leads WHERE id=$1 FOR UPDATE', [input.salesLeadId])).rows[0]
        if (!lead) throw new Error('Lead not found')
        if (lead.email && lead.email.trim().toLowerCase() !== customerInput.email) throw new Error('Enrollment email must match the selected lead. Update the lead first.')
      }
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`new-customer-${token}`}))`)
      const existing = await tx.execute(sql`SELECT * FROM payment_links WHERE token = ${token}`)
      if (existing.rows[0]) {
        const row = existing.rows[0] as Record<string, unknown>
        if (row.email !== customerInput.email) throw new Error('This request already belongs to a different email')
        const [terms] = await tx.select().from(paymentLinkTermsTable).where(eq(paymentLinkTermsTable.linkId, String(row.id)))
        if (!terms || (input.existingCustomerId && terms.customerId !== input.existingCustomerId)) throw new Error('Saved customer identity does not match')
        if (prospect) {
          const sale = (await client.query('SELECT * FROM reseller_sales WHERE link_id=$1', [String(row.id)])).rows[0]
          if (!sale || sale.prospect_id !== prospect.id) throw new Error('Saved reseller attribution does not match.')
        }
        if (lead) await linkSalesCustomerInTransaction(client, input.salesLeadId!, terms.customerId, customerInput.email, rep)
        return row
      }
      if (lead?.customer_id) throw new Error('This lead is already linked. Open its customer record to continue enrollment or explicitly create another offer.')
      if (lead?.stage === 'Lost/Do Not Contact') throw new Error('This lead is closed to enrollment')
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`customer-email-${customerInput.email}`}))`)
      const matches = (await client.query('SELECT id FROM customers WHERE lower(trim(email))=$1', [customerInput.email])).rows
      if (prospect && matches.some(c => c.id !== prospect.customer_id))
        throw new Error('Customer identity conflict. The owner must review and explicitly resolve attribution before selling.')
      if (!prospect && matches.length && (await client.query('SELECT 1 FROM reseller_sales WHERE customer_id=ANY($1::text[]) LIMIT 1',
        [matches.map(c => c.id)])).rowCount) throw new Error('Use the reseller prospect to create an offer for this customer.')
      const standard: StandardPrices | undefined = prospect
        ? (await client.query('SELECT * FROM reseller_prices WHERE singleton=true FOR SHARE')).rows[0] : undefined
      if (prospect) assertPrices(standard, offer.type, offer.type === 'one_time' ? amountCents : 0, monthlyCents, setupFeeCents)
      if (input.existingCustomerId) {
        const [expected] = await tx.select().from(customersTable).where(eq(customersTable.id, input.existingCustomerId))
        if (!expected || expected.email.trim().toLowerCase() !== customerInput.email) throw new Error('Customer identity changed. Reopen setup from the customer record.')
      }
      const customer = await upsertCustomer(customerInput, rep, tx)
      const inserted = await tx.execute(sql`INSERT INTO payment_links
        (token, name, email, phone, staff, amount_cents)
        VALUES (${token}, ${customerInput.fullName}, ${customerInput.email},
          ${customerInput.phone || null}, ${JSON.stringify(sanitizeStaff(input.staff))}::jsonb, ${amountCents})
        RETURNING *`)
      const row = inserted.rows[0] as Record<string, unknown>
      await tx.insert(paymentLinkTermsTable).values({
        linkId: String(row.id), token, customerId: customer.id, type: offer.type,
        repId: prospect ? null : rep.userId, repName: prospect ? null : rep.name || rep.email, setupFeeCents, monthlyCents,
        billingAnchor: offer.type === 'subscription' ? 'calendar_month' : 'thirty_days',
        enrollmentFlow: true, enrollmentStripeMode: getStripeMode(), stripeCustomerId: customer.stripeCustomerId,
      })
      // Commit the delivery intent WITH the offer. A crash before agreement
      // creation must still leave a recoverable queue entry, not a lost email.
      await tx.insert(enrollmentInvitationsTable).values({
        linkId: String(row.id), recipient: customer.email,
      })
      if (prospect && standard) {
        await client.query(`INSERT INTO reseller_sales(link_id,company_id,salesperson_id,prospect_id,customer_id,
          price_version,standard_lifetime_cents,standard_monthly_cents,standard_setup_cents,
          quoted_lifetime_cents,quoted_monthly_cents,quoted_setup_cents) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [String(row.id), prospect.company_id, prospect.salesperson_id, prospect.id, customer.id, standard.version,
          standard.lifetime_cents, standard.monthly_cents, standard.setup_cents, offer.type === 'one_time' ? amountCents : 0, monthlyCents, setupFeeCents])
        await client.query(`UPDATE reseller_prospects SET customer_id=$2,stage='Offer',revision=revision+1,updated_at=now() WHERE id=$1`, [prospect.id, customer.id])
        await resellerAudit(client, prospect.company_id, rep.userId, 'offer_created', 'Approved standard-price offer', prospect.id,
          { linkId: String(row.id), priceVersion: standard.version, salespersonId: prospect.salesperson_id })
      }
      if (lead) {
        if (!lead.email) await client.query('UPDATE sales_leads SET email=$2 WHERE id=$1', [input.salesLeadId, customerInput.email])
        await linkSalesCustomerInTransaction(client, input.salesLeadId!, customer.id, customerInput.email, rep)
      }
      return row
    })
  } catch (error) {
    // Only explicit validation messages are surfaced; database details stay private.
    const cause = (error as { cause?: unknown })?.cause ?? error
    logger.warn({ code: (cause as { code?: string })?.code ?? 'validation' }, 'Customer enrollment transaction rejected')
    const message = error instanceof Error && /^(Lead not found|Enrollment email|This request|Saved |This lead|Customer identity|Multiple customers|Selling is|Lifetime discount|Monthly discount|Setup pricing|This reseller|This prospect|Use the reseller)/.test(error.message)
      ? error.message : 'Could not save the customer and offer. No enrollment email was sent.'
    return { ok: false, error: message }
  }

  revalidatePath('/admin/payments')
  revalidatePath('/admin/customers')
  revalidatePath('/admin/leads')
  const [link] = await mergeLinks([data])
  // Attribution owns a separate transaction and must see the committed
  // customer. Creation retries recover it too without duplicating attribution.
  if (link.customer_id) await attachCustomerReferral(link.customer_id, customerInput.email, customerInput.phone)
  const invitation = await retryCustomerEnrollment(String(data.id))
  return { ok: true, link, invitation: invitation.invitation }
}

/** Safe initial-send retry: no customer creation, charge, or explicit resend. */
export async function retryCustomerEnrollment(linkId: string): Promise<{ ok: boolean; invitation: InvitationOutcome }> {
  const rep = await requireSeller()
  await assertSellerLink(rep, linkId)
  try {
  const [terms] = await db.select().from(paymentLinkTermsTable).where(eq(paymentLinkTermsTable.linkId, linkId)).limit(1)
  if (!terms?.enrollmentFlow) return { ok: false, invitation: { status: 'failed', error: 'Enrollment offer not found.' } }
  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, terms.customerId)).limit(1)
  const { data: link } = await getAdminClient().from('payment_links').select('amount_cents').eq('id', linkId).maybeSingle()
  if (!customer || !link) return { ok: false, invitation: { status: 'failed', error: 'Saved customer or offer not found.' } }
  const invitation = await inviteEnrollment({ customer, terms, amountCents: Number(link.amount_cents),
    sender: { id: rep.userId, name: rep.name || rep.email } })
  revalidatePath(`/admin/payments/${linkId}`)
  revalidatePath('/admin/agreements')
  return { ok: true, invitation }
  } catch {
    return { ok: true, invitation: { status: 'failed', error: 'Customer and offer saved. Retry the enrollment email on this record.' } }
  }
}
/** List all payment links, newest first. */
export async function listPaymentLinks(): Promise<PaymentLink[]> {
  await requireAdmin()
  const supabase = getAdminClient()
  const { data } = await supabase
    .from('payment_links')
    .select(LINK_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(200)
  return mergeLinks((data as Record<string, unknown>[]) ?? [])
}

/** Fetch one payment link plus the portal accounts it provisioned. */
export async function getPaymentDetail(id: string): Promise<{
  link: PaymentLink
  accounts: ProvisionedAccount[]
  customer: CustomerRecord | null
  cards: CardOnFile[]
  history: PaymentHistoryEntry[]
} | null> {
  await requireAdmin()
  const supabase = getAdminClient()
  const { data } = await supabase
    .from('payment_links')
    .select(LINK_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (!data) return null
  const [link] = await mergeLinks([data as Record<string, unknown>])

  let customer: CustomerRecord | null = null
  let cards: CardOnFile[] = []
  let history: PaymentHistoryEntry[] = []
  if (link.customer_id) {
    const [c] = await db.select().from(customersTable).where(eq(customersTable.id, link.customer_id)).limit(1)
    if (c) customer = toCustomerRecord(c)
    const cardRows = await db
      .select()
      .from(customerCardsTable)
      .where(and(eq(customerCardsTable.customerId, link.customer_id), eq(customerCardsTable.active, true)))
      .orderBy(customerCardsTable.rank)
    cards = cardRows.map(toCardOnFile)
    const historyRows = await db
      .select()
      .from(paymentHistoryTable)
      .where(eq(paymentHistoryTable.customerId, link.customer_id))
      .orderBy(desc(paymentHistoryTable.occurredAt), desc(paymentHistoryTable.createdAt))
      .limit(200)
    const refundedByCharge = new Map<string, number>()
    for (const h of historyRows) {
      if (h.kind === 'refund' && h.stripeChargeId) {
        refundedByCharge.set(h.stripeChargeId, (refundedByCharge.get(h.stripeChargeId) ?? 0) + h.amountCents)
      }
    }
    history = historyRows.map((h) => toHistoryEntry(h, h.stripeChargeId ? refundedByCharge.get(h.stripeChargeId) ?? 0 : 0))
  }

  let accounts: ProvisionedAccount[] = []
  if (link.participant_id) {
    const { data: rows } = await supabase
      .from('participants')
      .select('id, first_name, last_name, email, role, is_active')
      .or(`id.eq.${link.participant_id},parent_id.eq.${link.participant_id}`)
      .order('role', { ascending: true })
    accounts = (rows as ProvisionedAccount[]) ?? []
  }
  return { link, accounts, customer, cards, history }
}

/** Delete a pending payment link. Paid links are kept as records. */
export async function deletePaymentLink(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin()
  // A subscription link whose setup fee has been charged is no longer just a
  // link: money has moved and a card is on file. Deleting it would strand a
  // paying customer, so it is refused here regardless of what the UI shows.
  const [terms] = await db
    .select({ setupPaidAt: paymentLinkTermsTable.setupPaidAt, completedAt: paymentLinkTermsTable.completedAt })
    .from(paymentLinkTermsTable)
    .where(eq(paymentLinkTermsTable.linkId, id))
    .limit(1)
  if (!canDeleteLink(terms)) {
    return {
      ok: false,
      error: 'This link cannot be deleted: the setup fee has already been charged. Cancel or refund it in Stripe instead.',
    }
  }
  const supabase = getAdminClient()
  const { data: deleted, error } = await supabase
    .from('payment_links')
    .delete()
    .eq('id', id)
    .eq('status', 'pending')
    .select('id')
  if (error) return { ok: false, error: 'Could not delete the link.' }
  if (!deleted || deleted.length === 0) return { ok: false, error: 'Only pending links can be deleted.' }
  await db.delete(paymentLinkTermsTable).where(eq(paymentLinkTermsTable.linkId, id))
  revalidatePath('/admin/payments')
  return { ok: true }
}

/**
 * Start an embedded Stripe Checkout session for a payment link.
 * Used by BOTH the public /pay/[token] page and the admin
 * charge-on-our-end flow — the server always re-reads the amount
 * from the database, so the client can never set the price.
 */
export async function startPaymentCheckout(
  token: string,
): Promise<string | null> {
  const supabase = getAdminClient()
  const { data: link } = await supabase
    .from('payment_links')
    .select('id, token, name, email, amount_cents, status')
    .eq('token', token)
    .maybeSingle()

  if (!link || link.status === 'paid') return null
  const [terms] = await db
    .select({ type: paymentLinkTermsTable.type, enrollmentFlow: paymentLinkTermsTable.enrollmentFlow })
    .from(paymentLinkTermsTable)
    .where(eq(paymentLinkTermsTable.linkId, String(link.id)))
    .limit(1)
  // Subscription links go through the two-card flow in actions/subscriptions.ts
  if (terms?.type === 'subscription' || terms?.enrollmentFlow) return null

  const session = await stripe.checkout.sessions.create(
    {
      ui_mode: 'embedded_page',
      redirect_on_completion: 'never',
      mode: 'payment',
      customer_email: link.email,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: PRODUCT_NAME,
              description: `Reactivation Power access for ${link.name}`,
            },
            unit_amount: link.amount_cents,
          },
          quantity: 1,
        },
      ],
      metadata: { payment_link_token: link.token },
    },
    { idempotencyKey: `pl-${link.id}-${Math.floor(Date.now() / 600000)}` },
  )

  // Remember the most recent session so the thank-you flow can verify it
  await supabase
    .from('payment_links')
    .update({ stripe_session_id: session.id })
    .eq('id', link.id)

  return session.client_secret
}

/**
 * Verify a checkout session's payment status with Stripe and mark the
 * link paid. Called from the checkout completion handler — trusts
 * Stripe's API, never the client.
 */
export async function confirmPayment(
  token: string,
): Promise<{ paid: boolean }> {
  const supabase = getAdminClient()
  const { data: link } = await supabase
    .from('payment_links')
    .select('id, status, stripe_session_id, name, email, amount_cents')
    .eq('token', token)
    .maybeSingle()

  if (!link) return { paid: false }
  if (link.status === 'paid') return { paid: true }
  if (!link.stripe_session_id) return { paid: false }

  try {
    const session = await stripe.checkout.sessions.retrieve(
      link.stripe_session_id,
    )
    if (session.payment_status === 'paid') {
      const paidAt = new Date().toISOString()
      await supabase
        .from('payment_links')
        .update({ status: 'paid', paid_at: paidAt })
        .eq('id', link.id)
      await markOneTimePaid(String(link.id), paidAt, session.payment_intent)
      await sendPaymentReceivedEmail(
        String(link.email),
        {
          name: String(link.name),
          amountCents: Number(link.amount_cents),
          description: PRODUCT_NAME,
          paidAt,
          receiptUrl: await stripeReceiptUrl(session.payment_intent),
        },
        { metadata: { paymentLinkId: link.id, stripeSessionId: session.id } },
      )
      // Payment is recorded first, then the portal accounts are created
      await provisionAccounts(link.id)
      revalidatePath('/admin/payments')
      revalidatePath(`/admin/payments/${link.id}`)
      return { paid: true }
    }
  } catch (err) {
    console.error('[v0] confirmPayment failed:', err)
  }
  return { paid: false }
}

/** Record completion on the billing terms + customer for a one-time link. */
async function markOneTimePaid(
  linkId: string,
  paidAt: string,
  paymentIntent: string | { id: string } | null | undefined,
): Promise<void> {
  try {
    const [terms] = await db
      .update(paymentLinkTermsTable)
      .set({ completedAt: new Date(paidAt), setupPaidAt: new Date(paidAt) })
      .where(eq(paymentLinkTermsTable.linkId, linkId))
      .returning({ customerId: paymentLinkTermsTable.customerId })
    if (terms) {
      await db
        .update(customersTable)
        .set({ billingStatus: 'paid', updatedAt: new Date() })
        .where(eq(customersTable.id, terms.customerId))
      await recordIntentPayment({
        customerId: terms.customerId,
        linkId,
        paymentIntent,
        description: `${PRODUCT_NAME} — full price`,
        occurredAt: new Date(paidAt),
      })
    }
  } catch (err) {
    console.error('[v0] markOneTimePaid failed:', err)
  }
}

/**
 * Ledger row for a one-off PaymentIntent (full-price purchase or setup fee)
 * so it shows in the billing history and can be refunded from the dashboard.
 */
export async function recordIntentPayment(input: {
  customerId: string
  linkId: string
  paymentIntent: string | { id: string } | null | undefined
  description: string
  occurredAt: Date
  cardRank?: 'primary' | 'secondary'
}): Promise<void> {
  const id = typeof input.paymentIntent === 'string' ? input.paymentIntent : input.paymentIntent?.id
  if (!id) return
  try {
    const intent = await stripe.paymentIntents.retrieve(id, { expand: ['latest_charge', 'payment_method'] })
    const used = cardFromIntent(intent)
    const [dupe] = await db
      .select()
      .from(paymentHistoryTable)
      .where(and(eq(paymentHistoryTable.stripePaymentIntentId, intent.id), eq(paymentHistoryTable.status, 'succeeded')))
      .limit(1)
    if (dupe) { await queueAffiliateHistory(dupe); return }
    await recordHistory({
      customerId: input.customerId,
      linkId: input.linkId,
      kind: 'invoice_paid',
      status: 'succeeded',
      amountCents: intent.amount_received || intent.amount,
      currency: intent.currency,
      description: input.description,
      cardRank: input.cardRank ?? null,
      cardBrand: used.brand,
      cardLast4: used.last4,
      stripePaymentMethodId: used.paymentMethodId,
      stripePaymentIntentId: intent.id,
      stripeChargeId: used.chargeId,
      source: 'webhook',
      occurredAt: typeof intent.latest_charge === 'object' && intent.latest_charge?.created
        ? new Date(intent.latest_charge.created * 1000) : input.occurredAt,
    })
  } catch (err) {
    console.error('[v0] recordIntentPayment failed:', err)
  }
}

/** Hosted Stripe receipt for a checkout session's charge, if Stripe has one. */
async function stripeReceiptUrl(
  paymentIntent: string | { id: string } | null | undefined,
): Promise<string | null> {
  const id = typeof paymentIntent === 'string' ? paymentIntent : paymentIntent?.id
  if (!id) return null
  try {
    const intent = await stripe.paymentIntents.retrieve(id, { expand: ['latest_charge'] })
    const charge = intent.latest_charge
    return charge && typeof charge !== 'string' ? (charge.receipt_url ?? null) : null
  } catch (err) {
    console.error('[v0] receipt lookup failed:', err)
    return null
  }
}

/**
 * Admin: retry account creation for a paid link. Useful if the buyer's
 * email collided with an existing account or the first attempt failed.
 */
export async function provisionAccountsNow(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin()
  const ownerId = await provisionAccounts(id)
  if (!ownerId) return { ok: false, error: 'Could not create the accounts.' }
  revalidatePath(`/admin/payments/${id}`)
  return { ok: true }
}

/** Public: fetch the details a payer needs to see on the checkout page. */
export async function getPaymentLinkPublic(token: string): Promise<{
  name: string
  amountCents: number
  status: 'pending' | 'paid'
  type: 'one_time' | 'subscription'
  setupFeeCents: number
  monthlyCents: number
  stage: 'primary' | 'secondary' | 'done'
  businessName: string | null
  nextPaymentAt: string | null
  agreementStart: string | null
  agreementEnd: string | null
  enrollmentFlow: boolean
} | null> {
  const supabase = getAdminClient()
  const { data } = await supabase
    .from('payment_links')
    .select(LINK_COLUMNS)
    .eq('token', token)
    .maybeSingle()
  if (!data) return null
  const [link] = await mergeLinks([data as Record<string, unknown>])
  return {
    name: link.name,
    amountCents: link.amount_cents,
    status: link.status,
    type: link.type,
    setupFeeCents: link.setup_fee_cents,
    monthlyCents: link.monthly_cents,
    stage: link.stage,
    businessName: link.business_name,
    nextPaymentAt: link.next_payment_at,
    agreementStart: link.agreement_start,
    agreementEnd: link.agreement_end,
    enrollmentFlow: link.enrollment_flow,
  }
}
