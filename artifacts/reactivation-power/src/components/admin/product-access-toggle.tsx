// @ts-nocheck

import { useState, useTransition } from 'react'
import { setProductAccess } from '@/app/actions/admin'
import { Switch } from '@/components/ui/switch'

/** Same pattern as the course toggle: optimistic flip, server call behind it. */
export function ProductAccessToggle({
  participantId,
  product,
  initialGranted,
}: {
  participantId: string
  product: 'lead_followup'
  initialGranted: boolean
}) {
  const [granted, setGranted] = useState(initialGranted)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex flex-col items-end gap-1">
      <Switch
        checked={granted}
        disabled={pending}
        aria-label="Toggle Lead Follow-Up access"
        data-testid={`switch-product-${product}`}
        onCheckedChange={(next) => {
          setGranted(next)
          setError(null)
          startTransition(async () => {
            const res = await setProductAccess(participantId, product, next)
            if (res?.error) {
              setGranted(!next)
              setError(res.error)
            }
          })
        }}
      />
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
