'use server'

import { randomBytes } from 'crypto'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'

import { ADMIN_COOKIE_NAME, decodeAdminSession } from '@/lib/auth/admin-token'
import { getAdminClient } from '@/lib/supabase/admin'
import { stripe } from '@/lib/stripe'
import { MAX_STAFF } from '@/lib/types'

const PRODUCT_NAME = 'Reactivation Power Access'

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

async function requireAdmin(): Promise<void> {
  const store = await cookies()
  const token = store.get(ADMIN_COOKIE_NAME)?.value
  if (!token || !decodeAdminSession(token)) {
    throw new Error('Unauthorized')
  }
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
async function provisionAccounts(linkId: string): Promise<string | null> {
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
    const { error } = await supabase.from('participants').insert({
      first_name: staffName.first,
      last_name: staffName.last,
      email: staffEmail,
      parent_id: ownerId,
      role: 'staff',
    })
    if (error) console.error('[v0] provision staff failed:', error.message)
  }

  await supabase
    .from('payment_links')
    .update({
      participant_id: ownerId,
      provisioned_at: new Date().toISOString(),
    })
    .eq('id', link.id)

  revalidatePath('/admin/participants')
  return ownerId ?? null
}

/** Create a payment link with a unique, unguessable token. */
export async function createPaymentLink(input: {
  name: string
  email: string
  phone?: string
  staff?: StaffMember[]
  amountDollars: number
}): Promise<{ ok: boolean; error?: string; link?: PaymentLink }> {
  await requireAdmin()

  const name = input.name?.trim().slice(0, 120)
  const email = input.email?.trim().slice(0, 254)
  const phone = input.phone?.trim().slice(0, 32) || null
  const amountCents = Math.round(Number(input.amountDollars) * 100)

  if (!name) return { ok: false, error: 'Name is required.' }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { ok: false, error: 'A valid email is required.' }
  if (!Number.isFinite(amountCents) || amountCents < 50)
    return { ok: false, error: 'Amount must be at least $0.50.' }
  if (amountCents > 99999999)
    return { ok: false, error: 'Amount is too large.' }

  const token = randomBytes(16).toString('base64url')
  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from('payment_links')
    .insert({
      token,
      name,
      email,
      phone,
      staff: sanitizeStaff(input.staff),
      amount_cents: amountCents,
    })
    .select(LINK_COLUMNS)
    .single()
  if (error || !data) {
    console.error('[v0] createPaymentLink failed:', error?.message)
    return { ok: false, error: 'Could not create the payment link.' }
  }
  revalidatePath('/admin/payments')
  return { ok: true, link: data as unknown as PaymentLink }
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
  return (data as unknown as PaymentLink[]) ?? []
}

/** Fetch one payment link plus the portal accounts it provisioned. */
export async function getPaymentDetail(id: string): Promise<{
  link: PaymentLink
  accounts: ProvisionedAccount[]
} | null> {
  await requireAdmin()
  const supabase = getAdminClient()
  const { data } = await supabase
    .from('payment_links')
    .select(LINK_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (!data) return null
  const link = data as unknown as PaymentLink

  let accounts: ProvisionedAccount[] = []
  if (link.participant_id) {
    const { data: rows } = await supabase
      .from('participants')
      .select('id, first_name, last_name, email, role, is_active')
      .or(`id.eq.${link.participant_id},parent_id.eq.${link.participant_id}`)
      .order('role', { ascending: true })
    accounts = (rows as ProvisionedAccount[]) ?? []
  }
  return { link, accounts }
}

/** Delete a pending payment link. Paid links are kept as records. */
export async function deletePaymentLink(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin()
  const supabase = getAdminClient()
  const { error } = await supabase
    .from('payment_links')
    .delete()
    .eq('id', id)
    .eq('status', 'pending')
  if (error) return { ok: false, error: 'Could not delete the link.' }
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
    .select('id, status, stripe_session_id')
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
      await supabase
        .from('payment_links')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', link.id)
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
} | null> {
  const supabase = getAdminClient()
  const { data } = await supabase
    .from('payment_links')
    .select('name, amount_cents, status')
    .eq('token', token)
    .maybeSingle()
  if (!data) return null
  return {
    name: data.name,
    amountCents: data.amount_cents,
    status: data.status,
  }
}
