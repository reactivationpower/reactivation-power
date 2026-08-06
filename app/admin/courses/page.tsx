import { getAdminClient } from '@/lib/supabase/admin'
import { getCourses } from '@/lib/data/courses'
import { CourseCard } from '@/components/admin/course-card'
import { NewCourseButton } from '@/components/admin/new-course-dialog'

export default async function AdminCoursesPage() {
  const courses = await getCourses()
  const supabase = getAdminClient()

  const counts = await Promise.all(
    courses.map(async (course) => {
      const { data: modules } = await supabase
        .from('modules')
        .select('id')
        .eq('course_id', course.id)
      const moduleIds = (modules ?? []).map((m) => m.id)
      let videoCount = 0
      if (moduleIds.length > 0) {
        const { count } = await supabase
          .from('videos')
          .select('id', { count: 'exact', head: true })
          .in('module_id', moduleIds)
        videoCount = count ?? 0
      }
      return {
        courseId: course.id,
        modules: moduleIds.length,
        videos: videoCount,
      }
    }),
  )
  const countMap = new Map(counts.map((c) => [c.courseId, c]))

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
              moduleCount={countMap.get(course.id)?.modules ?? 0}
              videoCount={countMap.get(course.id)?.videos ?? 0}
            />
          ))}
        </div>
      )}
    </div>
  )
}
