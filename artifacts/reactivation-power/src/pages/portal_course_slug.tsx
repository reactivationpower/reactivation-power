// @ts-nocheck
import { useParams } from 'wouter';
import { Link } from "wouter";
import { BookOpen, Lock } from 'lucide-react'
import { VideoThumbnailCard } from '@/components/portal/video-thumbnail-card'
import { usePageData } from '@/hooks/use-page-data'
import { PageError, PageLoading } from '@/components/page-status'
import NotFound from '@/pages/not-found'

export default function CoursePage() {
  const params = useParams();

  const { slug } = params
  const { data, loading, error, notFound } = usePageData<any>(
    `/portal/course/${slug}`,
  )
  if (loading) return <PageLoading />
  if (notFound) return <NotFound />
  if (error) return <PageError error={error} />
  const { participant, course, tree, state, stateByModule } = data

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-12">
      <Link href="/portal/training" className="text-sm font-medium text-accent hover:underline" data-testid="link-course-training">← Training</Link>
      <div className="flex justify-end">
        <Link
          href={`/portal/dialer/script?from=course&course=${course.slug}`}
          className="flex items-center gap-2 rounded-md border border-input bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          <BookOpen className="size-4" />
          Practice Script
        </Link>
      </div>

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
          const moduleState = stateByModule[module.id]
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
