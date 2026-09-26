// @ts-nocheck
import { Link } from 'wouter'
import { ArrowRight, LockKeyhole, Megaphone, PhoneCall } from 'lucide-react'
import { formatPhone } from '@workspace/shared/phone'
import { timeAgo } from '@workspace/shared/lead-followup'
import { formatRequestedAt } from '@workspace/shared/lead-requested-time'
import { usePageData } from '@/hooks/use-page-data'
import { PageError, PageLoading } from '@/components/page-status'
import { PORTAL_NARROW } from '@/lib/portal-layout'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

const tileClass = 'group flex w-full flex-col gap-4 rounded-xl border border-border bg-card p-6 text-left transition-colors hover:border-accent'

function ProductTile({ active, href, name, testId, children }: {
  active: boolean
  href: string
  name: string
  testId: string
  children: React.ReactNode
}) {
  if (active) return <Link href={href} data-testid={testId} className={tileClass}>{children}</Link>
  return (
    <Dialog>
      <DialogTrigger
        render={<button type="button" data-testid={testId} className={`${tileClass} border-dashed bg-muted/40 text-muted-foreground hover:border-border`} />}
      >
        {children}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{name} is not active</DialogTitle>
          <DialogDescription>Contact us to activate {name}.</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  )
}

/** Both products remain discoverable even if the account holds neither grant. */
export default function PortalStartPage() {
  const { data, loading, error } = usePageData<any>('/portal/start')
  if (loading) return <PageLoading />
  if (error) return <PageError error={error} />
  const { participant, products, practiceName, activeCampaigns, newLeads, callNext = [], now } = data
  const nowMs = now ? new Date(now).getTime() : Date.now()

  return (
    <div className={`${PORTAL_NARROW} py-12`}>
      <p className="text-sm text-muted-foreground">Welcome back, {participant.first_name}</p>
      <h1 className="mt-1 text-3xl font-bold text-foreground">
        {practiceName ? `${practiceName} — ` : ''}where are you calling today?
      </h1>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <ProductTile
          active={Boolean(products?.reactivation)}
          href="/portal"
          name="Reactivation"
          testId="tile-reactivation"
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
          <span className="mt-auto flex items-center gap-1 text-sm font-medium">
            {products?.reactivation ? <>Open Reactivation <ArrowRight className="size-4" /></> : <>Not active <LockKeyhole className="size-4" /></>}
          </span>
        </ProductTile>
        <ProductTile
          active={Boolean(products?.leadFollowUp)}
          href="/portal/leads"
          name="Lead Follow-Up"
          testId="tile-lead-followup"
        >
          <span className="flex size-11 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
            <Megaphone className="size-5" />
          </span>
          <div>
            <h2 className="text-xl font-semibold text-foreground">Lead Follow-Up</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Call people who responded to an ad but never booked, while the lead is still warm.
            </p>
            {products?.leadFollowUp && <p className="mt-2 text-sm text-foreground" data-testid="text-lead-summary">
              <span className="font-semibold">{newLeads}</span> new lead{newLeads === 1 ? '' : 's'} ·{' '}
              <span className="font-semibold">{activeCampaigns}</span> active campaign{activeCampaigns === 1 ? '' : 's'}
            </p>}
          </div>
          <span className="mt-auto flex items-center gap-1 text-sm font-medium">
            {products?.leadFollowUp ? <>Open Lead Follow-Up <ArrowRight className="size-4" /></> : <>Not active <LockKeyhole className="size-4" /></>}
          </span>
        </ProductTile>
      </div>

      {products?.leadFollowUp && <section className="mt-10" aria-labelledby="call-next-heading">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 id="call-next-heading" className="text-xl font-semibold text-foreground">Call next</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Leads who asked for a time in the next two days, then the newest leads nobody has called yet, then callbacks and retries that are due.
            </p>
          </div>
          <Link href="/portal/campaigns" className="text-sm font-medium text-accent hover:underline">
            All campaigns
          </Link>
        </div>
        {callNext.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground" data-testid="text-call-next-empty">
            Nothing waiting. New leads and due callbacks show up here.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card" data-testid="list-call-next">
            {callNext.map(({ lead, campaign, reason }) => (
              <li key={lead.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" data-testid={`row-call-next-${lead.id}`}>
                <div className="min-w-0">
                  <p className="font-medium text-foreground">
                    {lead.firstName} {lead.lastName}
                    <span className="ml-2 text-sm font-normal text-muted-foreground">{formatPhone(lead.phone)}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {campaign.name}
                    {' \u00b7 '}
                    {reason === 'requested'
                      ? `asked for ${formatRequestedAt(lead.requestedAt)} · confirm it`
                      : reason === 'new'
                      ? `responded ${timeAgo(lead.submittedAt, nowMs)}`
                      : lead.lastDisposition === 'callback_later'
                        ? `callback due ${timeAgo(lead.nextDueAt, nowMs)}`
                        : `retry due ${timeAgo(lead.nextDueAt, nowMs)}`}
                  </p>
                </div>
                <Link
                  href={`/portal/campaigns/${campaign.id}/leads/${lead.id}/call`}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  data-testid={`button-call-next-${lead.id}`}
                >
                  <PhoneCall className="size-4" />
                  Call
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>}
    </div>
  )
}
