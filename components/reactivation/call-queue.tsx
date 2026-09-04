import Link from 'next/link'
import { Phone, Clock, Lock } from 'lucide-react'
import type { QueueItem } from '@/lib/data/reactivation'
import { suggestedCallTime } from '@/lib/call-time'

/**
 * Calendar-day comparison, not elapsed hours: a call due yesterday at 2 PM is
 * "1 day overdue" first thing this morning, not "Due today" until 2 PM.
 */
function dueLabel(dueAt: string): string {
  const due = new Date(dueAt)
  const now = new Date()
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate())
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diffDays = Math.round(
    (today.getTime() - dueDay.getTime()) / (24 * 60 * 60 * 1000),
  )
  if (diffDays <= 0) return 'Due today'
  if (diffDays === 1) return '1 day overdue'
  return `${diffDays} days overdue`
}

function QueueRow({ follow_up, contact }: QueueItem) {
  const suggested = suggestedCallTime(follow_up.reason, follow_up.due_at)
  const overdue = dueLabel(follow_up.due_at) !== 'Due today'
  const nicheInactive = !!contact.niche && !contact.niche_active
  return (
    <li className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card p-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/portal/contacts/${contact.id}`}
            className="font-semibold text-foreground hover:underline"
          >
            {contact.name}
          </Link>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              overdue
                ? 'bg-destructive/15 text-destructive'
                : 'bg-destructive/10 text-destructive'
            }`}
          >
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
          {nicheInactive && (
            <span className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
              <Lock className="size-3" />
              {contact.niche!.name} — not active
            </span>
          )}
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {contact.phone}
          {contact.niche && !nicheInactive ? ` · ${contact.niche.name}` : ''}
          {contact.call_count > 0
            ? ` · ${contact.call_count} previous call${contact.call_count === 1 ? '' : 's'}`
            : ' · Never called'}
          {suggested ? ` · Suggested ${suggested.clock} ET` : ''}
        </p>
      </div>
      {nicheInactive ? (
        <div className="flex shrink-0 flex-col items-end gap-1 text-right">
          <span className="flex items-center gap-2 rounded-md bg-muted px-4 py-2.5 text-sm font-medium text-muted-foreground">
            <Lock className="size-4" />
            Start Call
          </span>
          <span className="max-w-[190px] text-xs leading-tight text-destructive">
            This niche isn&apos;t active — contact the Reactivation Power team
            to turn it on.
          </span>
        </div>
      ) : (
        <Link
          href={`/portal/dialer/call/${contact.id}`}
          className="flex shrink-0 items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Phone className="size-4" />
          Start Call
        </Link>
      )}
    </li>
  )
}

/** Plain ordered list of queue rows. Bucketing/ordering is done by the caller. */
export function CallQueue({ queue }: { queue: QueueItem[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {queue.map((item) => (
        <QueueRow key={item.follow_up.id} {...item} />
      ))}
    </ul>
  )
}
