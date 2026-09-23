
import { getAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getSession, type SessionPayload } from '@/lib/auth/session'
import { billingBlockForOwner } from '@/lib/billing/dunning'
import type { Participant, ParticipantAlias, Session } from '@workspace/shared/types'

export async function getParticipantById(
  id: string,
): Promise<Participant | null> {
  const supabase = getAdminClient()
  const { data } = await supabase
    .from('participants')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  return data as Participant | null
}

export async function getParticipantByEmail(
  email: string,
): Promise<Participant | null> {
  const supabase = getAdminClient()
  const { data } = await supabase
    .from('participants')
    .select('*')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle()
  return data as Participant | null
}

/**
 * Current logged-in participant based on the session cookie.
 *
 * Portal access is also gated on billing: when the owning customer is
 * past due or canceled, the owner and all staff are sent to the login page
 * with a billing notice instead of getting data.
 */
export async function getCurrentParticipant(): Promise<Participant | null> {
  const session = await getSession()
  if (!session) return null
  const participant = await participantIfBillingAllows(session)
  if (participant === 'blocked') {
    const p = await getParticipantById(session.participantId)
    redirect(billingLoginPath(p?.email))
  }
  return participant
}

/**
 * The participant behind a session, or `'blocked'` when the account is shut
 * off for billing. Non-page routes (media, progress, RPC auth) use this so a
 * paused account cannot keep fetching paid content with an existing cookie.
 */
export async function participantIfBillingAllows(
  session: Pick<SessionPayload, 'participantId'>,
): Promise<Participant | null | 'blocked'> {
  const participant = await getParticipantById(session.participantId)
  if (!participant || !participant.is_active) return null
  if (!participant.is_demo) {
    const block = await billingBlockForOwner(accessOwnerId(participant))
    if (block) return 'blocked'
  }
  return participant
}

/** Session for a signed-in portal account that is active and not billing-blocked. */
export async function getAllowedSession(): Promise<SessionPayload | null> {
  const session = await getSession()
  if (!session) return null
  const participant = await participantIfBillingAllows(session)
  return participant && participant !== 'blocked' ? session : null
}

/** Login page URL that shows the billing notice for a shut-off account. */
export function billingLoginPath(email?: string | null): string {
  const params = new URLSearchParams({ reason: 'billing' })
  if (email) params.set('email', email)
  return `/login?${params.toString()}`
}

/**
 * The "access root" for a participant: staff members inherit
 * course access from their parent owner.
 */
export function accessOwnerId(participant: Participant): string {
  return participant.parent_id ?? participant.id
}

export async function getStaffMembers(
  ownerId: string,
): Promise<Participant[]> {
  const supabase = getAdminClient()
  const { data } = await supabase
    .from('participants')
    .select('*')
    .eq('parent_id', ownerId)
    .order('created_at')
  return (data ?? []) as Participant[]
}

export async function getAliases(
  participantId: string,
): Promise<ParticipantAlias[]> {
  const supabase = getAdminClient()
  const { data } = await supabase
    .from('participant_aliases')
    .select('*')
    .eq('participant_id', participantId)
    .order('last_seen_at', { ascending: false })
  return (data ?? []) as ParticipantAlias[]
}

export async function getSessions(
  participantId: string,
  limit = 50,
): Promise<Session[]> {
  const supabase = getAdminClient()
  const { data } = await supabase
    .from('sessions')
    .select('*')
    .eq('participant_id', participantId)
    .order('started_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as Session[]
}
