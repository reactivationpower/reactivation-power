import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, CalendarCheck } from 'lucide-react'
import {
  accessOwnerId,
  getCurrentParticipant,
  getParticipantById,
} from '@/lib/data/participants'
import { getAccessibleCourseIds } from '@/lib/data/courses'
import {
  getCallAnalytics,
  getTrainingAudit,
  sameAccount,
  MIN_BUCKET_SAMPLE,
} from '@/lib/data/caller-analytics'
import { PORTAL_WIDTH } from '@/lib/portal-layout'
import {
  ActivityTrendChart,
  AppointmentsByMonthChart,
  BucketDualRateChart,
  BucketRateChart,
} from '@/components/analytics/call-charts'
import {
  DispositionBar,
  InsightGrid,
  NicheTable,
  Section,
  StatTiles,
  longDate,
  relativeDay,
} from '@/components/analytics/blocks'
import { TrainingAudit } from '@/components/analytics/training-audit'

export const metadata = {
  title: 'Caller analytics | Reactivation Power',
}

export default async function CallerAnalyticsPage({
  params,
}: {
  params: Promise<{ callerId: string }>
}) {
  const { callerId } = await params
  const viewer = await getCurrentParticipant()
  if (!viewer) redirect('/login')
  const ownerId = accessOwnerId(viewer)

  const caller = await getParticipantById(callerId)
  // Anyone on the account can view any teammate; nobody can view another account.
  if (!caller || !sameAccount(caller, ownerId)) notFound()

  const [analytics, courseIds] = await Promise.all([
    getCallAnalytics([caller.id]),
    getAccessibleCourseIds(ownerId),
  ])
  const audit = await getTrainingAudit(caller.id, courseIds)

  const s = analytics.summary
  const hasCalls = s.calls > 0

  return (
    <div className={`${PORTAL_WIDTH} flex flex-col gap-6 py-8`}>
      <div>
        <Link
          href="/portal/analytics"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          All callers
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-bold text-foreground">
                {caller.first_name} {caller.last_name}
              </h1>
              {caller.role === 'owner' && (
                <span className="rounded bg-accent/10 px-1.5 py-0.5 text-xs font-medium text-accent">
                  Owner
                </span>
              )}
              {!caller.is_active && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                  Inactive
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {hasCalls
                ? `Calling since ${longDate(s.firstCallAt)} · last call ${relativeDay(s.lastCallAt)}`
                : 'No calls logged yet. The training audit below shows whether they have started.'}
            </p>
          </div>
          {s.upcomingAppointments > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
              <CalendarCheck className="size-4" />
              <span>
                <span className="font-semibold">{s.upcomingAppointments}</span>{' '}
                upcoming appointment{s.upcomingAppointments === 1 ? '' : 's'}
              </span>
            </div>
          )}
        </div>
      </div>

      <StatTiles summary={s} />

      <InsightGrid insights={analytics.insights} />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Section
          title="Activity, last 12 weeks"
          description="Dials, conversations, and appointments by week. Gray is effort, teal is reach, green is results."
        >
          <ActivityTrendChart data={analytics.byWeek} />
        </Section>
        <Section
          title="How calls end"
          description={`Every disposition logged across ${s.calls} call${s.calls === 1 ? '' : 's'}.`}
        >
          <DispositionBar
            dispositions={analytics.dispositions}
            total={s.calls}
          />
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          title="Answer rate by hour"
          description="Share of calls where the patient picked up, by Eastern hour. Faded bars have fewer than the minimum sample."
          aside={<SampleNote />}
        >
          <BucketRateChart data={analytics.byHour} metric="answerRate" />
        </Section>
        <Section
          title="Scheduled rate by hour"
          description="Share of calls that ended in a booked appointment, by hour."
          aside={<SampleNote />}
        >
          <BucketRateChart data={analytics.byHour} metric="yesRate" />
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Section
          title="Best days of the week"
          description="Answer rate and scheduled rate side by side, Monday through Sunday."
          aside={<SampleNote />}
        >
          <BucketDualRateChart data={analytics.byWeekday} />
        </Section>
        <Section
          title="Time of month"
          description="Scheduled rate by week of the calendar month. Do patients say yes more around payday or month-end?"
          aside={<SampleNote />}
        >
          <BucketRateChart data={analytics.byMonthWeek} metric="yesRate" />
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          title="Appointments per month"
          description="Teal is when the appointment was booked on a call; green is the month the appointment itself falls in (when a date was captured)."
        >
          <AppointmentsByMonthChart data={analytics.byMonth} />
        </Section>
        <Section
          title="Niche performance"
          description="Which service categories this caller converts best."
        >
          <NicheTable rows={analytics.byNiche} />
        </Section>
      </div>

      <TrainingAudit audit={audit} firstName={caller.first_name} />
    </div>
  )
}

function SampleNote() {
  return (
    <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      min {MIN_BUCKET_SAMPLE} calls per slot
    </span>
  )
}
