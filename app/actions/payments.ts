'use server'

import { randomBytes } from 'crypto'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'

import { ADMIN_COOKIE_NAME, decodeAdminSession } from '@/lib/auth/admin-token'
import { getAdminClient } from '@/lib/supabase/admin'
import { stripe } from '@/lib/stripe'

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

/** Create a payment link with a unique, unguessable token. */
export async function createPaymentLink(input: {
  name: string
  email: string
  phone?: string
  staff?: StaffMember[]
  amountDollars: number
}): Promise<{ ok: boolean; error?: string; token?: string }> {
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
  const { error } = await supabase.from('payment_links').insert({
    token,
    name,
    email,
    phone,
    staff: sanitizeStaff(input.staff),
    amount_cents: amountCents,
  })
  if (error) {
    console.error('[v0] createPaymentLink failed:', error.message)
    return { ok: false, error: 'Could not create the payment link.' }
  }
  revalidatePath('/admin/payments')
  return { ok: true, token }
}

/** List all payment links, newest first. */
export async function listPaymentLinks(): Promise<PaymentLink[]> {
  await requireAdmin()
  const supabase = getAdminClient()
  const { data } = await supabase
    .from('payment_links')
    .select(
      'id, token, name, email, phone, staff, amount_cents, status, paid_at, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(200)
  return (data as PaymentLink[]) ?? []
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
      revalidatePath('/admin/payments')
      return { paid: true }
    }
  } catch (err) {
    console.error('[v0] confirmPayment failed:', err)
  }
  return { paid: false }
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
