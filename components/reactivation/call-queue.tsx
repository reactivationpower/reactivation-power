import Link from 'next/link'
import { Phone } from 'lucide-react'
import type { QueueItem } from '@/lib/data/reactivation'

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

export function CallQueue({ queue }: { queue: QueueItem[] }) {
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

  return (
    <ul className="flex flex-col gap-3">
      {queue.map(({ follow_up, contact }) => (
        <li
          key={follow_up.id}
          className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card p-4"
        >
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
      ))}
    </ul>
  )
}
