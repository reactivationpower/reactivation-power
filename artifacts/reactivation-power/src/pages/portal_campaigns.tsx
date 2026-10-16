// @ts-nocheck
import { useState } from 'react'
import { Link } from 'wouter'
import { Megaphone, Plus } from 'lucide-react'
import { formatPriceLine } from '@workspace/shared/lead-followup'
import { usePageData } from '@/hooks/use-page-data'
import { PageError, PageLoading } from '@/components/page-status'
import { Button } from '@/components/ui/button'
import { CampaignStatusBadge } from '@/components/lead-followup/lead-bits'
import { PORTAL_WIDTH } from '@/lib/portal-layout'
import { cn } from '@/lib/utils'

type Filter = 'current' | 'archived'

export default function CampaignsPage() {
  const { data, loading, error } = usePageData<any>('/portal/campaigns')
  const [filter, setFilter] = useState<Filter>('current')
  if (loading) return <PageLoading />
  if (error) return <PageError error={error} />
  const { campaigns, nicheName } = data

  const archivedCount = campaigns.filter((c) => c.status === 'archived').length
  const shown = campaigns.filter((c) => (filter === 'archived' ? c.status === 'archived' : c.status !== 'archived'))

  return (
    <div className={`${PORTAL_WIDTH} py-8`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Campaigns</h1>
          <p className="mt-1 text-muted-foreground">
            Each campaign is one ad or offer. Leads land in the campaign they responded to.
          </p>
        </div>
        <Button render={<Link href="/portal/campaigns/new" />} nativeButton={false} className="gap-2" data-testid="button-new-campaign">
          <Plus className="size-4" />
          New Campaign
        </Button>
      </div>

      {archivedCount > 0 ? (
        <div className="mt-6 flex gap-1 rounded-md border border-border bg-muted/40 p-1 w-fit" role="tablist">
          {(['current', 'archived'] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={cn(
                'rounded px-3 py-1.5 text-sm font-medium transition-colors',
                filter === f ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {f === 'current' ? 'Current' : `Archived (${archivedCount})`}
            </button>
          ))}
        </div>
      ) : null}

      {shown.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-border bg-card p-10 text-center">
          <Megaphone className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 font-medium text-foreground">
            {filter === 'archived' ? 'No archived campaigns' : 'No campaigns yet'}
          </p>
          {filter === 'current' ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Create one for the ad you&rsquo;re running, then upload the leads that came in.
            </p>
          ) : null}
        </div>
      ) : (
        <ul className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((c) => {
            const priceLine = formatPriceLine(c)
            return (
              <li key={c.id}>
                <Link
                  href={`/portal/campaigns/${c.id}`}
                  data-testid={`card-campaign-${c.id}`}
                  className="flex h-full flex-col gap-3 rounded-lg border border-border bg-card p-5 transition-colors hover:border-accent"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {nicheName[c.nicheId] ?? 'Service not enabled'}
                      </p>
                      <h2 className="mt-0.5 truncate text-lg font-semibold text-foreground">{c.name}</h2>
                    </div>
                    <CampaignStatusBadge status={c.status} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {priceLine ? `\u201c${priceLine}\u201d` : 'Price not mentioned'}
                    {c.urgencyNote ? ` · ${c.urgencyNote}` : ''}
                  </p>
                  <div className="mt-auto flex items-baseline gap-4 pt-2 text-sm">
                    <span>
                      <span className={cn('text-2xl font-bold tabular-nums', c.newLeadCount > 0 ? 'text-amber-700' : 'text-foreground')}>
                        {c.newLeadCount}
                      </span>{' '}
                      <span className="text-muted-foreground">new</span>
                    </span>
                    <span className="text-muted-foreground">
                      {c.leadCount} lead{c.leadCount === 1 ? '' : 's'} total
                    </span>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
