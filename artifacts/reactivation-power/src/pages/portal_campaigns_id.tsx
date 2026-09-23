// @ts-nocheck
import { useState, useTransition } from 'react'
import { Link, useParams } from 'wouter'
import { ArrowLeft, Archive, ArchiveRestore, Pause, Pencil, Play, Users } from 'lucide-react'
import { formatDateTime } from '@workspace/shared/format'
import { formatPhone } from '@workspace/shared/phone'
import { LEAD_SOURCE_LABELS, timeAgo } from '@workspace/shared/lead-followup'
import { setCampaignStatus } from '@/app/actions/lead-followup'
import { usePageData } from '@/hooks/use-page-data'
import { useRouter } from '@/hooks/use-router'
import { PageError, PageLoading } from '@/components/page-status'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CampaignStatusBadge, LeadStatusBadge, OfferSummary } from '@/components/lead-followup/lead-bits'
import { ImportLeadsDialog } from '@/components/lead-followup/import-leads-dialog'
import { PORTAL_WIDTH } from '@/lib/portal-layout'
import { cn } from '@/lib/utils'
import NotFound from '@/pages/not-found'

type Tab = 'leads' | 'offer'

export default function CampaignDetailPage() {
  const { id } = useParams()
  const { data, loading, error, notFound } = usePageData<any>(`/portal/campaigns/${id}`)
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('leads')
  const [pending, startTransition] = useTransition()
  const [actionError, setActionError] = useState<string | null>(null)
  if (loading) return <PageLoading />
  if (notFound) return <NotFound />
  if (error) return <PageError error={error} />
  const { campaign, leads, niche, now } = data
  const nowMs = new Date(now).getTime()
  const newCount = leads.filter((l) => l.status === 'new').length

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
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {niche?.name ?? 'Service not enabled'}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold text-foreground" data-testid="text-campaign-name">{campaign.name}</h1>
            <CampaignStatusBadge status={campaign.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {leads.length} lead{leads.length === 1 ? '' : 's'} · {newCount} new · created {formatDateTime(campaign.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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

      <div className="mt-8 flex items-center justify-between gap-4 border-b border-border">
        <div className="flex gap-1" role="tablist">
          {(['leads', 'offer'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              data-testid={`tab-${t}`}
              className={cn(
                '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                tab === t ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t === 'leads' ? `Leads (${leads.length})` : 'Offer'}
            </button>
          ))}
        </div>
        {tab === 'leads' ? (
          <div className="pb-2">
            <ImportLeadsDialog campaignId={campaign.id} campaignName={campaign.name} disabled={campaign.status === 'archived'} />
          </div>
        ) : null}
      </div>

      {tab === 'offer' ? (
        <div className="mt-6 max-w-xl rounded-lg border border-border bg-card p-6">
          <OfferSummary campaign={campaign} />
        </div>
      ) : leads.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-border bg-card p-10 text-center">
          <Users className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 font-medium text-foreground">No leads in this campaign yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload the list from your ad platform and they&rsquo;ll appear here, newest first.
          </p>
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Requested time</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last attempt</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => (
                <TableRow key={lead.id} data-testid={`row-lead-${lead.id}`}>
                  <TableCell>
                    <Link href={`/portal/campaigns/${campaign.id}/leads/${lead.id}`} className="font-medium text-foreground hover:underline" data-testid={`link-lead-${lead.id}`}>
                      {lead.firstName} {lead.lastName}
                    </Link>
                    <p className="text-xs text-muted-foreground">{formatPhone(lead.phone)}{lead.email ? ` · ${lead.email}` : ''}</p>
                  </TableCell>
                  <TableCell>
                    <span className={cn('text-sm', lead.status === 'new' ? 'font-medium text-foreground' : 'text-muted-foreground')} title={formatDateTime(lead.submittedAt)}>
                      {timeAgo(lead.submittedAt, nowMs)}
                    </span>
                    <p className="text-xs text-muted-foreground">{LEAD_SOURCE_LABELS[lead.source] ?? lead.source}</p>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{lead.requestedTime ?? '—'}</TableCell>
                  <TableCell><LeadStatusBadge status={lead.status} /></TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {lead.lastAttemptAt ? timeAgo(lead.lastAttemptAt, nowMs) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
