// @ts-nocheck

import { useEffect, useState, useTransition } from 'react'
import { setNicheAccess } from '@/app/actions/admin'
import { Switch } from '@/components/ui/switch'
import { refreshPageData } from '@/hooks/use-router'

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
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  useEffect(() => setGranted(initialGranted), [initialGranted])

  return (
    <div className="flex flex-col items-end gap-1">
    <Switch
      checked={granted}
      disabled={pending}
      aria-label="Toggle niche access"
      onCheckedChange={(next) => {
        setGranted(next)
        setError(null)
        startTransition(async () => {
          try {
            await setNicheAccess(participantId, nicheId, next)
            refreshPageData()
          } catch (err) {
            setGranted(!next)
            setError(err instanceof Error ? err.message : 'Could not update niche access')
          }
        })
      }}
    />
    {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
