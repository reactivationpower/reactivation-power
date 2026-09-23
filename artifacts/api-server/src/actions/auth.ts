
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAdminClient } from '@/lib/supabase/admin'
import {
  clearSessionCookie,
  getClientIp,
  setSessionCookie,
} from '@/lib/auth/session'
import { accessOwnerId, getParticipantByEmail } from '@/lib/data/participants'
import { billingBlockForOwner } from '@/lib/billing/dunning'
import { productAccessFor } from '@/lib/lead-followup/access'
import { resolveLoginDestination } from '@/lib/auth/login-destination'
import { logEvent } from '@/lib/data/activity'

export interface LoginState {
  error?: string
  /** Set when the account is shut off for a billing problem (owner or staff). */
  billing?: { reason: string; status: string; email: string }
}

function norm(v: string | null | undefined): string {
  return (v ?? '').trim().toLowerCase()
}

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const firstName = String(formData.get('firstName') ?? '').trim()
  const lastName = String(formData.get('lastName') ?? '').trim()
  const email = norm(String(formData.get('email') ?? ''))
  const phone = String(formData.get('phone') ?? '').trim()
  // Only an explicit return path (a deep link that bounced to login) is honoured;
  // with none, the account's products decide where it lands.
  const next = String(formData.get('next') ?? '').trim()

  if (!firstName || !lastName || !email) {
    return { error: 'Please fill in your first name, last name, and email.' }
  }

  const participant = await getParticipantByEmail(email)
  if (!participant || !participant.is_active) {
    return {
      error:
        'This email is not registered. Please contact your administrator for access.',
    }
  }

  // Billing gate: a past-due or canceled customer locks out the owner and
  // every staff account underneath them until an invoice is paid.
  if (!participant.is_demo) {
    const block = await billingBlockForOwner(accessOwnerId(participant))
    if (block) {
      return {
        error: 'There is a billing issue on this account, so access is paused.',
        billing: { reason: block.reason, status: block.status, email: block.email },
      }
    }
  }

  const supabase = getAdminClient()
  const ip = await getClientIp()
  const userAgent = (await headers()).get('user-agent')

  // Track name/phone variations as aliases (email is the source of record)
  const nameMatches =
    norm(firstName) === norm(participant.first_name) &&
    norm(lastName) === norm(participant.last_name)
  const phoneMatches =
    !phone || norm(phone) === norm(participant.phone ?? '')

  if (!nameMatches || !phoneMatches) {
    const { data: existing } = await supabase
      .from('participant_aliases')
      .select('id, login_count')
      .eq('participant_id', participant.id)
      .eq('first_name', firstName)
      .eq('last_name', lastName)
      .eq('phone', phone || '')
      .maybeSingle()

    if (existing) {
      await supabase
        .from('participant_aliases')
        .update({
          last_seen_at: new Date().toISOString(),
          login_count: existing.login_count + 1,
          ip_address: ip,
        })
        .eq('id', existing.id)
    } else {
      await supabase.from('participant_aliases').insert({
        participant_id: participant.id,
        first_name: firstName,
        last_name: lastName,
        phone: phone || '',
        ip_address: ip,
      })
    }
  }

  // Create a session row for tracking
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .insert({
      participant_id: participant.id,
      ip_address: ip,
      user_agent: userAgent,
    })
    .select('id')
    .single()

  if (sessionError || !session) {
    return { error: 'Something went wrong. Please try again.' }
  }

  await logEvent({
    participantId: participant.id,
    sessionId: session.id,
    eventType: 'login',
    ipAddress: ip,
    metadata: {
      submitted_first_name: firstName,
      submitted_last_name: lastName,
      submitted_phone: phone || null,
      name_match: nameMatches,
      phone_match: phoneMatches,
    },
  })

  await setSessionCookie({
    participantId: participant.id,
    sessionId: session.id,
    issuedAt: Date.now(),
  })

  redirect(resolveLoginDestination(next, await productAccessFor(participant)))
}

export async function logout() {
  await clearSessionCookie()
  redirect('/login')
}
