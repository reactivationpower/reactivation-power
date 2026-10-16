'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { addMoreCalls } from '@/app/actions/reactivation'

interface Props {
  /** Uncalled contacts still held in reserve */
  waiting: number
  /** Batch size to pull per click */
  batchSize: number
  /**
   * Subtle = a quiet inline link (queue still has work but is running low).
   * Prominent = a full button (queue is empty but reserve remains).
   */
  variant: 'subtle' | 'prominent'
}

/**
 * "Add More Calls" — pulls the next batch of reserve contacts into the queue
 * on demand. Only rendered when there are contacts still waiting in reserve.
 */
export function AddMoreCalls({ waiting, batchSize, variant }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (waiting <= 0) return null
  const pull = Math.min(batchSize, waiting)

  function handleClick() {
    setError(null)
    startTransition(async () => {
      const res = await addMoreCalls(batchSize)
      if (res?.error) setError(res.error)
      else router.refresh()
    })
  }

  if (variant === 'prominent') {
    return (
      <div className="rounded-lg border border-dashed border-input bg-card p-10 text-center">
        <p className="font-medium text-foreground">Batch complete</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Nice work — you&apos;ve cleared this batch. There{' '}
          {waiting === 1 ? 'is' : 'are'}{' '}
          <span className="font-medium text-foreground">{waiting}</span> more
          ready when you are.
        </p>
        <button
          type="button"
          onClick={handleClick}
          disabled={pending}
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          Add {pull} more call{pull === 1 ? '' : 's'}
        </button>
        {error ? (
          <p className="mt-2 text-xs text-destructive">{error}</p>
        ) : null}
      </div>
    )
  }

  // Subtle inline top-up shown under a queue that still has work
  return (
    <div className="flex items-center justify-center pt-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-accent transition-colors hover:text-accent/80 disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Plus className="size-3.5" />
        )}
        Add {pull} more call{pull === 1 ? '' : 's'}
        <span className="text-muted-foreground">
          ({waiting} waiting)
        </span>
      </button>
      {error ? (
        <p className="ml-2 text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  )
}
