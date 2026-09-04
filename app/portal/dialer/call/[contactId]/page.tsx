import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, Lock } from 'lucide-react'
import {
  accessOwnerId,
  getCurrentParticipant,
  getParticipantById,
} from '@/lib/data/participants'
import {
  getCallHistory,
  getCallQueue,
  getContact,
  getMasterScript,
  getOwnerNiches,
  getScriptFlow,
  getScriptSections,
} from '@/lib/data/reactivation'
import { getOwnerSectors } from '@/lib/data/courses'
import { CallScreen } from '@/components/reactivation/call-screen'

export default async function CallPage({
  params,
}: {
  params: Promise<{ contactId: string }>
}) {
  const { contactId } = await params
  const participant = await getCurrentParticipant()
  if (!participant) redirect(`/login?next=/portal/dialer`)

  const ownerId = accessOwnerId(participant)
  const contact = await getContact(contactId)
  if (!contact || contact.owner_id !== ownerId) notFound()

  const sectors = await getOwnerSectors(ownerId)
  const [niches, script, sections, queue, owner, callHistory, flow] =
    await Promise.all([
      getOwnerNiches(ownerId, sectors),
      getMasterScript(),
      getScriptSections(),
      getCallQueue(ownerId),
      participant.role === 'owner'
        ? Promise.resolve(participant)
        : getParticipantById(ownerId),
      getCallHistory(contactId),
      getScriptFlow(),
    ])

  // Next contact in the queue after this one (for "next call" advance)
  const remaining = queue.filter((q) => q.contact.id !== contactId)
  const nextContactId = remaining[0]?.contact.id ?? null

  // Block calling when the contact's niche isn't active on the account —
  // loading a fallback script would risk running the wrong script live.
  if (contact.niche && !contact.niche_active) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
        <Link
          href="/portal/dialer"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to Dialer
        </Link>
        <div className="mt-6 rounded-lg border-2 border-destructive bg-destructive/10 p-6">
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 size-5 shrink-0 text-destructive" />
            <div>
              <h1 className="text-lg font-semibold text-destructive">
                {contact.niche.name}
                {' isn\u2019t active on this account'}
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-foreground">
                {contact.name} was imported for the{' '}
                <span className="font-semibold">{contact.niche.name}</span>{' '}
                script, but that niche isn&apos;t turned on for your account
                yet. To protect your call, we won&apos;t load a different
                script.
              </p>
              <p className="mt-3 text-sm font-semibold text-foreground">
                Contact the Reactivation Power team to turn on{' '}
                {contact.niche.name}. Once it&apos;s active, {contact.name} will
                automatically be ready to call with the right script — no
                re-import needed.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <Link
        href="/portal/dialer"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to Dialer
      </Link>

      <div className="mt-4">
        <CallScreen
          contact={contact}
          niches={niches}
          scriptBody={script?.body ?? ''}
          sections={sections}
          initialNicheId={
            contact.niche_id ?? participant.selected_niche_id ?? null
          }
          nextContactId={nextContactId}
          callerName={participant.first_name}
          practiceName={owner?.practice_name ?? null}
          officePhone={owner?.office_phone ?? null}
          providerName={
            owner ? `Dr. ${owner.first_name} ${owner.last_name}`.trim() : null
          }
          isProvider={participant.role === 'owner'}
          callHistory={callHistory}
          flowSteps={flow.steps}
          flowChoices={flow.choices}
        />
      </div>
    </div>
  )
}
