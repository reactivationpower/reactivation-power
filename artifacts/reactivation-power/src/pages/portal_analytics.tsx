// @ts-nocheck
import { BarChart3 } from 'lucide-react'
import { PORTAL_WIDTH } from '@/lib/portal-layout'
import { TeamStatsCards } from '@/components/reactivation/team-stats'
import {
  ActivityTrendChart,
  AppointmentsByMonthChart,
} from '@/components/analytics/call-charts'
import { InsightGrid, Section } from '@/components/analytics/blocks'
import { NicheLeaderBoard } from '@/components/analytics/niche-leaders'
import { usePageData } from '@/hooks/use-page-data'
import { PageError, PageLoading } from '@/components/page-status'


export default function AnalyticsPage() {
  const { data, loading, error } = usePageData<any>('/portal/analytics')
  if (loading) return <PageLoading />
  if (error) return <PageError error={error} />
  const { teamStats, team, leaders } = data

  return (
    <div className={`${PORTAL_WIDTH} flex flex-col gap-8 py-8`}>
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

      <TeamStatsCards stats={teamStats} />

      <NicheLeaderBoard data={leaders} />

      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Whole team
          </h2>
          <p className="text-sm text-muted-foreground">
            Everyone&apos;s calls combined. Per-caller versions of each chart
            live on their page.
          </p>
        </div>
        <InsightGrid insights={team.insights} />
        <div className="grid gap-6 lg:grid-cols-2">
          <Section
            title="Activity, last 12 weeks"
            description="Dials, conversations, and appointments by week. Gray is effort, teal is reach, green is results."
          >
            <ActivityTrendChart data={team.byWeek} />
          </Section>
          <Section
            title="Appointments per month"
            description="Teal is when the appointment was booked on a call; green is the month the appointment itself falls in."
          >
            <AppointmentsByMonthChart data={team.byMonth} />
          </Section>
        </div>
      </div>
    </div>
  )
}
