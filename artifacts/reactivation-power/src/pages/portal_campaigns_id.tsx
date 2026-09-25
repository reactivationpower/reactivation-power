// @ts-nocheck
import { useState, useTransition } from 'react'
import { Link, useParams } from 'wouter'
import { formatDateTime } from '@workspace/shared/format'
import { setCampaignStatus } from '@/app/actions/lead-followup'
import { usePageData } from '@/hooks/use-page-data'
import { useRouter } from '@/hooks/use-router'
import { PageError, PageLoading } from '@/components/page-status'
import { Button } from '@/components/ui/button'
import { LeadsTable } from '@/components/lead-followup/leads-table'
import { ImportLeadsDialog } from '@/components/lead-followup/import-leads-dialog'
import { ConnectLeadsPanel } from '@/components/lead-followup/connect-leads-panel'
import { LeadSourcesTab } from '@/components/lead-followup/lead-sources-tab'
import { PORTAL_WIDTH } from '@/lib/portal-layout'
import { cn } from '@/lib/utils'
import NotFound from '@/pages/not-found'
import { ArrowLeft, Archive, ArchiveRestore, BookOpen, Pause, Pencil, Play, Users } from 'lucide-react'
import { campaignConversion, formatPriceLine, formatRate, isParkedLead } from '@workspace/shared/lead-followup'
import { CampaignStatusBadge, OfferSummary } from '@/components/lead-followup/lead-bits'

type Tab = 'leads' | 'sources' | 'offer'

const TAB_LABELS: Record<Tab, string> = { leads: 'Leads', sources: 'Lead sources', offer: 'Offer' }

