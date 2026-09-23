// @ts-nocheck
import { Link, useParams } from 'wouter'
import { ArrowLeft } from 'lucide-react'
import { LeadCallScreen } from '@/components/lead-followup/lead-call-screen'
import { usePageData } from '@/hooks/use-page-data'
import { PageError, PageLoading } from '@/components/page-status'
import NotFound from '@/pages/not-found'

export default function LeadCallPage() {
  const { id, leadId } = useParams()
  const { data, loading, error, notFound } = usePageData<any>(`/portal/campaigns/${id}/leads/${leadId}/call`)
  if (loading) return <PageLoading />
  if (notFound) return <NotFound />
  if (error) return <PageError error={error} />
  const { participant, campaign, lead, niche, owner, flow, calls, nextHref, now } = data

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <Link
        href={`/portal/campaigns/${campaign.id}`}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to {campaign.name}
      </Link>

      <div className="mt-4">
        <LeadCallScreen
          key={lead.id}
          campaign={campaign}
          lead={lead}
          niche={niche}
          callerName={participant.first_name}
          practiceName={owner?.practice_name ?? null}
          officePhone={owner?.office_phone ?? null}
          owner={owner ?? null}
          isProvider={participant.role === 'owner'}
          calls={calls}
          flowSteps={flow.steps}
          flowChoices={flow.choices}
          nextHref={nextHref}
          now={now}
        />
      </div>
    </div>
  )
}
