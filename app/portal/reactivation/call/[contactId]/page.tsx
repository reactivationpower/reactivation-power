import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
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
  getNiches,
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
  if (!participant) redirect(`/?next=/portal/reactivation`)

  const ownerId = accessOwnerId(participant)
  const contact = await getContact(contactId)
  if (!contact || contact.owner_id !== ownerId) notFound()

  const sectors = await getOwnerSectors(ownerId)
  const [niches, script, sections, queue, owner, callHistory, flow] =
    await Promise.all([
      getNiches(true, sectors),
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

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <Link
        href="/portal/reactivation"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to Reactivation
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
