import { GraduationCap, LogIn, PlayCircle, CheckCircle2 } from 'lucide-react'
import type { TrainingAudit as TrainingAuditData } from '@/lib/analytics-types'
import { formatDuration } from '@/lib/data/analytics'
import { LoginsByWeekChart } from '@/components/analytics/call-charts'
import { Section, longDate, relativeDay } from '@/components/analytics/blocks'
import { cn } from '@/lib/utils'

const EVENT_LABEL: Record<string, string> = {
  login: 'Signed in',
  video_start: 'Started',
  video_complete: 'Completed',
}

export function TrainingAudit({
  audit,
  firstName,
}: {
  audit: TrainingAuditData
  firstName: string
}) {
  const overall = audit.courses.reduce(
    (acc, c) => ({
      done: acc.done + c.completedVideos,
      total: acc.total + c.totalVideos,
    }),
    { done: 0, total: 0 },
  )
  const overallPct =
    overall.total > 0 ? Math.round((overall.done / overall.total) * 100) : 0
  const behind = overall.total > 0 && overallPct < 100
  const neverSignedIn = audit.logins === 0

  return (
    <Section
      title="Training audit"
      description={`Is ${firstName} actually doing the training? Sign-ins, watch time, and course completion.`}
      aside={
        <span
          className={cn(
            'rounded-full px-2.5 py-1 text-xs font-medium',
            neverSignedIn
              ? 'bg-destructive/10 text-destructive'
              : behind
                ? 'bg-accent/10 text-accent'
                : 'bg-success/10 text-success',
          )}
        >
          {neverSignedIn
            ? 'Never signed in'
            : behind
              ? `${overallPct}% of training complete`
              : 'Training complete'}
        </span>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Fact
          icon={<LogIn className="size-4" />}
          label="Sign-ins"
          value={String(audit.logins)}
          sub={
            neverSignedIn
              ? 'No portal activity'
              : `${audit.loginsLast30} in the last 30 days · last ${relativeDay(audit.lastLoginAt)}`
          }
        />
        <Fact
          icon={<PlayCircle className="size-4" />}
          label="Videos started"
          value={String(audit.videoStarts)}
          sub={`${formatDuration(audit.totalWatchSeconds)} watched in total`}
        />
        <Fact
          icon={<CheckCircle2 className="size-4" />}
          label="Videos completed"
          value={`${overall.done}/${overall.total}`}
          sub={`${audit.videoCompletions} marked complete`}
        />
        <Fact
          icon={<GraduationCap className="size-4" />}
          label="Active days"
          value={String(audit.activeLoginDays)}
          sub={
            audit.firstLoginAt
              ? `First sign-in ${longDate(audit.firstLoginAt)}`
              : 'Waiting on first sign-in'
          }
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Course progress
          </p>
          {audit.courses.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No courses are enabled on this account.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {audit.courses.map((c) => (
                <li key={c.id} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate font-medium text-foreground">
                      {c.title}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {c.completedVideos}/{c.totalVideos} videos ·{' '}
                      <span className="font-medium text-foreground">
                        {c.percentComplete}%
                      </span>
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        c.percentComplete === 100 ? 'bg-success' : 'bg-accent',
                      )}
                      style={{ width: `${c.percentComplete}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Sign-ins per week
          </p>
          <LoginsByWeekChart data={audit.loginsByWeek} />
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Recent activity
          </p>
          {audit.recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing logged yet.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border text-sm">
              {audit.recent.map((e) => (
                <li
                  key={e.id}
                  className="flex items-start justify-between gap-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="font-medium text-foreground">
                      {EVENT_LABEL[e.type] ?? e.type}
                    </span>
                    {e.title && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {e.title}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(e.at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      timeZone: 'America/New_York',
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Section>
  )
}

function Fact({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub: string
}) {
  return (
    <div className="flex gap-3 rounded-lg border border-border bg-background/60 p-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="text-xl font-bold text-foreground">{value}</p>
        <p className="truncate text-xs text-muted-foreground" title={sub}>
          {sub}
        </p>
      </div>
    </div>
  )
}
