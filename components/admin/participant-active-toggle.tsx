'use client'

import { useState, useTransition } from 'react'
import { updateParticipant } from '@/app/actions/admin'
import { Switch } from '@/components/ui/switch'

export function ParticipantActiveToggle({
  participantId,
  initialActive,
}: {
  participantId: string
  initialActive: boolean
}) {
  const [active, setActive] = useState(initialActive)
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={active}
        disabled={pending}
        aria-label="Toggle account active"
        onCheckedChange={(next) => {
          setActive(next)
          startTransition(async () => {
            const fd = new FormData()
            fd.set('id', participantId)
            fd.set('isActive', String(next))
            await updateParticipant(fd)
          })
        }}
      />
      <span className="text-sm text-muted-foreground">
        {active ? 'Active' : 'Disabled'}
      </span>
    </div>
  )
}
