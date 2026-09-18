'use client'

import { useState, useTransition } from 'react'
import { Loader2, Layers } from 'lucide-react'
import { setCallBatchSize } from '@/app/actions/reactivation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CALL_BATCH_SIZES } from '@/lib/types'

interface Props {
  initialSize: number
}

/**
 * Owner-only control: how many cold-list calls stay live in the queue at
 * once. The queue auto-refills up to this number, so it sets the size of
 * each "batch" a caller works through.
 */
export function BatchSizeSelect({ initialSize }: Props) {
  const [value, setValue] = useState(String(initialSize))
  const [saving, startSaving] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const items = CALL_BATCH_SIZES.map((n) => ({
    value: String(n),
    label: `${n} at a time`,
  }))

  function handleChange(v: string | null) {
    if (!v) return
    setValue(v)
    setError(null)
    startSaving(async () => {
      const res = await setCallBatchSize(Number(v))
      if (res?.error) setError(res.error)
    })
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5">
        <Layers className="size-4 shrink-0 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          Batch size
        </span>
        <Select value={value} onValueChange={handleChange} items={items}>
          <SelectTrigger
            className="h-8 w-36 border-0 bg-transparent px-2 shadow-none"
            aria-label="Calls released at a time"
          >
            <SelectValue />
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
          How many calls stay in the queue at once.
        </p>
      )}
    </div>
  )
}
