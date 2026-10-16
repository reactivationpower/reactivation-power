// @ts-nocheck
import { CourseCard } from '@/components/admin/course-card'
import { NewCourseButton } from '@/components/admin/new-course-dialog'
import { usePageData } from '@/hooks/use-page-data'
import { PageError, PageLoading } from '@/components/page-status'

export default function AdminCoursesPage() {
  const { data, loading, error } = usePageData<any>('/admin/courses')
  if (loading) return <PageLoading />
  if (error) return <PageError error={error} />
  const { courses, countMap } = data

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-accent">Training</p>
          <h1 className="mt-1 text-3xl font-bold text-foreground">Courses</h1>
          <p className="mt-1 text-muted-foreground">
            Share a course link to give access — viewers unlock content by
            progressing through it
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {courses.length} course{courses.length === 1 ? '' : 's'}
          </span>
          <NewCourseButton />
        </div>
      </div>

      {courses.length === 0 ? (
        <div className="rounded-lg border border-dashed border-input bg-card p-12 text-center">
          <p className="font-medium text-foreground">No courses yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your first course to start adding modules and videos.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {courses.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              moduleCount={countMap[course.id]?.modules ?? 0}
              videoCount={countMap[course.id]?.videos ?? 0}
            />
          ))}
        </div>
      )}
    </div>
  )
}
