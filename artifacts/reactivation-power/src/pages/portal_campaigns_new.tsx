// @ts-nocheck
import { Link } from 'wouter'
import { ArrowLeft } from 'lucide-react'
import { usePageData } from '@/hooks/use-page-data'
import { PageError, PageLoading } from '@/components/page-status'
import { CampaignForm } from '@/components/lead-followup/campaign-form'
import { PORTAL_NARROW } from '@/lib/portal-layout'

export default function NewCampaignPage() {
  const { data, loading, error } = usePageData<any>('/portal/campaigns/new')
  if (loading) return <PageLoading />
  if (error) return <PageError error={error} />

  return (
    <div className={`${PORTAL_NARROW} py-8`}>
      <Link href="/portal/campaigns" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Back to Campaigns
      </Link>
      <h1 className="mt-4 text-3xl font-bold text-foreground">New campaign</h1>
      <p className="mt-1 text-muted-foreground">
        Describe the ad or offer these leads responded to. The caller reads the offer straight off this.
      </p>
      <div className="mt-8">
        <CampaignForm niches={data.niches} />
      </div>
    </div>
  )
}
