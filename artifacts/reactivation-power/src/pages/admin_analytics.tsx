// @ts-nocheck
import { useSearch } from 'wouter'
import { formatDateTime, formatDuration } from '@workspace/shared/format'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { ActivityFilters } from '@/components/admin/activity-filters'
import {
  CourseEngagement,
  type CourseStat,
} from '@/components/admin/course-engagement'
import { Link } from "wouter";
import { usePageData } from '@/hooks/use-page-data'
import { PageError, PageLoading } from '@/components/page-status'

const EVENT_LABELS: Record<string, string> = {
  login: 'Login',
  video_start: 'Video start',
  video_progress: 'Watch progress',
  video_complete: 'Completed',
  attachment_download: 'Download',
  module_unlock: 'Module unlock',
}

export default function AnalyticsPage() {
  const searchParams = new URLSearchParams(useSearch())
  const participant = searchParams.get('participant') ?? undefined
  const course = searchParams.get('course') ?? undefined
  const event = searchParams.get('event') ?? undefined
  const { data, loading, error } = usePageData<any>('/admin/analytics', {
    participant, course, event,
  })
  if (loading) return <PageLoading />
  if (error) return <PageError error={error} />
  const { stats, courses, viewers, events, courseStats, nameOf, videoTitle, courseTitle, activeViewers } = data

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-sm font-medium text-primary">Training</p>
        <h1 className="text-3xl font-semibold tracking-tight">Analytics</h1>
        <p className="mt-1 text-muted-foreground">
          Viewer visibility stats, plus per-course engagement — expand for
          modules and videos
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Avg watch / viewer"
          value={formatDuration(
            activeViewers > 0 ? stats.totalWatchSeconds / activeViewers : 0,
          )}
          hint="Across active viewers"
        />
        <StatCard
          label="Active viewers"
          value={String(activeViewers)}
          hint="With any watch history"
        />
        <StatCard
          label="Total watch time"
          value={formatDuration(stats.totalWatchSeconds)}
          hint="All viewers combined"
        />
        <StatCard
          label="Video completions"
          value={String(stats.videoCompletions)}
          hint={`Across ${stats.totalVideos} videos`}
        />
        <StatCard
          label="Sessions"
          value={String(stats.totalSessions)}
          hint="All time"
        />
        <StatCard
          label="Live courses"
          value={`${stats.liveCourses}/${stats.totalCourses}`}
          hint="Published"
        />
      </div>

      {/* Per-course engagement */}
      <CourseEngagement courses={courseStats} />

      {/* Activity log */}
      <div id="activity" className="flex flex-col gap-4">
        <div>
          <h2 className="text-xl font-semibold">Activity log</h2>
          <p className="text-sm text-muted-foreground">
            Every login, video start, watch heartbeat, and completion — use the
            smart filters to drill down
          </p>
        </div>
        <ActivityFilters
          participants={viewers.map((v) => ({
            id: v.id,
            name: `${v.first_name} ${v.last_name}`,
          }))}
          courses={courses.map((c) => ({ id: c.id, title: c.title }))}
        />
        <Card>
          <CardContent className="p-0">
            {events.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                No activity matches these filters.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Viewer</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Detail</TableHead>
                    <TableHead>Course</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead className="text-right">When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>
                        <Link
                          href={`/admin/participants/${e.participant_id}`}
                          className="text-sm font-medium text-primary hover:underline"
                        >
                          {nameOf[e.participant_id] ?? 'Unknown'}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {EVENT_LABELS[e.event_type] ?? e.event_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-64 truncate text-sm">
                        {e.video_id
                          ? (videoTitle[e.video_id] ?? '—')
                          : '—'}
                        {e.event_type === 'video_progress' &&
                        e.metadata &&
                        typeof e.metadata.percent === 'number' ? (
                          <span className="text-muted-foreground">
                            {' '}
                            · {Math.round(e.metadata.percent as number)}% ·{' '}
                            {formatDuration(
                              Number(e.metadata.secondsWatched ?? 0),
                            )}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {e.course_id
                          ? (courseTitle[e.course_id] ?? '—')
                          : '—'}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {e.ip_address ?? '—'}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {formatDateTime(e.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint: string
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="mt-2 text-2xl font-semibold text-primary">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  )
}
