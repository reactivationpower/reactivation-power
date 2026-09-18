import { getCourses, getCourseTree } from '@/lib/data/courses'
import {
  getActivityEvents,
  getAllProgress,
  getDashboardStats,
  getViewerRows,
} from '@/lib/data/analytics'
import { getAdminClient } from '@/lib/supabase/admin'
import { formatDateTime, formatDuration } from '@/lib/format'
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
import Link from 'next/link'

const EVENT_LABELS: Record<string, string> = {
  login: 'Login',
  video_start: 'Video start',
  video_progress: 'Watch progress',
  video_complete: 'Completed',
  attachment_download: 'Download',
  module_unlock: 'Module unlock',
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{
    participant?: string
    course?: string
    event?: string
  }>
}) {
  const { participant, course, event } = await searchParams

  const [stats, courses, progress, viewers, events] = await Promise.all([
    getDashboardStats(),
    getCourses(),
    getAllProgress(),
    getViewerRows(),
    getActivityEvents({
      participantId: participant,
      courseId: course,
      eventType: event,
      limit: 100,
    }),
  ])

  const trees = await Promise.all(courses.map((c) => getCourseTree(c.id)))

  // Aggregate per-video stats
  const byVideo = new Map<
    string,
    { started: number; completed: number; percentSum: number; watch: number }
  >()
  for (const p of progress) {
    const cur = byVideo.get(p.video_id) ?? {
      started: 0,
      completed: 0,
      percentSum: 0,
      watch: 0,
    }
    cur.started += 1
    if (p.completed) cur.completed += 1
    cur.percentSum += Number(p.percent_watched ?? 0)
    cur.watch += Number(p.seconds_watched ?? 0)
    byVideo.set(p.video_id, cur)
  }

  const courseStats: CourseStat[] = trees
    .filter((t): t is NonNullable<typeof t> => Boolean(t))
    .map((tree) => {
      const allVideoIds = tree.modules.flatMap((m) => m.videos.map((v) => v.id))
      const idSet = new Set(allVideoIds)
      const starters = new Set(
        progress.filter((p) => idSet.has(p.video_id)).map((p) => p.participant_id),
      )
      const totalWatch = allVideoIds.reduce(
        (sum, id) => sum + (byVideo.get(id)?.watch ?? 0),
        0,
      )
      // avg completion = completed videos / (videos * starters)
      const completedCount = allVideoIds.reduce(
        (sum, id) => sum + (byVideo.get(id)?.completed ?? 0),
        0,
      )
      const denominator = allVideoIds.length * Math.max(starters.size, 1)
      const avgCompletion =
        starters.size > 0 ? (completedCount / denominator) * 100 : 0

      return {
        id: tree.id,
        title: tree.title,
        status: tree.status,
        viewersStarted: starters.size,
        totalWatch,
        avgCompletion,
        modules: tree.modules.map((m) => ({
          id: m.id,
          title: m.title,
          videos: m.videos.map((v) => {
            const s = byVideo.get(v.id)
            return {
              id: v.id,
              title: v.title,
              duration: v.duration_seconds ? Number(v.duration_seconds) : null,
              started: s?.started ?? 0,
              completed: s?.completed ?? 0,
              avgPercent: s && s.started > 0 ? s.percentSum / s.started : 0,
              totalWatch: s?.watch ?? 0,
            }
          }),
        })),
      }
    })

  // Names for the activity table
  const nameOf = new Map(
    viewers.map((v) => [v.id, `${v.first_name} ${v.last_name}`]),
  )
  const supabase = getAdminClient()
  const videoIds = [
    ...new Set(events.map((e) => e.video_id).filter(Boolean)),
  ] as string[]
  const { data: eventVideos } = videoIds.length
    ? await supabase.from('videos').select('id, title').in('id', videoIds)
    : { data: [] }
  const videoTitle = new Map((eventVideos ?? []).map((v) => [v.id, v.title]))
  const courseTitle = new Map(courses.map((c) => [c.id, c.title]))

  const activeViewers = viewers.filter((v) => v.sessionCount > 0).length

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
                          {nameOf.get(e.participant_id) ?? 'Unknown'}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {EVENT_LABELS[e.event_type] ?? e.event_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-64 truncate text-sm">
                        {e.video_id
                          ? (videoTitle.get(e.video_id) ?? '—')
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
                          ? (courseTitle.get(e.course_id) ?? '—')
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
