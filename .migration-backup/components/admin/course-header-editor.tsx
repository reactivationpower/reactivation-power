'use client'

import { useState, useTransition } from 'react'
import { Pencil } from 'lucide-react'
import { updateCourse } from '@/app/actions/admin'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { Course } from '@/lib/types'

export function CourseHeaderEditor({ course }: { course: Course }) {
  const [editing, setEditing] = useState(false)
  const [pending, startTransition] = useTransition()

  function save(formData: FormData) {
    formData.set('id', course.id)
    startTransition(async () => {
      await updateCourse(formData)
      setEditing(false)
    })
  }

  if (editing) {
    return (
      <form
        action={save}
        className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5"
      >
        <Input
          name="title"
          defaultValue={course.title}
          className="text-lg font-semibold"
          aria-label="Course title"
          required
        />
        <Textarea
          name="description"
          defaultValue={course.description ?? ''}
          placeholder="Course description"
          rows={2}
          aria-label="Course description"
        />
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? 'Saving...' : 'Save'}
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
    )
  }

  return (
    <div>
      <p className="text-sm font-medium text-accent">Training</p>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold text-foreground">{course.title}</h1>
        <Badge
          variant="outline"
          className={
            course.status === 'live'
              ? 'border-accent/40 bg-accent/10 text-accent'
              : 'border-input bg-muted text-muted-foreground'
          }
        >
          {course.status === 'live' ? 'Live' : 'Draft'}
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setEditing(true)}
          className="gap-1.5 text-muted-foreground"
        >
          <Pencil className="size-3.5" />
          Edit
        </Button>
      </div>
      <p className="mt-1 text-muted-foreground">
        {course.description ||
          'Upload an MP4 for each video. Viewers progress module by module, video by video.'}
      </p>
    </div>
  )
}
