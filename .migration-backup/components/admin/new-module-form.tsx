'use client'

import { useRef, useState, useTransition } from 'react'
import { Plus } from 'lucide-react'
import { createModule } from '@/app/actions/admin'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function NewModuleForm({ courseId }: { courseId: string }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  if (!open) {
    return (
      <Button
        variant="outline"
        className="gap-2 border-dashed"
        onClick={() => setOpen(true)}
      >
        <Plus className="size-4" />
        Add module
      </Button>
    )
  }

  return (
    <form
      ref={formRef}
      action={(formData) => {
        formData.set('courseId', courseId)
        setError(null)
        startTransition(async () => {
          const result = await createModule(formData)
          if (result.error) {
            setError(result.error)
          } else {
            formRef.current?.reset()
            setOpen(false)
          }
        })
      }}
      className="flex flex-col gap-3 rounded-lg border border-dashed border-input bg-card p-4"
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          name="title"
          placeholder="Module title, e.g. Introduction to Training"
          required
          className="flex-1"
        />
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? 'Adding...' : 'Add module'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  )
}
