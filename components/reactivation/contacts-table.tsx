'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Phone } from 'lucide-react'
import type { ContactWithMeta } from '@/lib/data/reactivation'
import type { PipelineStage } from '@/lib/types'
import { DISPOSITION_LABELS } from '@/lib/types'
import { cn } from '@/lib/utils'
import { DeleteContactButton } from '@/components/reactivation/delete-contact-button'

export function ContactsTable({
  contacts,
  stages,
}: {
  contacts: ContactWithMeta[]
  stages: PipelineStage[]
}) {
  const [stageFilter, setStageFilter] = useState<string>('all')

  const filtered =
    stageFilter === 'all'
      ? contacts
      : stageFilter === 'dnc'
        ? contacts.filter((c) => c.do_not_call)
        : contacts.filter((c) => c.stage_id === stageFilter && !c.do_not_call)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setStageFilter('all')}
          className={cn(
            'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
            stageFilter === 'all'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:text-foreground',
          )}
        >
          All ({contacts.length})
        </button>
        {stages.map((stage) => {
          const count = contacts.filter(
            (c) => c.stage_id === stage.id && !c.do_not_call,
          ).length
          return (
            <button
              key={stage.id}
              type="button"
              onClick={() => setStageFilter(stage.id)}
              className={cn(
                'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                stageFilter === stage.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              {stage.name} ({count})
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => setStageFilter('dnc')}
          className={cn(
            'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
            stageFilter === 'dnc'
              ? 'bg-destructive text-destructive-foreground'
              : 'bg-muted text-muted-foreground hover:text-foreground',
          )}
        >
          Do Not Call ({contacts.filter((c) => c.do_not_call).length})
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-input bg-card p-10 text-center">
          <p className="font-medium text-foreground">No contacts here</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add a contact to start making reactivation calls.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Phone</th>
                <th className="px-5 py-3 font-medium">Stage</th>
                <th className="px-5 py-3 font-medium">Last Call</th>
                <th className="px-5 py-3 font-medium">Next Follow-up</th>
                <th className="px-5 py-3 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-border last:border-b-0"
                >
                  <td className="px-5 py-3">
                    <Link
                      href={`/portal/reactivation/contacts/${c.id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {c.name}
                    </Link>
                    {c.do_not_call && (
                      <span className="ml-2 rounded bg-destructive/10 px-1.5 py-0.5 text-xs font-medium text-destructive">
                        DNC
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{c.phone}</td>
                  <td className="px-5 py-3">
                    {c.stage ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        {c.stage.name}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {c.last_call
                      ? `${DISPOSITION_LABELS[c.last_call.disposition]} · ${new Date(c.last_call.created_at).toLocaleDateString()}`
                      : 'Never called'}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {c.do_not_call
                      ? '—'
                      : c.next_follow_up
                        ? new Date(c.next_follow_up.due_at).toLocaleDateString(
                            undefined,
                            {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            },
                          )
                        : '—'}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {!c.do_not_call && (
                        <Link
                          href={`/portal/reactivation/call/${c.id}`}
                          className="inline-flex items-center gap-1.5 rounded-md border border-input bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                        >
                          <Phone className="size-3.5" />
                          Call
                        </Link>
                      )}
                      <DeleteContactButton
                        contactId={c.id}
                        contactName={c.name}
                        variant="row"
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
