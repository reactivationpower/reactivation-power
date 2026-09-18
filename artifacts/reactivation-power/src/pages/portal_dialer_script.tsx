// @ts-nocheck
import { Link } from "wouter";
import { useSearch } from "wouter";
import { ArrowLeft } from 'lucide-react'
import { ScriptViewer } from '@/components/reactivation/script-viewer'
import { usePageData } from '@/hooks/use-page-data'
import { PageError, PageLoading } from '@/components/page-status'
import NotFound from '@/pages/not-found'

export default function PracticeScriptPage() {
  const search = new URLSearchParams(useSearch())
  const query = {
    screen: search.get('screen') ?? undefined,
    from: search.get('from') ?? undefined,
    course: search.get('course') ?? undefined,
  }
  const { data, loading, error, notFound } = usePageData<any>('/portal/dialer/script', query)
  if (loading) return <PageLoading />
  if (notFound) return <NotFound />
  if (error) return <PageError error={error} />
  const { screen, participant, niches, flow, owner, backHref, backLabel } = data

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
