import Link from 'next/link'
import { ArrowRight, TrendingDown, TrendingUp, Trophy } from 'lucide-react'
import type { TeamMemberStats } from '@/lib/data/reactivation'

/** Minimum calls before someone is ranked (keeps small samples fair) */
const MIN_CALLS_TO_RANK = 10

export function TeamStatsCards({
  stats,
  compact = false,
}: {
  stats: TeamMemberStats[]
  /** Dialer view: totals only, with a link through to the full Analytics page */
  compact?: boolean
}) {
  const totals = stats.reduce(
    (acc, s) => ({
      today: acc.today + s.calls_today,
      week: acc.week + s.calls_week,
      scheduled: acc.scheduled + s.scheduled_week,
    }),
    { today: 0, week: 0, scheduled: 0 },
  )

  // Rank by success rate (scheduled per call), qualified callers first
  const ranked = [...stats].sort((a, b) => {
    const aQ = a.calls_total >= MIN_CALLS_TO_RANK
    const bQ = b.calls_total >= MIN_CALLS_TO_RANK
    if (aQ !== bQ) return aQ ? -1 : 1
    if (b.success_rate !== a.success_rate)
      return b.success_rate - a.success_rate
    return b.scheduled_total - a.scheduled_total
  })

  const qualified = ranked.filter((s) => s.calls_total >= MIN_CALLS_TO_RANK)
  const topId = qualified.length >= 2 ? qualified[0].participant.id : null
  const lowest =
    qualified.length >= 2 ? qualified[qualified.length - 1] : null
  const lowestId =
    lowest && lowest.participant.id !== topId ? lowest.participant.id : null

  const totalsGrid = (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div className="rounded-lg border border-border bg-card p-5">
        <p className="text-sm font-medium text-muted-foreground">Calls Today</p>
        <p className="mt-1 text-3xl font-bold text-foreground">
          {totals.today}
        </p>
      </div>
      <div className="rounded-lg border border-border bg-card p-5">
        <p className="text-sm font-medium text-muted-foreground">
          Calls This Week
        </p>
        <p className="mt-1 text-3xl font-bold text-foreground">
          {totals.week}
        </p>
      </div>
      <div className="rounded-lg border border-border bg-card p-5">
        <p className="text-sm font-medium text-muted-foreground">
          Scheduled This Week
        </p>
        <p className="mt-1 text-3xl font-bold text-success">
          {totals.scheduled}
        </p>
      </div>
    </div>
  )

  if (compact) {
    return (
      <div className="flex flex-col gap-3">
        {totalsGrid}
        <Link
          href="/portal/analytics"
          className="inline-flex items-center gap-1.5 self-end text-sm font-medium text-accent hover:underline"
        >
          Full caller analytics
          <ArrowRight className="size-4" />
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {totalsGrid}

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <div className="border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold text-foreground">
            Caller Performance
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Ranked by success rate (appointments scheduled per call, all
            time). Callers need {MIN_CALLS_TO_RANK}+ calls to be ranked. Click
            a caller for their full breakdown.
          </p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-5 py-3 font-medium">Rank</th>
              <th className="px-5 py-3 font-medium">Caller</th>
              <th className="px-5 py-3 font-medium">Calls</th>
              <th className="px-5 py-3 font-medium">Reached</th>
              <th className="px-5 py-3 font-medium">Scheduled</th>
              <th className="px-5 py-3 font-medium">Success Rate</th>
              <th className="px-5 py-3 font-medium">
                <span title="Of the patients they actually spoke with, how many scheduled">
                  Close Rate
                </span>
              </th>
              <th className="px-5 py-3 font-medium">This Week</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((s, i) => {
              const isTop = s.participant.id === topId
              const isLowest = s.participant.id === lowestId
              const isRanked = s.calls_total >= MIN_CALLS_TO_RANK
              return (
                <tr
                  key={s.participant.id}
                  className="relative border-b border-border transition-colors last:border-b-0 hover:bg-muted/40"
                >
                  <td className="px-5 py-3 text-muted-foreground">
                    {isRanked ? `#${i + 1}` : '—'}
                  </td>
                  <td className="px-5 py-3 font-medium text-foreground">
                    <span className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/portal/analytics/${s.participant.id}`}
                        className="after:absolute after:inset-0 hover:underline"
                      >
                        {s.participant.first_name} {s.participant.last_name}
                      </Link>
                      {s.participant.role === 'owner' && (
                        <span className="rounded bg-accent/10 px-1.5 py-0.5 text-xs font-medium text-accent">
                          Owner
                        </span>
                      )}
                      {isTop && (
                        <span className="flex items-center gap-1 rounded bg-success/10 px-1.5 py-0.5 text-xs font-medium text-success">
                          <Trophy className="size-3" />
                          Top performer
                        </span>
                      )}
                      {isLowest && (
                        <span className="flex items-center gap-1 rounded bg-destructive/10 px-1.5 py-0.5 text-xs font-medium text-destructive">
                          <TrendingDown className="size-3" />
                          Needs attention
                        </span>
                      )}
                      {!isRanked && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                          {s.calls_total === 0
                            ? 'No calls yet'
                            : `${MIN_CALLS_TO_RANK - s.calls_total} more to rank`}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-foreground">
                    {s.calls_total}
                  </td>
                  <td className="px-5 py-3 text-foreground">
                    {s.reached_total}
                  </td>
                  <td className="px-5 py-3 font-medium text-success">
                    {s.scheduled_total}
                  </td>
                  <td className="px-5 py-3">
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full bg-accent"
                          style={{ width: `${Math.min(s.success_rate, 100)}%` }}
                        />
                      </span>
                      <span className="font-medium text-foreground">
                        {s.success_rate}%
                      </span>
                    </span>
                  </td>
                  <td className="px-5 py-3 text-foreground">
                    {s.conversion_rate}%
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {s.calls_week} calls
                    {s.scheduled_week > 0 && (
                      <span className="ml-1 inline-flex items-center gap-0.5 text-success">
                        <TrendingUp className="size-3" />
                        {s.scheduled_week}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
