import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, Lock, Play } from 'lucide-react'
import { mediaUrl } from '@/lib/media'
import {
  accessOwnerId,
  getCurrentParticipant,
} from '@/lib/data/participants'
import {
  getAccessibleCourseIds,
  getAttachmentsForVideos,
  getCourseBySlug,
  getCourseTree,
} from '@/lib/data/courses'
import {
  computeCourseState,
  getProgressForParticipant,
} from '@/lib/data/progress'
import { VideoPlayer } from '@/components/portal/video-player'
import { AttachmentList } from '@/components/portal/attachment-list'

export default async function VideoPage({
  params,
}: {
  params: Promise<{ slug: string; videoId: string }>
}) {
  const { slug, videoId } = await params
  const participant = await getCurrentParticipant()
  if (!participant) redirect(`/login?next=/portal/course/${slug}`)

  const course = await getCourseBySlug(slug)
  if (!course || course.status !== 'live') notFound()

  const accessibleIds = await getAccessibleCourseIds(
    accessOwnerId(participant),
  )
  if (!accessibleIds.includes(course.id)) redirect('/portal')

  const tree = await getCourseTree(course.id, true)
  if (!tree) notFound()

  // Flatten videos in course order
  const flat = tree.modules.flatMap((m) =>
    m.videos.map((v) => ({ video: v, module: m })),
  )
  const currentIndex = flat.findIndex((f) => f.video.id === videoId)
  if (currentIndex === -1) notFound()
  const { video, module } = flat[currentIndex]

  const videoIds = flat.map((f) => f.video.id)
  const progress = await getProgressForParticipant(participant.id, videoIds)
  const state = computeCourseState(tree, progress)
  const videoStates = new Map(
    state.modules.flatMap((m) => m.videos.map((v) => [v.videoId, v])),
  )

  const currentState = videoStates.get(videoId)
  if (currentState?.locked) redirect(`/portal/course/${slug}`)

  const attachments = await getAttachmentsForVideos([videoId])
  const prev = currentIndex > 0 ? flat[currentIndex - 1] : null
  const next = currentIndex < flat.length - 1 ? flat[currentIndex + 1] : null
  const nextState = next ? videoStates.get(next.video.id) : null

  const upNext = flat.slice(currentIndex + 1, currentIndex + 6)

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10">
      <Link
        href={`/portal/course/${slug}`}
        className="inline-flex items-center gap-2 text-sm font-medium text-accent hover:underline"
      >
        <ArrowLeft className="size-4" />
        Back to course
      </Link>

      <div className="mt-6 grid grid-cols-1 gap-x-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <p className="text-sm font-semibold uppercase tracking-widest text-accent">
            {module.title}
          </p>
          <h1 className="mt-1 text-3xl font-bold text-foreground text-balance">
            {video.title}
          </h1>
          {video.description && (
            <p className="mt-2 text-muted-foreground leading-relaxed">
              {video.description}
            </p>
          )}
        </div>

        <h2 className="mt-6 text-sm font-semibold uppercase tracking-widest text-muted-foreground lg:mt-0 lg:self-end">
          Up next
        </h2>

        <div className="lg:col-span-2">
          <div className="mt-5">
            <VideoPlayer
              videoId={video.id}
              courseId={course.id}
              moduleId={module.id}
              videoPathname={video.video_url}
              thumbnailPathname={video.thumbnail_url}
              durationSeconds={
                video.duration_seconds ? Number(video.duration_seconds) : null
              }
              initialCompleted={currentState?.completed ?? false}
              initialPosition={currentState?.furthestPosition ?? 0}
              nextHref={
                next ? `/portal/course/${slug}/video/${next.video.id}` : null
              }
              courseHref={`/portal/course/${slug}`}
            />
          </div>

        </div>

        <aside className="mt-8 lg:mt-5">
          <ul className="flex h-full flex-col gap-3">
            {upNext.length === 0 && (
              <li className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
                This is the last video in the course.
              </li>
            )}
            {upNext.map(({ video: nextVideo, module: nextModule }) => {
              const s = videoStates.get(nextVideo.id)
              const locked = s?.locked ?? true
              const inner = (
                <div className="flex h-full items-center gap-3 rounded-lg border border-border bg-card p-3">
                  <div className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-md bg-zinc-900">
                    {nextVideo.thumbnail_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={mediaUrl(nextVideo.thumbnail_url) || '/placeholder.svg'}
                        alt=""
                        className={`absolute inset-0 size-full object-cover ${locked ? 'opacity-40' : ''}`}
                      />
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      {locked ? (
                        <Lock className="size-4 text-white/80" aria-hidden />
                      ) : (
                        <span className="flex size-7 items-center justify-center rounded-full bg-white/90">
                          <Play
                            className="ml-px size-3 fill-zinc-900 text-zinc-900"
                            aria-hidden
                          />
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs uppercase tracking-wider text-muted-foreground">
                      {nextModule.title}
                    </p>
                    <p
                      className={`mt-0.5 line-clamp-2 text-sm ${locked ? 'text-muted-foreground' : 'font-medium text-foreground'}`}
                    >
                      {nextVideo.title}
                    </p>
                  </div>
                </div>
              )
              return (
                <li key={nextVideo.id} className="lg:flex-1">
                  {locked ? (
                    inner
                  ) : (
                    <Link
                      href={`/portal/course/${slug}/video/${nextVideo.id}`}
                      className="block h-full transition-opacity hover:opacity-80"
                    >
                      {inner}
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
        </aside>

        <div className="lg:col-span-2">
          {attachments.length > 0 && (
            <div className="mt-6">
              <h2 className="text-lg font-semibold text-foreground">
                Attachments
              </h2>
              <AttachmentList attachments={attachments} />
            </div>
          )}

          <div className="mt-8 flex items-center justify-between gap-4">
            {prev ? (
              <Link
                href={`/portal/course/${slug}/video/${prev.video.id}`}
                className="flex items-center gap-2 rounded-md border border-input bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                <ArrowLeft className="size-4" />
                Previous Video
              </Link>
            ) : (
              <span />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
