'use client'

import { useEffect, useState } from 'react'
import { PhoneCall } from 'lucide-react'
import type { QueueItem } from '@/lib/data/reactivation'
import { suggestedCallTime, bandIndex } from '@/lib/call-time'
import { CallQueue } from './call-queue'
import { AddMoreCalls } from './add-more-calls'

/** Current time-of-day band from the caller's own device clock. */
function currentBandIndex(): 0 | 1 | 2 {
  const hour = new Date().getHours()
  if (hour < 12) return 0 // Morning
  if (hour < 15) return 1 // Midday
  return 2 // Afternoon
}

function byDueAt(a: QueueItem, b: QueueItem): number {
  return (
    new Date(a.follow_up.due_at).getTime() -
    new Date(b.follow_up.due_at).getTime()
  )
}

function SectionLabel({
  children,
  count,
}: {
  children: React.ReactNode
  count: number
}) {
  return (
    <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
        {count}
      </span>
    </h3>
  )
}

interface Props {
  /** Scheduled callbacks due today (retry / manual / quarterly). */
  followUps: QueueItem[]
  /** Fresh cold-list calls released from reserve (batch-capped). */
  newCalls: QueueItem[]
  /** Uncalled contacts still held in reserve. */
  waiting: number
  /** The account's batch target. */
  batchSize: number
}

/**
 * The "Calls Due Today" section. Ordering is anchored to the caller's own
 * device clock so the caller can simply work top-down:
 *   - Calls due now = follow-ups whose window is now (or has no set time) +
 *     the fresh cold-call batch (always callable).
 *   - Coming up later today = follow-ups whose window hasn't arrived yet.
 *   - Follow-ups whose window already passed are dropped from today; they
 *     resurface in their window tomorrow, flagged overdue.
 */
export function CallsDueSection({
  followUps,
  newCalls,
  waiting,
  batchSize,
}: Props) {
  // "now" depends on the device clock, so resolve it after mount. Until then
  // (and during SSR) render a deterministic order to avoid hydration mismatch.
  const [current, setCurrent] = useState<0 | 1 | 2 | null>(null)
  useEffect(() => {
    setCurrent(currentBandIndex())
  }, [])

  const nowFollowUps: QueueItem[] = []
  const laterFollowUps: QueueItem[] = []
  if (current === null) {
    // Pre-mount: show every follow-up in the "now" group in due order.
    nowFollowUps.push(...[...followUps].sort(byDueAt))
  } else {
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    for (const item of followUps) {
      const s = suggestedCallTime(item.follow_up.reason, item.follow_up.due_at)
      // No set time (quarterly / 3-month) → always actionable → "now".
      if (!s) {
        nowFollowUps.push(item)
        continue
      }
      // Already overdue from a PREVIOUS day → always actionable → "now",
      // regardless of what time-of-day it was originally suggested for. The
      // band hiding below only applies to slots that were for *today*.
      if (new Date(item.follow_up.due_at) < startOfToday) {
        nowFollowUps.push(item)
        continue
      }
      const b = bandIndex(s.band)
      if (b === current) nowFollowUps.push(item)
      else if (b > current) laterFollowUps.push(item)
      // b < current → today's window passed → hidden (rolls to tomorrow).
    }
    nowFollowUps.sort(byDueAt)
    laterFollowUps.sort(byDueAt)
  }

  // New cold calls are callable any time, so they join "now" after the
  // time-relevant follow-ups.
  const nowItems = [...nowFollowUps, ...newCalls]
  const laterItems = laterFollowUps
  const visibleTotal = nowItems.length + laterItems.length

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center gap-2">
        <PhoneCall className="size-5 text-accent" />
        <h2 className="text-xl font-semibold text-foreground">
          Calls Due Today
        </h2>
        <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-sm font-medium text-accent">
          {visibleTotal}
        </span>
        {waiting > 0 && (
          <span className="text-sm text-muted-foreground">
            · {waiting} in reserve
          </span>
        )}
      </div>

      {visibleTotal === 0 ? (
        waiting > 0 ? (
          <div className="mt-4">
            <AddMoreCalls
              waiting={waiting}
              batchSize={batchSize}
              variant="prominent"
            />
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-input bg-card p-10 text-center">
            <p className="font-medium text-foreground">All caught up</p>
            <p className="mt-1 text-sm text-muted-foreground">
              No calls are due right now. Follow-ups will reappear here in their
              time slot, and new calls release as you work.
            </p>
          </div>
        )
      ) : (
        <>
          <div className="mt-6">
            <SectionLabel count={nowItems.length}>Calls due now</SectionLabel>
            {nowItems.length > 0 ? (
              <CallQueue queue={nowItems} />
            ) : (
              <p className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                No calls to make right now.
              </p>
            )}
            {waiting > 0 && (
              <div className="mt-3">
                <AddMoreCalls
                  waiting={waiting}
                  batchSize={batchSize}
                  variant={nowItems.length === 0 ? 'prominent' : 'subtle'}
                />
              </div>
            )}
          </div>

          {laterItems.length > 0 && (
            <div className="mt-6">
              <SectionLabel count={laterItems.length}>
                Coming up later today
              </SectionLabel>
              <CallQueue queue={laterItems} />
            </div>
          )}
        </>
      )}
    </section>
  )
}
