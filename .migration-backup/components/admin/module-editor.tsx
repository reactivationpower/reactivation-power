'use client'

import { useState, useTransition } from 'react'
import { ChevronDown, ChevronUp, Pencil, Trash2 } from 'lucide-react'
import {
  deleteModule,
  moveModule,
  updateModule,
} from '@/app/actions/admin'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { ModuleWithVideos } from '@/lib/data/courses'
import type { Attachment } from '@/lib/types'
import { VideoRow } from './video-row'
import { NewVideoForm } from './new-video-form'

export function ModuleEditor({
  module,
  courseId,
  index,
  isFirst,
  isLast,
  attachments,
}: {
  module: ModuleWithVideos
  courseId: string
  index: number
  isFirst: boolean
  isLast: boolean
  attachments: Attachment[]
}) {
  const [editing, setEditing] = useState(false)
  const [pending, startTransition] = useTransition()

  function save(formData: FormData) {
    formData.set('id', module.id)
    formData.set('courseId', courseId)
    startTransition(async () => {
      await updateModule(formData)
      setEditing(false)
    })
  }

  function toggleStatus() {
    const formData = new FormData()
    formData.set('id', module.id)
    formData.set('courseId', courseId)
    formData.set('status', module.status === 'live' ? 'draft' : 'live')
    startTransition(async () => {
      await updateModule(formData)
    })
  }

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
        {editing ? (
          <form action={save} className="flex flex-1 flex-col gap-2">
            <Input name="title" defaultValue={module.title} required />
            <Textarea
              name="description"
              defaultValue={module.description ?? ''}
              placeholder="Module description (optional)"
              rows={2}
            />
            <div className="flex items-center gap-2">
              <Button type="submit" size="sm" disabled={pending}>
                Save
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-foreground">
                <span className="text-accent">{index + 1}.</span>{' '}
                {module.title}
              </h2>
              <Badge
                variant="outline"
                className={
                  module.status === 'live'
                    ? 'border-accent/40 bg-accent/10 text-accent'
                    : 'border-input bg-muted text-muted-foreground'
                }
              >
                {module.status === 'live' ? 'Live' : 'Draft'}
              </Badge>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  startTransition(() => moveModule(module.id, courseId, 'up'))
                }
                disabled={isFirst || pending}
                aria-label="Move module up"
              >
                <ChevronUp className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  startTransition(() => moveModule(module.id, courseId, 'down'))
                }
                disabled={isLast || pending}
                aria-label="Move module down"
              >
                <ChevronDown className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setEditing(true)}
                aria-label="Edit module"
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={toggleStatus}
                disabled={pending}
              >
                {module.status === 'live' ? 'Set draft' : 'Set live'}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  if (
                    confirm(
                      `Delete module "${module.title}" and all its videos?`,
                    )
                  ) {
                    startTransition(() => deleteModule(module.id, courseId))
                  }
                }}
                aria-label="Delete module"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </>
        )}
      </header>

      <div>
        {module.videos.map((video, videoIndex) => (
          <VideoRow
            key={video.id}
            video={video}
            courseId={courseId}
            moduleIndex={index}
            videoIndex={videoIndex}
            isFirst={videoIndex === 0}
            isLast={videoIndex === module.videos.length - 1}
            attachments={attachments.filter((a) => a.video_id === video.id)}
          />
        ))}
        <div className="p-4">
          <NewVideoForm moduleId={module.id} courseId={courseId} />
        </div>
      </div>
    </section>
  )
}
