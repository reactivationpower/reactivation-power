'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { Check, Layers, LinkIcon, PlayCircle } from 'lucide-react'
import { updateCourse } from '@/app/actions/admin'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SECTOR_LABELS, type Course } from '@/lib/types'

export function CourseCard({
  course,
  moduleCount,
  videoCount,
}: {
  course: Course
  moduleCount: number
  videoCount: number
}) {
  const [copied, setCopied] = useState(false)
  const [pending, startTransition] = useTransition()

  function copyLink() {
    const url = `${window.location.origin}/portal/course/${course.slug}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function toggleStatus() {
    startTransition(async () => {
      const formData = new FormData()
      formData.set('id', course.id)
      formData.set('status', course.status === 'live' ? 'draft' : 'live')
      await updateCourse(formData)
    })
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h2 className="truncate text-lg font-semibold text-foreground">
            {course.title}
          </h2>
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
          <Badge variant="secondary">
            {SECTOR_LABELS[course.sector] ?? course.sector}
          </Badge>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Layers className="size-4" />
            {moduleCount} module{moduleCount === 1 ? '' : 's'}
          </span>
          <span className="flex items-center gap-1.5">
            <PlayCircle className="size-4" />
            {videoCount} video{videoCount === 1 ? '' : 's'}
          </span>
          <span className="font-mono text-xs">
            /portal/course/{course.slug}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="outline" size="sm" onClick={copyLink} className="gap-2">
          {copied ? (
            <Check className="size-4 text-success" />
          ) : (
            <LinkIcon className="size-4" />
          )}
          {copied ? 'Copied' : 'Copy link'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={toggleStatus}
          disabled={pending}
        >
          {course.status === 'live' ? 'Unpublish' : 'Publish'}
        </Button>
        <Button
          size="sm"
          nativeButton={false}
          render={<Link href={`/admin/courses/${course.id}`} />}
        >
          Edit
        </Button>
      </div>
    </div>
  )
}
