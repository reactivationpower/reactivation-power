// @ts-nocheck
import { Link, useParams } from 'wouter'
import { ArrowLeft, Clock, History, Mail, Phone, PhoneCall } from 'lucide-react'
import { formatDateTime } from '@workspace/shared/format'
import { formatPhone } from '@workspace/shared/phone'
import { LEAD_DISPOSITION_LABELS, LEAD_SOURCE_LABELS, timeAgo } from '@workspace/shared/lead-followup'
import { usePageData } from '@/hooks/use-page-data'
import { PageError, PageLoading } from '@/components/page-status'
import { Button } from '@/components/ui/button'
import { CampaignStatusBadge, LeadStatusBadge, OfferSummary } from '@/components/lead-followup/lead-bits'
import { PORTAL_NARROW } from '@/lib/portal-layout'
import NotFound from '@/pages/not-found'

export default function LeadDetailPage() {
  const { id, leadId } = useParams()
  const { data, loading, error, notFound } = usePageData<any>(`/portal/campaigns/${id}/leads/${leadId}`)
  if (loading) return <PageLoading />
  if (notFound) return <NotFound />
  if (error) return <PageError error={error} />
  const { campaign, lead, niche, calls = [], now } = data
  const nowMs = new Date(now).getTime()

  return (
    <div className={`${PORTAL_NARROW} py-8`}>
      <Link href={`/portal/campaigns/${campaign.id}`} className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Back to {campaign.name}
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold text-foreground" data-testid="text-lead-name">
              {lead.firstName} {lead.lastName}
            </h1>
            <LeadStatusBadge status={lead.status} />
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><Phone className="size-4" />{formatPhone(lead.phone)}</span>
            {lead.email ? <span className="inline-flex items-center gap-1.5"><Mail className="size-4" />{lead.email}</span> : null}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {data.callBlocked ? (
            <>
              <Button disabled className="gap-2" title={data.callBlocked} data-testid="button-call-lead">
                <PhoneCall className="size-4" />
                Call
              </Button>
              <p className="max-w-56 text-right text-xs text-muted-foreground" data-testid="text-call-blocked">{data.callBlocked}</p>
            </>
          ) : (
            <Button
              render={<Link href={`/portal/campaigns/${campaign.id}/leads/${lead.id}/call`} />}
              nativeButton={false}
              className="gap-2"
              data-testid="button-call-lead"
            >
              <PhoneCall className="size-4" />
              Call
            </Button>
          )}
          {lead.nextDueAt && !data.callBlocked ? (
            <p className="text-xs text-muted-foreground">Next try due {formatDateTime(lead.nextDueAt)}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <section className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-base font-semibold text-foreground">The lead</h2>
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Source</dt>
            <dd className="text-foreground" data-testid="text-lead-source">{LEAD_SOURCE_LABELS[lead.source] ?? lead.source}</dd>
            <dt className="text-muted-foreground">Submitted</dt>
            <dd className="text-foreground" data-testid="text-lead-submitted">
              {timeAgo(lead.submittedAt, nowMs)}
              <span className="text-muted-foreground"> · {formatDateTime(lead.submittedAt)}</span>
            </dd>
            <dt className="text-muted-foreground">Requested time</dt>
            <dd className="text-foreground" data-testid="text-lead-requested">
              {lead.requestedTime ? (
                <span className="inline-flex items-center gap-1.5"><Clock className="size-4 text-muted-foreground" />{lead.requestedTime}</span>
              ) : (
                <span className="text-muted-foreground">Not given</span>
              )}
            </dd>
            <dt className="text-muted-foreground">Last attempt</dt>
            <dd className="text-foreground">
              {lead.lastAttemptAt ? `${timeAgo(lead.lastAttemptAt, nowMs)} · ${formatDateTime(lead.lastAttemptAt)}` : <span className="text-muted-foreground">Not called yet</span>}
            </dd>
          </dl>
          {lead.message ? (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What they wrote</p>
              <blockquote className="mt-1 rounded-md border-l-2 border-accent bg-muted/40 px-3 py-2 text-sm text-foreground" data-testid="text-lead-message">
                {lead.message}
              </blockquote>
            </div>
          ) : null}
        </section>

        <section className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{niche?.name ?? 'Campaign'}</p>
              <h2 className="text-base font-semibold text-foreground">{campaign.name}</h2>
            </div>
            <CampaignStatusBadge status={campaign.status} />
          </div>
          <OfferSummary campaign={campaign} className="mt-4" />
        </section>
      </div>

      <section className="mt-6 rounded-lg border border-border bg-card" aria-label="Call history">
        <div className="flex items-center gap-2 border-b border-border px-6 py-3">
          <History className="size-4 text-accent" />
          <h2 className="text-base font-semibold text-foreground">Call history ({calls.length})</h2>
        </div>
        {calls.length === 0 ? (
          <p className="px-6 py-4 text-sm text-muted-foreground" data-testid="text-no-calls">No calls logged yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {calls.map((call) => (
              <li key={call.id} className="px-6 py-3" data-testid={`row-lead-call-${call.id}`}>
                <p className="text-sm">
                  <span className="font-medium text-foreground">{LEAD_DISPOSITION_LABELS[call.disposition] ?? call.disposition}</span>
                  <span className="text-muted-foreground"> · {formatDateTime(call.createdAt)}</span>
                  {call.callBackAt ? <span className="text-muted-foreground"> · call back {formatDateTime(call.callBackAt)}</span> : null}
                  {call.bookedAt ? <span className="text-muted-foreground"> · booked for {formatDateTime(call.bookedAt)}</span> : null}
                </p>
                {call.notes ? <p className="mt-1 text-sm text-foreground">{call.notes}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
