'use client'

import { useRef, useState, useTransition } from 'react'
import { Plus } from 'lucide-react'
import { createVideo } from '@/app/actions/admin'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function NewVideoForm({
  moduleId,
  courseId,
}: {
  moduleId: string
  courseId: string
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="gap-2 text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <Plus className="size-4" />
        Add video
      </Button>
    )
  }

  return (
    <form
      ref={formRef}
      action={(formData) => {
        formData.set('moduleId', moduleId)
        formData.set('courseId', courseId)
        setError(null)
        startTransition(async () => {
          const result = await createVideo(formData)
          if (result.error) {
            setError(result.error)
          } else {
            formRef.current?.reset()
            setOpen(false)
          }
        })
      }}
      className="flex flex-col gap-3 rounded-lg border border-dashed border-input p-3"
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          name="title"
          placeholder="Video title"
          required
          className="flex-1"
        />
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? 'Adding...' : 'Add video'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Add the video first, then upload the MP4 from its row.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  )
}
