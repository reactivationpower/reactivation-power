'use client'

import { useState, useTransition } from 'react'
import { setNicheAccess } from '@/app/actions/admin'
import { Switch } from '@/components/ui/switch'

export function NicheAccessToggle({
  participantId,
  nicheId,
  initialGranted,
}: {
  participantId: string
  nicheId: string
  initialGranted: boolean
}) {
  const [granted, setGranted] = useState(initialGranted)
  const [pending, startTransition] = useTransition()

  return (
    <Switch
      checked={granted}
      disabled={pending}
      aria-label="Toggle niche access"
      onCheckedChange={(next) => {
        setGranted(next)
        startTransition(async () => {
          await setNicheAccess(participantId, nicheId, next)
        })
      }}
    />
  )
}
