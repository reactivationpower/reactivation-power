import type { ReactNode } from 'react'
import { Clock, Info, Sparkles, TrendingDown } from 'lucide-react'
import {
  MIN_BUCKET_SAMPLE,
  type CallAnalytics,
  type NicheRow,
  type TimeInsight,
} from '@/lib/analytics-types'
import { cn } from '@/lib/utils'

// ---------- Section card ----------

export function Section({
  title,
  description,
  aside,
  children,
  className,
}: {
  title: string
  description?: string
  aside?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        'flex flex-col gap-4 rounded-lg border border-border bg-card p-5',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {description && (
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {aside}
      </div>
      {children}
    </section>
  )
}

// ---------- Summary tiles ----------

export function StatTiles({
  summary,
}: {
  summary: CallAnalytics['summary']
}) {
  const tiles: { label: string; value: string; sub?: string; tone?: string }[] =
    [
      { label: 'Calls', value: String(summary.calls) },
      {
        label: 'Reached',
        value: String(summary.reached),
        sub: `${summary.answerRate}% answer rate`,
      },
      {
        label: 'Scheduled',
        value: String(summary.scheduled),
        sub: `${summary.successRate}% of all calls`,
        tone: 'text-success',
      },
      {
        label: 'Close rate',
        value: `${summary.closeRate}%`,
        sub: 'of conversations booked',
      },
      {
        label: 'Active days',
        value: String(summary.activeDays),
        sub: 'days with at least one call',
      },
    ]
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {tiles.map((t) => (
        <div
          key={t.label}
          className="rounded-lg border border-border bg-card px-4 py-3"
        >
          <p className="text-xs font-medium text-muted-foreground">{t.label}</p>
          <p
            className={cn(
              'mt-1 text-2xl font-bold text-foreground',
              t.tone,
            )}
          >
            {t.value}
          </p>
          {t.sub && (
            <p className="mt-0.5 text-xs text-muted-foreground">{t.sub}</p>
          )}
        </div>
      ))}
    </div>
  )
}

// ---------- Insight cards ----------

function InsightCard({
  icon,
  title,
  insight,
  metric,
  emptyHint,
  tone = 'accent',
}: {
  icon: ReactNode
  title: string
  insight: TimeInsight | null
  metric: string
  emptyHint: string
  tone?: 'accent' | 'success' | 'destructive'
}) {
  const toneBg = {
    accent: 'bg-accent/10 text-accent',
    success: 'bg-success/10 text-success',
    destructive: 'bg-destructive/10 text-destructive',
  }[tone]
  return (
    <div className="flex gap-3 rounded-lg border border-border bg-card p-4">
      <div
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-md',
          toneBg,
        )}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
        {insight ? (
          <>
            <p className="mt-0.5 text-lg font-semibold text-foreground">
              {insight.label}
            </p>
            <p className="text-xs text-muted-foreground">
              {insight.rate}% {metric} · {insight.calls} calls
            </p>
          </>
        ) : (
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {emptyHint}
          </p>
        )}
      </div>
    </div>
  )
}

export function InsightGrid({
  insights,
}: {
  insights: CallAnalytics['insights']
}) {
  const need = `Needs ${MIN_BUCKET_SAMPLE}+ calls in at least two time slots.`
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <InsightCard
        icon={<Clock className="size-4" />}
        title="Best time to reach someone"
        insight={insights.bestAnswerHour}
        metric="answered"
        emptyHint={`Not enough data yet. ${need}`}
      />
      <InsightCard
        icon={<TrendingDown className="size-4" />}
        title="Hardest time to reach someone"
        insight={insights.worstAnswerHour}
        metric="answered"
        emptyHint="Shows once one hour is clearly worse than the others."
        tone="destructive"
      />
      <InsightCard
        icon={<Sparkles className="size-4" />}
        title="Most likely hour for a yes"
        insight={insights.bestYesHour}
        metric="scheduled"
        emptyHint={`Not enough appointments yet. ${need}`}
        tone="success"
      />
      <InsightCard
        icon={<Sparkles className="size-4" />}
        title="Most likely day for a yes"
        insight={insights.bestYesDay}
        metric="scheduled"
        emptyHint={`Not enough appointments yet. ${need}`}
        tone="success"
      />
    </div>
  )
}

// ---------- Disposition mix ----------

const DISPOSITION_TONE: Record<string, string> = {
  scheduled: 'bg-success',
  spoke_call_back_later: 'bg-accent',
  spoke_did_not_schedule: 'bg-accent/50',
  voicemail: 'bg-chart-4',
  no_answer: 'bg-chart-3/60',
  do_not_call: 'bg-destructive/70',
}

export function DispositionBar({
  dispositions,
  total,
}: {
  dispositions: CallAnalytics['dispositions']
  total: number
}) {
  if (total === 0) {
    return (
      <p className="text-sm text-muted-foreground">No calls logged yet.</p>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {dispositions.map((d) => (
          <div
            key={d.key}
            className={cn('h-full', DISPOSITION_TONE[d.key] ?? 'bg-muted-foreground')}
            style={{ width: `${(d.count / total) * 100}%` }}
            title={`${d.label}: ${d.count}`}
          />
        ))}
      </div>
      <ul className="flex flex-col gap-2 text-sm">
        {dispositions.map((d) => (
          <li key={d.key} className="flex items-center gap-3">
            <span
              className={cn(
                'size-2.5 shrink-0 rounded-sm',
                DISPOSITION_TONE[d.key] ?? 'bg-muted-foreground',
              )}
            />
            <span className="flex-1 text-muted-foreground">{d.label}</span>
            <span className="tabular-nums font-medium text-foreground">
              {d.count}
            </span>
            <span className="w-12 text-right tabular-nums text-muted-foreground">
              {Math.round((d.count / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------- Niche table ----------

export function NicheTable({ rows }: { rows: NicheRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Niche performance appears after the first calls are logged.
      </p>
    )
  }
  const maxCalls = Math.max(...rows.map((r) => r.calls), 1)
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="pb-2 pr-4 font-medium">Niche</th>
            <th className="pb-2 pr-4 font-medium">Calls</th>
            <th className="pb-2 pr-4 font-medium">Reached</th>
            <th className="pb-2 pr-4 font-medium">Scheduled</th>
            <th className="pb-2 font-medium">
              <span title="Scheduled ÷ reached">Close rate</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.nicheId ?? 'none'}
              className="border-b border-border last:border-b-0"
            >
              <td className="py-2.5 pr-4 font-medium text-foreground">
                {r.name}
              </td>
              <td className="py-2.5 pr-4">
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-chart-3"
                      style={{ width: `${(r.calls / maxCalls) * 100}%` }}
                    />
                  </span>
                  <span className="text-foreground">{r.calls}</span>
                </span>
              </td>
              <td className="py-2.5 pr-4 text-foreground">{r.reached}</td>
              <td className="py-2.5 pr-4 font-medium text-success">
                {r.scheduled}
              </td>
              <td className="py-2.5">
                {r.reached >= MIN_BUCKET_SAMPLE ? (
                  <span className="font-medium text-foreground">
                    {r.closeRate}%
                  </span>
                ) : (
                  <span
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                    title={`Needs ${MIN_BUCKET_SAMPLE}+ conversations`}
                  >
                    <Info className="size-3" />
                    too few
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------- Small helpers ----------

export function relativeDay(iso: string | null): string {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  const months = Math.floor(days / 30)
  return months === 1 ? '1 month ago' : `${months} months ago`
}

export function longDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  })
}
