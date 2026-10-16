import 'server-only'

import { getAdminClient } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth/session'
import type { Participant, ParticipantAlias, Session } from '@/lib/types'

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

/** Current logged-in participant based on the session cookie */
export async function getCurrentParticipant(): Promise<Participant | null> {
  const session = await getSession()
  if (!session) return null
  const participant = await getParticipantById(session.participantId)
  if (!participant || !participant.is_active) return null
  return participant
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
