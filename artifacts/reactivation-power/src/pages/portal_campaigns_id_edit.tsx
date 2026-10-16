// @ts-nocheck
import { Link, useParams } from 'wouter'
import { ArrowLeft } from 'lucide-react'
import { usePageData } from '@/hooks/use-page-data'
import { PageError, PageLoading } from '@/components/page-status'
import { CampaignForm, campaignToFormValues } from '@/components/lead-followup/campaign-form'
import { PORTAL_NARROW } from '@/lib/portal-layout'
import NotFound from '@/pages/not-found'

export default function EditCampaignPage() {
  const { id } = useParams()
  const { data, loading, error, notFound } = usePageData<any>(`/portal/campaigns/${id}/edit`)
  if (loading) return <PageLoading />
  if (notFound) return <NotFound />
  if (error) return <PageError error={error} />
  const { campaign, niches } = data

  return (
    <div className={`${PORTAL_NARROW} py-8`}>
      <Link href={`/portal/campaigns/${campaign.id}`} className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Back to {campaign.name}
      </Link>
      <h1 className="mt-4 text-3xl font-bold text-foreground">Edit campaign</h1>
      <div className="mt-8">
        <CampaignForm key={campaign.id} niches={niches} campaignId={campaign.id} initial={campaignToFormValues(campaign)} />
      </div>
    </div>
  )
}
