import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, Phone } from 'lucide-react'
import {
  accessOwnerId,
  getCurrentParticipant,
} from '@/lib/data/participants'
import {
  getCallHistory,
  getContact,
  getOwnerNiches,
  getPipelineStages,
} from '@/lib/data/reactivation'
import { DISPOSITION_LABELS } from '@/lib/types'
import { ContactEditor } from '@/components/reactivation/contact-editor'
import { DeleteContactButton } from '@/components/reactivation/delete-contact-button'

export default async function ContactProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const participant = await getCurrentParticipant()
  if (!participant) redirect('/login')
  const ownerId = accessOwnerId(participant)

  const contact = await getContact(id)
  if (!contact || contact.owner_id !== ownerId) notFound()

  const [history, stages, niches] = await Promise.all([
    getCallHistory(id),
    getPipelineStages(ownerId),
    getOwnerNiches(ownerId),
  ])

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <Link
        href="/portal/contacts"
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to Contacts
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            {contact.name}
          </h1>
          <p className="mt-1 text-muted-foreground">
            {contact.phone}
            {contact.email ? ` · ${contact.email}` : ''}
            {contact.niche ? ` · ${contact.niche.name}` : ''}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {contact.stage && (
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-sm font-medium text-muted-foreground">
                {contact.stage.name}
              </span>
            )}
            {contact.do_not_call && (
              <span className="rounded-full bg-destructive/10 px-2.5 py-0.5 text-sm font-medium text-destructive">
                Do Not Call
              </span>
            )}
            {contact.next_follow_up && !contact.do_not_call && (
              <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-sm font-medium text-accent">
                Next call:{' '}
                {new Date(contact.next_follow_up.due_at).toLocaleString(
                  undefined,
                  {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  },
                )}
              </span>
            )}
          </div>
        </div>
        {!contact.do_not_call && (
          <Link
            href={`/portal/dialer/call/${contact.id}`}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Phone className="size-4" />
            Start Call
          </Link>
        )}
      </div>

      <section className="mt-8">
        <ContactEditor contact={contact} stages={stages} niches={niches} />
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-foreground">
          Call History ({history.length})
        </h2>
        {history.length === 0 ? (
          <p className="mt-4 text-muted-foreground">
            No calls logged yet.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {history.map((call) => (
              <li
                key={call.id}
                className="rounded-lg border border-border bg-card p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">
                      {DISPOSITION_LABELS[call.disposition]}
                    </span>
                    {call.voicemail_left && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                        Voicemail left
                      </span>
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {call.caller
                      ? `${call.caller.first_name} ${call.caller.last_name} · `
                      : ''}
                    {new Date(call.created_at).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                {call.notes && (
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {call.notes}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10 flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Delete this contact
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Removes {contact.name} and their call history for good. Use this if
            they were added by mistake.
          </p>
        </div>
        <DeleteContactButton
          contactId={contact.id}
          contactName={contact.name}
        />
      </section>
    </div>
  )
}
