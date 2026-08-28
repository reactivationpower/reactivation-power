'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Phone, Clock } from 'lucide-react'
import type { QueueItem } from '@/lib/data/reactivation'
import { callTimeBand, easternClock } from '@/lib/call-time'

function dueLabel(dueAt: string): string {
  const due = new Date(dueAt)
  const now = new Date()
  const diffDays = Math.floor(
    (now.getTime() - due.getTime()) / (24 * 60 * 60 * 1000),
  )
  if (diffDays <= 0) return 'Due today'
  if (diffDays === 1) return '1 day overdue'
  return `${diffDays} days overdue`
}

// The scattered time-of-day is only meaningful for retries (no-answer/VM) and
// picked callbacks. Cold-call "initial" releases and the 3-month/quarterly
// defaults have no intentional time, so we don't imply one.
function suggestedTime(
  reason: string,
  dueAt: string,
): { band: string; clock: string } | null {
  if (reason !== 'retry' && reason !== 'manual') return null
  return { band: callTimeBand(dueAt), clock: easternClock(dueAt) }
}

const BAND_INDEX: Record<string, number> = {
  Morning: 0,
  Midday: 1,
  Afternoon: 2,
}

/** Current time-of-day band from the caller's own device clock. */
function currentBandIndex(): number {
  const hour = new Date().getHours()
  if (hour < 12) return 0 // Morning
  if (hour < 15) return 1 // Midday
  return 2 // Afternoon
}

// now = 0, later today = 1, missed earlier = 2. Items without a band (e.g.
// quarterly check-ins) are always actionable, so they ride with "now".
function tierFor(item: QueueItem, current: number): 0 | 1 | 2 {
  const s = suggestedTime(item.follow_up.reason, item.follow_up.due_at)
  if (!s) return 0
  const b = BAND_INDEX[s.band] ?? 0
  if (b === current) return 0
  return b > current ? 1 : 2
}

function byDueAt(a: QueueItem, b: QueueItem): number {
  return (
    new Date(a.follow_up.due_at).getTime() -
    new Date(b.follow_up.due_at).getTime()
  )
}

function QueueRow({ follow_up, contact }: QueueItem) {
  const suggested = suggestedTime(follow_up.reason, follow_up.due_at)
  return (
    <li className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card p-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/portal/reactivation/contacts/${contact.id}`}
            className="font-semibold text-foreground hover:underline"
          >
            {contact.name}
          </Link>
          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
            {dueLabel(follow_up.due_at)}
          </span>
          {suggested && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent"
              title={`Try around ${suggested.clock} (Eastern) — a different time than last call`}
            >
              <Clock className="size-3" />
              Call {suggested.band.toLowerCase()}
            </span>
          )}
          {contact.stage && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {contact.stage.name}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {contact.phone}
          {contact.niche ? ` · ${contact.niche.name}` : ''}
          {contact.call_count > 0
            ? ` · ${contact.call_count} previous call${contact.call_count === 1 ? '' : 's'}`
            : ' · Never called'}
          {suggested ? ` · Suggested ${suggested.clock} ET` : ''}
        </p>
      </div>
      <Link
        href={`/portal/reactivation/call/${contact.id}`}
        className="flex shrink-0 items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <Phone className="size-4" />
        Start Call
      </Link>
    </li>
  )
}

function TierCaption({ children }: { children: React.ReactNode }) {
  return (
    <li className="px-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </li>
  )
}

export function CallQueue({
  queue,
  timeAnchored = false,
}: {
  queue: QueueItem[]
  /** When true, order by the caller's current time of day (follow-ups). */
  timeAnchored?: boolean
}) {
  // "now" is device-clock dependent, so it must resolve on the client after
  // mount. Until then (and on the server), render the plain due-at order to
  // avoid a hydration mismatch.
  const [current, setCurrent] = useState<number | null>(null)
  useEffect(() => {
    if (timeAnchored) setCurrent(currentBandIndex())
  }, [timeAnchored])

  if (queue.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-input bg-card p-10 text-center">
        <p className="font-medium text-foreground">All caught up</p>
        <p className="mt-1 text-sm text-muted-foreground">
          No calls are due right now. New follow-ups will appear here when
          they&apos;re due.
        </p>
      </div>
    )
  }

  // Not time-anchored, or not yet mounted: simple due-at order.
  if (!timeAnchored || current === null) {
    return (
      <ul className="flex flex-col gap-3">
        {queue.map((item) => (
          <QueueRow key={item.follow_up.id} {...item} />
        ))}
      </ul>
    )
  }

  const now: QueueItem[] = []
  const later: QueueItem[] = []
  const missed: QueueItem[] = []
  for (const item of queue) {
    const t = tierFor(item, current)
    if (t === 0) now.push(item)
    else if (t === 1) later.push(item)
    else missed.push(item)
  }
  now.sort(byDueAt)
  later.sort(byDueAt)
  missed.sort(byDueAt)

  return (
    <ul className="flex flex-col gap-3">
      {now.map((item) => (
        <QueueRow key={item.follow_up.id} {...item} />
      ))}

      {later.length > 0 && <TierCaption>Coming up later today</TierCaption>}
      {later.map((item) => (
        <QueueRow key={item.follow_up.id} {...item} />
      ))}

      {missed.length > 0 && (
        <TierCaption>Earlier time slot — call when you can</TierCaption>
      )}
      {missed.map((item) => (
        <QueueRow key={item.follow_up.id} {...item} />
      ))}
    </ul>
  )
}
