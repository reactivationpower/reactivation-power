'use client'

import { useState, useTransition } from 'react'
import { setCourseAccess } from '@/app/actions/admin'
import { Switch } from '@/components/ui/switch'

export function CourseAccessToggle({
  participantId,
  courseId,
  initialGranted,
}: {
  participantId: string
  courseId: string
  initialGranted: boolean
}) {
  const [granted, setGranted] = useState(initialGranted)
  const [pending, startTransition] = useTransition()

  return (
    <Switch
      checked={granted}
      disabled={pending}
      aria-label="Toggle course access"
      onCheckedChange={(next) => {
        setGranted(next)
        startTransition(async () => {
          await setCourseAccess(participantId, courseId, next)
        })
      }}
    />
  )
}
