// @ts-nocheck
import { Link } from 'wouter'
import { ArrowRight, Megaphone, PhoneCall } from 'lucide-react'
import { usePageData } from '@/hooks/use-page-data'
import { PageError, PageLoading } from '@/components/page-status'
import { PORTAL_NARROW } from '@/lib/portal-layout'

/**
 * The two-door landing. Shown only to accounts that hold both products; a
 * single-product account is redirected by the loader before it renders.
 */
export default function PortalStartPage() {
  const { data, loading, error } = usePageData<any>('/portal/start')
  if (loading) return <PageLoading />
  if (error) return <PageError error={error} />
  const { participant, practiceName, activeCampaigns, newLeads } = data

  return (
    <div className={`${PORTAL_NARROW} py-12`}>
      <p className="text-sm text-muted-foreground">Welcome back, {participant.first_name}</p>
      <h1 className="mt-1 text-3xl font-bold text-foreground">
        {practiceName ? `${practiceName} — ` : ''}where are you calling today?
      </h1>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link
          href="/portal"
          data-testid="tile-reactivation"
          className="group flex flex-col gap-4 rounded-xl border border-border bg-card p-6 transition-colors hover:border-accent"
        >
          <span className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <PhoneCall className="size-5" />
          </span>
          <div>
            <h2 className="text-xl font-semibold text-foreground">Reactivation</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Call past patients who haven&rsquo;t been in for a while and bring them back.
            </p>
          </div>
          <span className="mt-auto flex items-center gap-1 text-sm font-medium text-accent group-hover:underline">
            Open Reactivation <ArrowRight className="size-4" />
          </span>
        </Link>
        <Link
          href="/portal/campaigns"
          data-testid="tile-lead-followup"
          className="group flex flex-col gap-4 rounded-xl border border-border bg-card p-6 transition-colors hover:border-accent"
        >
          <span className="flex size-11 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
            <Megaphone className="size-5" />
          </span>
          <div>
            <h2 className="text-xl font-semibold text-foreground">Lead Follow-Up</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Call people who responded to an ad but never booked, while the lead is still warm.
            </p>
            <p className="mt-2 text-sm text-foreground" data-testid="text-lead-summary">
              <span className="font-semibold">{newLeads}</span> new lead{newLeads === 1 ? '' : 's'} ·{' '}
              <span className="font-semibold">{activeCampaigns}</span> active campaign{activeCampaigns === 1 ? '' : 's'}
            </p>
          </div>
          <span className="mt-auto flex items-center gap-1 text-sm font-medium text-accent group-hover:underline">
            Open Lead Follow-Up <ArrowRight className="size-4" />
          </span>
        </Link>
      </div>
    </div>
  )
}
