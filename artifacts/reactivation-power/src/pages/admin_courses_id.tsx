// @ts-nocheck
import { useParams } from 'wouter';
import { Link } from "wouter";
// import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { CourseHeaderEditor } from '@/components/admin/course-header-editor'
import { ModuleEditor } from '@/components/admin/module-editor'
import { NewModuleForm } from '@/components/admin/new-module-form'
import { usePageData } from '@/hooks/use-page-data'
import { PageError, PageLoading } from '@/components/page-status'
import NotFound from '@/pages/not-found'

export default function CourseEditorPage() {
  const params = useParams();

  const { id } = params
  const { data, loading, error, notFound } = usePageData<any>(`/admin/courses/${id}`)
  if (loading) return <PageLoading />
  if (notFound) return <NotFound />
  if (error) return <PageError error={error} />
  const { tree, attachments } = data

  return (
    <div className="mx-auto w-full max-w-6xl">
      <Link
        href="/admin/courses"
        className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-accent hover:underline"
      >
        <ArrowLeft className="size-4" />
        Courses
      </Link>

      <CourseHeaderEditor course={tree} />

      <div className="mt-6 flex flex-col gap-6">
        {tree.modules.map((module, index) => (
          <ModuleEditor
            key={module.id}
            module={module}
            courseId={tree.id}
            index={index}
            isFirst={index === 0}
            isLast={index === tree.modules.length - 1}
            attachments={attachments.filter((a) =>
              module.videos.some((v) => v.id === a.video_id),
            )}
          />
        ))}
        <NewModuleForm courseId={tree.id} />
      </div>
    </div>
  )
}
