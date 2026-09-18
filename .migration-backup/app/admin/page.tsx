import Link from 'next/link'
import { PlayCircle } from 'lucide-react'
import {
  formatDuration,
  getDashboardStats,
  getMostWatchedVideos,
  getViewerRows,
} from '@/lib/data/analytics'

export default async function AdminDashboardPage() {
  const [stats, mostWatched, viewers] = await Promise.all([
    getDashboardStats(),
    getMostWatchedVideos(),
    getViewerRows(),
  ])
  const recentViewers = viewers
    .filter((v) => v.lastSeen)
    .sort((a, b) => (b.lastSeen! > a.lastSeen! ? 1 : -1))
    .slice(0, 6)

  const cards = [
    {
      label: 'Total Viewers',
      value: String(stats.totalViewers),
      sub: `${stats.newViewers7d} new in last 7 days`,
    },
    {
      label: 'Total Watch Time',
      value: formatDuration(stats.totalWatchSeconds),
      sub: `${stats.totalSessions} sessions`,
      accent: true,
    },
    {
      label: 'Video Completions',
      value: String(stats.videoCompletions),
      sub: 'across all courses',
    },
    {
      label: 'Content Library',
      value: `${stats.totalVideos} videos`,
      sub: `${formatDuration(stats.totalDurationSeconds)} total · ${stats.liveCourses}/${stats.totalCourses} live`,
    },
  ]

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-accent">Training</p>
          <h1 className="mt-1 text-3xl font-bold text-foreground">
            Dashboard
          </h1>
          <p className="mt-1 text-muted-foreground">
            Gated mini-courses with viewer analytics
          </p>
        </div>
        <Link
          href="/admin/courses"
          className="rounded-md border border-input bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          Manage courses
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-border bg-card p-5"
          >
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {card.label}
            </p>
            <p
              className={`mt-2 text-3xl font-bold ${card.accent ? 'text-accent' : 'text-foreground'}`}
            >
              {card.value}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{card.sub}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="rounded-lg border border-border bg-card lg:col-span-3">
          <h2 className="border-b border-border p-5 text-lg font-semibold text-foreground">
            Most watched videos
          </h2>
          {mostWatched.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">
              No videos yet. Create a course to get started.
            </p>
          ) : (
            <ul>
              {mostWatched.map((video) => (
                <li
                  key={video.id}
                  className="flex items-center justify-between gap-4 border-b border-border p-4 last:border-b-0"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">
                      {video.title}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {video.starts} viewer{video.starts === 1 ? '' : 's'}{' '}
                      started · {video.completions} completed
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1.5 text-sm text-accent">
                    <PlayCircle className="size-4" />
                    {formatDuration(video.totalSeconds)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card lg:col-span-2">
          <h2 className="border-b border-border p-5 text-lg font-semibold text-foreground">
            Recent viewers
          </h2>
          {recentViewers.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">
              No viewer activity yet.
            </p>
          ) : (
            <ul>
              {recentViewers.map((viewer) => (
                <li
                  key={viewer.id}
                  className="flex items-center justify-between gap-4 border-b border-border p-4 last:border-b-0"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/admin/participants/${viewer.id}`}
                      className="truncate font-medium text-foreground hover:text-accent"
                    >
                      {viewer.first_name} {viewer.last_name}
                    </Link>
                    <p className="truncate text-sm text-muted-foreground">
                      {viewer.email}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {viewer.lastSeen
                      ? new Date(viewer.lastSeen).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })
                      : '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
