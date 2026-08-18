import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  getParticipantById,
  getStaffMembers,
  getAliases,
  getSessions,
  accessOwnerId,
} from '@/lib/data/participants'
import { getCourses, getAccessibleCourseIds, getCourseTree } from '@/lib/data/courses'
import { getNiches, getAccessibleNicheIds } from '@/lib/data/reactivation'
import { getActivityEvents } from '@/lib/data/analytics'
import { getAdminClient } from '@/lib/supabase/admin'
import { formatDateTime, formatDuration } from '@/lib/format'
import { MAX_STAFF, SECTOR_LABELS, type VideoProgress } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { CourseAccessToggle } from '@/components/admin/course-access-toggle'
import { NicheAccessToggle } from '@/components/admin/niche-access-toggle'
import { AddStaffForm } from '@/components/admin/add-staff-form'
import { ParticipantActiveToggle } from '@/components/admin/participant-active-toggle'
import { ArrowLeft, Mail, Phone, Users } from 'lucide-react'

const EVENT_LABELS: Record<string, string> = {
  login: 'Logged in',
  video_start: 'Started video',
  video_progress: 'Watched video',
  video_complete: 'Completed video',
  attachment_download: 'Downloaded attachment',
  module_unlock: 'Unlocked module',
}

export default async function ParticipantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const participant = await getParticipantById(id)
  if (!participant) notFound()

  const ownerId = accessOwnerId(participant)
  const isOwner = participant.role === 'owner'

  const supabase = getAdminClient()
  const [
    staff,
    aliases,
    sessions,
    courses,
    accessIds,
    events,
    progressRes,
    niches,
    nicheAccessIds,
  ] = await Promise.all([
    isOwner ? getStaffMembers(participant.id) : Promise.resolve([]),
    getAliases(participant.id),
    getSessions(participant.id, 20),
    getCourses(),
    getAccessibleCourseIds(ownerId),
    getActivityEvents({ participantId: participant.id, limit: 50 }),
    supabase.from('video_progress').select('*').eq('participant_id', id),
    getNiches(true),
    getAccessibleNicheIds(ownerId),
  ])
  const nicheAccessSet = new Set(nicheAccessIds)
  const nichesBySector = new Map<string, typeof niches>()
  for (const n of niches) {
    const list = nichesBySector.get(n.sector) ?? []
    list.push(n)
    nichesBySector.set(n.sector, list)
  }

  const progress = (progressRes.data ?? []) as VideoProgress[]
  const progressByVideo = new Map(progress.map((p) => [p.video_id, p]))

  // Per-course progress for accessible courses
  const accessSet = new Set(accessIds)
  const accessibleCourses = courses.filter((c) => accessSet.has(c.id))
  const courseTrees = await Promise.all(
    accessibleCourses.map((c) => getCourseTree(c.id, true)),
  )

  // Video titles for the activity feed
  const videoIds = [...new Set(events.map((e) => e.video_id).filter(Boolean))] as string[]
  const { data: eventVideos } = videoIds.length
    ? await supabase.from('videos').select('id, title').in('id', videoIds)
    : { data: [] }
  const videoTitle = new Map((eventVideos ?? []).map((v) => [v.id, v.title]))

  const parent = participant.parent_id
    ? await getParticipantById(participant.parent_id)
    : null

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link
          href="/admin/participants"
          className="mb-2 inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="size-4" />
          Viewers
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight">
                {participant.first_name} {participant.last_name}
              </h1>
              <Badge variant={isOwner ? 'default' : 'secondary'}>
                {isOwner ? 'Owner' : 'Staff'}
              </Badge>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Mail className="size-4" />
                {participant.email}
              </span>
              {participant.phone ? (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="size-4" />
                  {participant.phone}
                </span>
              ) : null}
              {parent ? (
                <span className="inline-flex items-center gap-1.5">
                  <Users className="size-4" />
                  Staff under{' '}
                  <Link
                    href={`/admin/participants/${parent.id}`}
                    className="text-primary hover:underline"
                  >
                    {parent.first_name} {parent.last_name}
                  </Link>
                </span>
              ) : null}
            </div>
          </div>
          <ParticipantActiveToggle
            participantId={participant.id}
            initialActive={participant.is_active}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Course access */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Course access</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {courses.length === 0 ? (
              <p className="text-sm text-muted-foreground">No courses yet.</p>
            ) : (
              courses.map((course) => (
                <div
                  key={course.id}
                  className="flex items-center justify-between gap-4 rounded-md border border-border px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{course.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {SECTOR_LABELS[course.sector] ?? course.sector} ·{' '}
                      {course.status === 'live' ? 'Live' : 'Draft'}
                    </p>
                  </div>
                  {isOwner ? (
                    <CourseAccessToggle
                      participantId={participant.id}
                      courseId={course.id}
                      initialGranted={accessSet.has(course.id)}
                    />
                  ) : (
                    <Badge variant={accessSet.has(course.id) ? 'default' : 'outline'}>
                      {accessSet.has(course.id) ? 'Inherited' : 'No access'}
                    </Badge>
                  )}
                </div>
              ))
            )}
            {!isOwner ? (
              <p className="text-xs text-muted-foreground">
                Staff inherit access from their parent participant.
              </p>
            ) : null}
          </CardContent>
        </Card>

        {/* Staff */}
        {isOwner ? (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="text-base">
                Staff members ({staff.length}/{MAX_STAFF})
              </CardTitle>
              <AddStaffForm
                parentId={participant.id}
                disabled={staff.length >= MAX_STAFF}
              />
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {staff.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No staff members yet. Staff log in with their own email and
                  their progress is tracked separately.
                </p>
              ) : (
                staff.map((s) => (
                  <Link
                    key={s.id}
                    href={`/admin/participants/${s.id}`}
                    className="flex items-center justify-between gap-4 rounded-md border border-border px-4 py-3 transition-colors hover:bg-accent"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {s.first_name} {s.last_name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {s.email}
                      </p>
                    </div>
                    <Badge variant={s.is_active ? 'secondary' : 'outline'}>
                      {s.is_active ? 'Active' : 'Disabled'}
                    </Badge>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Login identities</CardTitle>
            </CardHeader>
            <CardContent>
              <AliasList aliases={aliases} registered={participant} />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Niche access (reactivation) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Niche access</CardTitle>
          <p className="text-sm text-muted-foreground">
            Reactivation niches this account can use. Toggle on the niches the
            client purchased — more can be enabled later as they add services.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {niches.length === 0 ? (
            <p className="text-sm text-muted-foreground">No niches yet.</p>
          ) : (
            [...nichesBySector.entries()].map(([sector, sectorNiches]) => (
              <div key={sector}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {SECTOR_LABELS[sector as keyof typeof SECTOR_LABELS] ??
                    sector}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {sectorNiches.map((niche) => (
                    <div
                      key={niche.id}
                      className="flex items-center justify-between gap-4 rounded-md border border-border px-4 py-2.5"
                    >
                      <p className="min-w-0 truncate text-sm font-medium">
                        {niche.name}
                      </p>
                      {isOwner ? (
                        <NicheAccessToggle
                          participantId={participant.id}
                          nicheId={niche.id}
                          initialGranted={nicheAccessSet.has(niche.id)}
                        />
                      ) : (
                        <Badge
                          variant={
                            nicheAccessSet.has(niche.id) ? 'default' : 'outline'
                          }
                        >
                          {nicheAccessSet.has(niche.id)
                            ? 'Inherited'
                            : 'No access'}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
          {!isOwner ? (
            <p className="text-xs text-muted-foreground">
              Staff inherit niche access from their parent participant.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* Aliases for owners */}
      {isOwner ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Login identities</CardTitle>
          </CardHeader>
          <CardContent>
            <AliasList aliases={aliases} registered={participant} />
          </CardContent>
        </Card>
      ) : null}

      {/* Per-course progress */}
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Course progress</h2>
        {courseTrees.filter(Boolean).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No accessible courses yet — toggle course access above.
          </p>
        ) : (
          courseTrees.map((tree) => {
            if (!tree) return null
            const allVideos = tree.modules.flatMap((m) => m.videos)
            const done = allVideos.filter(
              (v) => progressByVideo.get(v.id)?.completed,
            ).length
            const pct =
              allVideos.length > 0
                ? Math.round((done / allVideos.length) * 100)
                : 0
            return (
              <Card key={tree.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-4">
                    <CardTitle className="text-base">{tree.title}</CardTitle>
                    <span className="text-sm text-muted-foreground">
                      {done} / {allVideos.length} videos · {pct}%
                    </span>
                  </div>
                  <Progress value={pct} className="h-2" />
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {tree.modules.map((mod, mi) => (
                    <div key={mod.id}>
                      <p className="mb-2 text-sm font-medium">
                        {mi + 1}. {mod.title}
                      </p>
                      <div className="flex flex-col gap-1">
                        {mod.videos.map((v) => {
                          const p = progressByVideo.get(v.id)
                          const percent = Math.round(
                            Number(p?.percent_watched ?? 0),
                          )
                          return (
                            <div
                              key={v.id}
                              className="flex items-center gap-3 rounded px-2 py-1.5 text-sm"
                            >
                              <span
                                className={`size-2 shrink-0 rounded-full ${
                                  p?.completed
                                    ? 'bg-primary'
                                    : percent > 0
                                      ? 'bg-muted-foreground'
                                      : 'bg-border'
                                }`}
                                aria-hidden
                              />
                              <span className="min-w-0 flex-1 truncate">
                                {v.title}
                              </span>
                              <span className="w-32 shrink-0">
                                <Progress value={percent} className="h-1.5" />
                              </span>
                              <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">
                                {p?.completed
                                  ? 'Complete'
                                  : percent > 0
                                    ? `${percent}% watched`
                                    : 'Not started'}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Sessions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent sessions</CardTitle>
          </CardHeader>
          <CardContent>
            {sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sessions yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Started</TableHead>
                    <TableHead>Last active</TableHead>
                    <TableHead>IP address</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-sm">
                        {formatDateTime(s.started_at)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDateTime(s.last_active_at)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {s.ip_address ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Activity feed */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {events.slice(0, 25).map((e) => (
                  <div
                    key={e.id}
                    className="flex items-baseline justify-between gap-4 border-b border-border pb-2 text-sm last:border-0"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">
                        {EVENT_LABELS[e.event_type] ?? e.event_type}
                      </span>
                      {e.video_id && videoTitle.get(e.video_id) ? (
                        <span className="text-muted-foreground">
                          {' — '}
                          {videoTitle.get(e.video_id)}
                        </span>
                      ) : null}
                      {e.event_type === 'video_progress' &&
                      e.metadata &&
                      typeof e.metadata.percent === 'number' ? (
                        <span className="text-muted-foreground">
                          {' '}
                          ({Math.round(e.metadata.percent as number)}%,{' '}
                          {formatDuration(
                            Number(e.metadata.secondsWatched ?? 0),
                          )}
                          )
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDateTime(e.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function AliasList({
  aliases,
  registered,
}: {
  aliases: {
    id: string
    first_name: string | null
    last_name: string | null
    phone: string | null
    ip_address: string | null
    last_seen_at: string
    login_count: number
  }[]
  registered: { first_name: string; last_name: string; phone: string | null }
}) {
  if (aliases.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No logins recorded yet. Any name or phone variations used at login will
        appear here.
      </p>
    )
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name used</TableHead>
          <TableHead>Phone used</TableHead>
          <TableHead>IP</TableHead>
          <TableHead className="text-right">Logins</TableHead>
          <TableHead className="text-right">Last seen</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {aliases.map((a) => {
          const name = `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim()
          const registeredName = `${registered.first_name} ${registered.last_name}`
          const isMatch =
            name.toLowerCase() === registeredName.toLowerCase() &&
            (a.phone ?? '') === (registered.phone ?? '')
          return (
            <TableRow key={a.id}>
              <TableCell className="text-sm">
                {name || '—'}
                {!isMatch ? (
                  <Badge variant="outline" className="ml-2 text-xs">
                    Variation
                  </Badge>
                ) : null}
              </TableCell>
              <TableCell className="text-sm">{a.phone ?? '—'}</TableCell>
              <TableCell className="font-mono text-xs">
                {a.ip_address ?? '—'}
              </TableCell>
              <TableCell className="text-right text-sm">
                {a.login_count}
              </TableCell>
              <TableCell className="text-right text-xs text-muted-foreground">
                {formatDateTime(a.last_seen_at)}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
