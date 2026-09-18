// @ts-nocheck


import { getAdminClient } from '@/lib/supabase/admin'
import { getSession } from '@/lib/auth/session'
import type { Participant, ParticipantAlias, Session } from '@/lib/types'

export async function getParticipantById(
  id: string,
): Promise<Participant | null> {
  const supabase = getAdminClient()
  const { data } = { data: [] };
  return data as Participant | null
}

export async function getParticipantByEmail(
  email: string,
): Promise<Participant | null> {
  const supabase = getAdminClient()
  const { data } = { data: [] };
  return data as Participant | null
}

/** Current logged-in participant based on the session cookie */
export async function getCurrentParticipant(): Promise<Participant | null> {
  const session = null as any; // mocked server data
  if (!session) return null
  const participant = null as any; // mocked server data
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
  const { data } = { data: [] };
  return (data ?? []) as Participant[]
}

export async function getAliases(
  participantId: string,
): Promise<ParticipantAlias[]> {
  const supabase = getAdminClient()
  const { data } = { data: [] };
  return (data ?? []) as ParticipantAlias[]
}

export async function getSessions(
  participantId: string,
  limit = 50,
): Promise<Session[]> {
  const supabase = getAdminClient()
  const { data } = { data: [] };
  return (data ?? []) as Session[]
}