export default function CampaignDetailPage() {
  const { id } = useParams()
  const { data, loading, error, notFound } = usePageData<any>(`/portal/campaigns/${id}`)
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('leads')
  const [parkedOnly, setParkedOnly] = useState(false)
  const [pending, startTransition] = useTransition()
  const [actionError, setActionError] = useState<string | null>(null)
  if (loading) return <PageLoading />
  if (notFound) return <NotFound />
  if (error) return <PageError error={error} />
  const { campaign, leads, niche, now, webhookUrl, webhookEvents, connectionSummary } = data
  const setupRequested = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('setup') === '1'
  const nowMs = new Date(now).getTime()
  const newCount = leads.filter((l) => l.status === 'new').length
  const conversion = campaignConversion(leads)
  const parkedLeads = leads.filter(isParkedLead)
  const visibleLeads = parkedOnly ? parkedLeads : leads

  function changeStatus(status: 'active' | 'paused' | 'archived') {
    setActionError(null)
    startTransition(async () => {
      const res = await setCampaignStatus(campaign.id, status)
      if (res?.error) setActionError(res.error)
      else router.refresh()
    })
  }

  return (
    <div className={`${PORTAL_WIDTH} py-8`}>
      <Link href="/portal/campaigns" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Back to Campaigns
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-full">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {niche?.name ?? 'Service not enabled'}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-3">
            <h1 className="min-w-0 break-words text-3xl font-bold text-foreground" data-testid="text-campaign-name">{campaign.name}</h1>
            <CampaignStatusBadge status={campaign.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {leads.length} lead{leads.length === 1 ? '' : 's'} · {newCount} new · created {formatDateTime(campaign.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button render={<Link href={`/portal/campaigns/${campaign.id}/practice`} />} nativeButton={false} variant="outline" className="gap-2" data-testid="button-practice-script">
            <BookOpen className="size-4" />
            Practice script
          </Button>
          <Button render={<Link href={`/portal/campaigns/${campaign.id}/edit`} />} nativeButton={false} variant="outline" className="gap-2" data-testid="button-edit-campaign">
            <Pencil className="size-4" />
            Edit
          </Button>
          {campaign.status === 'active' ? (
            <Button variant="outline" className="gap-2" disabled={pending} onClick={() => changeStatus('paused')} data-testid="button-pause-campaign">
              <Pause className="size-4" />
              Pause
            </Button>
          ) : null}
          {campaign.status === 'paused' ? (
            <Button variant="outline" className="gap-2" disabled={pending} onClick={() => changeStatus('active')} data-testid="button-resume-campaign">
              <Play className="size-4" />
              Resume
            </Button>
          ) : null}
          {campaign.status !== 'archived' ? (
            <Button variant="ghost" className="gap-2" disabled={pending} onClick={() => changeStatus('archived')} data-testid="button-archive-campaign">
              <Archive className="size-4" />
              Archive
            </Button>
          ) : (
            <Button variant="outline" className="gap-2" disabled={pending} onClick={() => changeStatus('active')} data-testid="button-restore-campaign">
              <ArchiveRestore className="size-4" />
              Restore
            </Button>
          )}
        </div>
      </div>
      {actionError ? <p className="mt-2 text-sm text-destructive" role="alert">{actionError}</p> : null}
      {campaign.status === 'paused' ? (
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          This campaign is paused. Leads stay here, but it won&rsquo;t show up in the calling queue.
        </p>
      ) : null}
      {campaign.status === 'archived' ? (
        <p className="mt-4 rounded-md border border-border bg-muted/40 px-4 py-2 text-sm text-muted-foreground">
          Archived. Restore it to add leads or call from it again.
        </p>
      ) : null}

      <ConnectLeadsPanel
        campaign={campaign}
        webhookUrl={webhookUrl}
        offerLine={formatPriceLine(campaign) ?? ''}
        connectionSummary={connectionSummary ?? null}
        nowMs={nowMs}
        initiallyOpen={setupRequested}
        onOpenSettings={() => {
          setTab('sources')
          requestAnimationFrame(() => document.querySelector('[role=tablist]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
        }}
      />

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="campaign-stats">
        {[
          ['Leads received', String(conversion.received), 'stat-received'],
          ['Reached', String(conversion.reached), 'stat-reached'],
          ['Booked', String(conversion.booked), 'stat-booked'],
          ['Booked rate', formatRate(conversion.bookedRate), 'stat-booked-rate'],
        ].map(([label, value, testId]) => (
          <div key={label} className="rounded-lg border border-border bg-card px-4 py-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-2xl font-bold tabular-nums text-foreground" data-testid={testId}>{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-x-4 border-b border-border">
        <div className="-mb-px flex min-w-0 gap-1 overflow-x-auto" role="tablist">
          {(['leads', 'sources', 'offer'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              data-testid={`tab-${t}`}
              className={cn(
                '-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                tab === t ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t === 'leads' ? `Leads (${leads.length})` : TAB_LABELS[t]}
            </button>
          ))}
        </div>
        {tab === 'leads' ? (
          <div className="pb-2">
            <ImportLeadsDialog campaignId={campaign.id} campaignName={campaign.name} disabled={campaign.status === 'archived'} />
          </div>
        ) : null}
      </div>

      {tab === 'leads' && leads.length > 0 ? (
        <div className="mt-4 flex gap-2" aria-label="Filter leads">
          <Button variant={parkedOnly ? 'outline' : 'default'} aria-pressed={!parkedOnly} onClick={() => setParkedOnly(false)}>All leads ({leads.length})</Button>
          <Button variant={parkedOnly ? 'default' : 'outline'} aria-pressed={parkedOnly} onClick={() => setParkedOnly(true)} data-testid="filter-parked-leads">Parked ({parkedLeads.length})</Button>
        </div>
      ) : null}
      {tab === 'offer' ? (
        <div className="mt-6 max-w-xl rounded-lg border border-border bg-card p-6">
          <OfferSummary campaign={campaign} />
        </div>
      ) : tab === 'sources' ? (
        <LeadSourcesTab
          campaignId={campaign.id}
          campaignName={campaign.name}
          webhookUrl={webhookUrl}
          fieldMapping={campaign.fieldMapping ?? {}}
          events={webhookEvents ?? []}
          archived={campaign.status === 'archived'}
          now={nowMs}
        />
      ) : leads.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-border bg-card p-10 text-center">
          <Users className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 font-medium text-foreground">No leads in this campaign yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload the list from your ad platform, or connect the ad form on the Lead sources tab and they&rsquo;ll appear here the moment they come in, newest first.
          </p>
        </div>
      ) : (
        <LeadsTable rows={visibleLeads.map((lead) => ({ lead, campaign }))} nowMs={nowMs} emptyText="No parked leads in this campaign." />
      )}
    </div>
  )
}
