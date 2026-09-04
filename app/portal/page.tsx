import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PlayCircle } from 'lucide-react'
import {
  accessOwnerId,
  getCurrentParticipant,
  getStaffMembers,
} from '@/lib/data/participants'
import {
  getAccessibleCourses,
  getCourseTree,
  getOwnerSectors,
} from '@/lib/data/courses'
import {
  computeCourseState,
  getProgressForParticipant,
} from '@/lib/data/progress'
import { MAX_STAFF } from '@/lib/types'
import { AddCallerDialog } from '@/components/reactivation/add-caller-dialog'

export default async function PortalHomePage() {
  const participant = await getCurrentParticipant()
  if (!participant) redirect('/login')

  const ownerId = accessOwnerId(participant)
  const isOwner = participant.role === 'owner'
  const [courses, staff, sectors] = await Promise.all([
    getAccessibleCourses(ownerId),
    isOwner ? getStaffMembers(ownerId) : Promise.resolve([]),
    getOwnerSectors(ownerId),
  ])
  const entityLabel = sectors.includes('healthcare') ? 'practice' : 'business'
  const activeStaff = staff.filter((s) => s.is_active).length

  const withProgress = await Promise.all(
    courses.map(async (course) => {
      const tree = await getCourseTree(course.id, true)
      if (!tree) return { course, completed: 0, total: 0, percent: 0 }
      const videoIds = tree.modules.flatMap((m) => m.videos.map((v) => v.id))
      const progress = await getProgressForParticipant(
        participant.id,
        videoIds,
      )
      const state = computeCourseState(tree, progress)
      return {
        course,
        completed: state.completedVideos,
        total: state.totalVideos,
        percent: state.percentComplete,
      }
    }),
  )

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold uppercase tracking-widest text-accent">
            Reactivation Power
          </p>
          <h1 className="mt-2 text-4xl font-bold text-foreground text-balance">
            Training Portal
          </h1>
          <p className="mt-2 text-muted-foreground">
            Welcome back, {participant.first_name}. Pick a course below to
            start or continue your training.
          </p>
        </div>
        {isOwner && (
          <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end sm:pt-1">
            <AddCallerDialog
              entityLabel={entityLabel}
              activeCount={activeStaff}
              triggerLabel="Add Staff Member"
              triggerVariant="default"
              triggerSize="default"
            />
            <p className="text-xs text-muted-foreground">
              {activeStaff}/{MAX_STAFF} active · new staff see this training
              first
            </p>
          </div>
        )}
      </div>

      <div className="mt-8 flex flex-col gap-4">
        {withProgress.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <p className="font-medium text-foreground">
              No courses assigned yet
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Contact your administrator to get access to training courses.
            </p>
          </div>
        ) : (
          withProgress.map(({ course, completed, total, percent }) => (
            <Link
              key={course.id}
              href={`/portal/course/${course.slug}`}
              className="group rounded-lg border border-border bg-card p-6 transition-colors hover:border-accent"
            >
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-xl font-semibold text-foreground">
                  {course.title}
                </h2>
                <PlayCircle className="size-6 shrink-0 text-accent" />
              </div>
              {course.description && (
                <p className="mt-2 text-muted-foreground leading-relaxed">
                  {course.description}
                </p>
              )}
              <div className="mt-4">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-accent transition-all"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {completed} of {total} videos complete
                  </span>
                  <span className="font-medium text-accent group-hover:underline">
                    {completed > 0 ? 'Continue →' : 'Start →'}
                  </span>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}
