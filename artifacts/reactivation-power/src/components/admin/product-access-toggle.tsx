// @ts-nocheck

import { useEffect, useState, useTransition } from 'react'
import { setProductAccess } from '@/app/actions/admin'
import { Switch } from '@/components/ui/switch'
import { refreshPageData } from '@/hooks/use-router'

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
  useEffect(() => setGranted(initialGranted), [initialGranted])

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
            try {
              const res = await setProductAccess(participantId, product, next)
              if (res?.error) throw new Error(res.error)
              refreshPageData()
            } catch (err) {
              setGranted(!next)
              setError(err instanceof Error ? err.message : 'Could not update product access')
            }
          })
        }}
      />
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    </div>
  )
}
