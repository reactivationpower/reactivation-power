import { redirect } from 'next/navigation'
import { BarChart3 } from 'lucide-react'
import {
  accessOwnerId,
  getCurrentParticipant,
  getParticipantById,
  getStaffMembers,
} from '@/lib/data/participants'
import { getTeamStats } from '@/lib/data/reactivation'
import { PORTAL_WIDTH } from '@/lib/portal-layout'
import { TeamStatsCards } from '@/components/reactivation/team-stats'

export const metadata = {
  title: 'Analytics — Reactivation Power',
}

export default async function AnalyticsPage() {
  const participant = await getCurrentParticipant()
  if (!participant) redirect('/login')

  const ownerId = accessOwnerId(participant)
  const owner =
    participant.role === 'owner'
      ? participant
      : await getParticipantById(ownerId)
  if (!owner) redirect('/login')

  const staff = await getStaffMembers(ownerId)
  const teamStats = await getTeamStats(owner, staff)

  return (
    <div className={`${PORTAL_WIDTH} py-8`}>
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-lg bg-accent/10">
          <BarChart3 className="size-5 text-accent" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-foreground">Analytics</h1>
          <p className="mt-0.5 text-muted-foreground">
            Every caller at a glance. Click a name for their full breakdown.
          </p>
        </div>
      </div>

      <div className="mt-8">
        <TeamStatsCards stats={teamStats} />
      </div>
    </div>
  )
}
