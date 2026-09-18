
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth/admin-session'
import { getClientIp, setSessionCookie } from '@/lib/auth/session'
import { getParticipantById } from '@/lib/data/participants'

/**
 * "View as client": a super admin opens a participant's portal exactly as
 * they see it, to help them with their account. Issues a normal portal
 * session cookie (alongside the admin cookie, which is untouched) tagged
 * with the acting admin so the portal shows a banner and the session row
 * is identifiable in analytics.
 */
export async function viewAsParticipant(participantId: string) {
  const actor = await requireAdmin('super_admin')
  const participant = await getParticipantById(String(participantId))
  if (!participant) throw new Error('Participant not found.')

  const supabase = getAdminClient()
  const ip = await getClientIp()
  const userAgent = (await headers()).get('user-agent')
  const { data: session, error } = await supabase
    .from('sessions')
    .insert({
      participant_id: participant.id,
      ip_address: ip,
      user_agent: `admin-view-as:${actor.email} ${userAgent ?? ''}`.trim(),
    })
    .select('id')
    .single()
  if (error || !session) throw new Error('Could not start a viewing session.')

  await setSessionCookie({
    participantId: participant.id,
    sessionId: session.id,
    issuedAt: Date.now(),
    impersonatedBy: { userId: actor.userId, email: actor.email },
  })
  redirect('/portal')
}
