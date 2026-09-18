import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getAttachmentsForVideos, getCourseTree } from '@/lib/data/courses'
import { CourseHeaderEditor } from '@/components/admin/course-header-editor'
import { ModuleEditor } from '@/components/admin/module-editor'
import { NewModuleForm } from '@/components/admin/new-module-form'

export default async function CourseEditorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const tree = await getCourseTree(id)
  if (!tree) notFound()

  const videoIds = tree.modules.flatMap((m) => m.videos.map((v) => v.id))
  const attachments = await getAttachmentsForVideos(videoIds)

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
