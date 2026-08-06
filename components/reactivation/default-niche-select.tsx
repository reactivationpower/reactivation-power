'use client'

import { useState, useTransition } from 'react'
import { Loader2, Target } from 'lucide-react'
import { setDefaultNiche } from '@/app/actions/reactivation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Niche } from '@/lib/types'

const NONE = '__none__'

interface Props {
  niches: Niche[]
  initialNicheId: string | null
}

/**
 * Owner-only control: the practice's default niche. Imported contacts with
 * no service match (and CSVs with no service column) fall back to this.
 */
export function DefaultNicheSelect({ niches, initialNicheId }: Props) {
  const [value, setValue] = useState(initialNicheId ?? NONE)
  const [saving, startSaving] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const items = [
    { value: NONE, label: 'No default niche' },
    ...niches.map((n) => ({ value: n.id, label: n.name })),
  ]

  function handleChange(v: string | null) {
    if (!v) return
    setValue(v)
    setError(null)
    startSaving(async () => {
      const res = await setDefaultNiche(v === NONE ? '' : v)
      if (res?.error) setError(res.error)
    })
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5">
        <Target className="size-4 shrink-0 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          Default niche
        </span>
        <Select value={value} onValueChange={handleChange} items={items}>
          <SelectTrigger
            className="h-8 w-48 border-0 bg-transparent px-2 shadow-none"
            aria-label="Account default niche"
          >
            <SelectValue placeholder="No default niche" />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {saving && (
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
        )}
      </div>
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Used when an imported contact has no matching service type.
        </p>
      )}
    </div>
  )
}
