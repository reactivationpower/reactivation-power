import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import {
  accessOwnerId,
  getCurrentParticipant,
  getParticipantById,
} from '@/lib/data/participants'
import { getOwnerNiches, getScriptFlow } from '@/lib/data/reactivation'
import { getOwnerSectors } from '@/lib/data/courses'
import { ScriptViewer } from '@/components/reactivation/script-viewer'

export default async function PracticeScriptPage({
  searchParams,
}: {
  searchParams: Promise<{ screen?: string; from?: string }>
}) {
  const { screen, from } = await searchParams
  const participant = await getCurrentParticipant()
  if (!participant) redirect(`/login?next=/portal/dialer`)

  const cameFromTraining = from === 'training'
  const backHref = cameFromTraining ? '/portal' : '/portal/dialer'
  const backLabel = cameFromTraining ? 'Back to Training' : 'Back to Dialer'

  const ownerId = accessOwnerId(participant)
  const sectors = await getOwnerSectors(ownerId)
  const [niches, flow, owner] = await Promise.all([
    getOwnerNiches(ownerId, sectors),
    getScriptFlow(),
    participant.role === 'owner'
      ? Promise.resolve(participant)
      : getParticipantById(ownerId),
  ])

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <Link
        href={backHref}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {backLabel}
      </Link>

      <div className="mt-4 flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-foreground">Practice Script</h1>
        <p className="text-sm text-muted-foreground">
          Walk through your niche&apos;s call script before making real calls.
          Click the response buttons to practice steering the conversation,
          just like on a live call.
        </p>
      </div>

      <div className="mt-6">
        <ScriptViewer
          niches={niches}
          steps={flow.steps}
          choices={flow.choices}
          initialNicheId={participant.selected_niche_id ?? null}
          callerName={participant.first_name}
          practiceName={owner?.practice_name ?? null}
          isProvider={participant.role === 'owner'}
          initialStepKey={screen ?? null}
        />
      </div>
    </div>
  )
}
