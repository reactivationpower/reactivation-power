import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Lock } from 'lucide-react'
import { VideoThumbnailCard } from '@/components/portal/video-thumbnail-card'
import {
  accessOwnerId,
  getCurrentParticipant,
} from '@/lib/data/participants'
import {
  getAccessibleCourseIds,
  getCourseBySlug,
  getCourseTree,
} from '@/lib/data/courses'
import {
  computeCourseState,
  getProgressForParticipant,
} from '@/lib/data/progress'

export default async function CoursePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const participant = await getCurrentParticipant()
  if (!participant) redirect(`/?next=/portal/course/${slug}`)

  const course = await getCourseBySlug(slug)
  if (!course || course.status !== 'live') notFound()

  const accessibleIds = await getAccessibleCourseIds(
    accessOwnerId(participant),
  )
  if (!accessibleIds.includes(course.id)) {
    redirect('/portal')
  }

  const tree = await getCourseTree(course.id, true)
  if (!tree) notFound()

  const videoIds = tree.modules.flatMap((m) => m.videos.map((v) => v.id))
  const progress = await getProgressForParticipant(participant.id, videoIds)
  const state = computeCourseState(tree, progress)
  const stateByModule = new Map(state.modules.map((m) => [m.moduleId, m]))

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-12">
      <div className="text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-accent">
          Video Training
        </p>
        <h1 className="mt-2 text-4xl font-bold text-foreground text-balance">
          {course.title}
        </h1>
        {course.description && (
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground leading-relaxed text-pretty">
            {course.description}
          </p>
        )}
        <p className="mt-4 text-foreground">
          Welcome back, <strong>{participant.first_name}</strong>
        </p>
        <div className="mx-auto mt-4 max-w-xl">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {state.completedVideos} of {state.totalVideos} videos complete
            </span>
            <span className="font-semibold text-foreground">
              {state.percentComplete}%
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${state.percentComplete}%` }}
            />
          </div>
        </div>
      </div>

      <div className="mt-10 flex flex-col gap-6">
        {tree.modules.map((module, moduleIndex) => {
          const moduleState = stateByModule.get(module.id)
          const locked = moduleState?.locked ?? false
          const videoStateById = new Map(
            (moduleState?.videos ?? []).map((v) => [v.videoId, v]),
          )

          return (
            <section
              key={module.id}
              className="overflow-hidden rounded-lg border border-border bg-card"
            >
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
                <div className="flex items-center gap-4">
                  <span
                    className={`flex size-10 shrink-0 items-center justify-center rounded-md text-lg font-semibold ${
                      locked
                        ? 'bg-muted text-muted-foreground'
                        : 'bg-accent/10 text-accent'
                    }`}
                  >
                    {moduleIndex + 1}
                  </span>
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">
                      {module.title}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {moduleState?.completedCount ?? 0} /{' '}
                      {moduleState?.totalCount ?? 0} complete
                    </p>
                  </div>
                </div>
                {locked && (
                  <span className="flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-sm text-muted-foreground">
                    <Lock className="size-3.5" />
                    Complete the previous module to unlock
                  </span>
                )}
              </header>

              <ul className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
                {module.videos.map((video) => {
                  const videoState = videoStateById.get(video.id)
                  const videoLocked = videoState?.locked ?? false
                  const completed = videoState?.completed ?? false

                  const card = (
                    <VideoThumbnailCard
                      moduleTitle={module.title}
                      videoTitle={video.title}
                      thumbnailPathname={video.thumbnail_url}
                      durationSeconds={
                        video.duration_seconds
                          ? Number(video.duration_seconds)
                          : null
                      }
                      completed={completed}
                      locked={videoLocked}
                    />
                  )

                  return (
                    <li key={video.id}>
                      {videoLocked ? (
                        card
                      ) : (
                        <Link
                          href={`/portal/course/${course.slug}/video/${video.id}`}
                          className="group block transition-opacity hover:opacity-95"
                          aria-label={`Play ${video.title}`}
                        >
                          {card}
                        </Link>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}
