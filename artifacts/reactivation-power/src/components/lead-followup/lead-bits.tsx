// @ts-nocheck

import {
  CAMPAIGN_STATUS_LABELS,
  formatDollars,
  formatPriceLine,
  LEAD_STATUS_LABELS,
  type CampaignStatus,
  type LeadStatus,
} from '@workspace/shared/lead-followup'
import { formatRequestedAt } from '@workspace/shared/lead-requested-time'
import { CalendarClock } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/** Small shared pieces for the Lead Follow-Up pages. */

const LEAD_STATUS_CLASS: Record<LeadStatus, string> = {
  new: 'bg-amber-100 text-amber-900 border-amber-200',
  attempted: 'bg-sky-100 text-sky-900 border-sky-200',
  reached: 'bg-violet-100 text-violet-900 border-violet-200',
  booked: 'bg-emerald-100 text-emerald-900 border-emerald-200',
  confirmed: 'bg-emerald-200 text-emerald-950 border-emerald-300',
  closed: 'bg-muted text-muted-foreground border-border',
}

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span
      className={cn('inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium', LEAD_STATUS_CLASS[status] ?? LEAD_STATUS_CLASS.closed)}
      data-testid={`badge-lead-status-${status}`}
    >
      {LEAD_STATUS_LABELS[status] ?? status}
    </span>
  )
}

/**
 * "Requested: Tue Oct 6, 2:00 PM" for a lead whose form answer resolved to a
 * day and time; falls back to the free text they typed, or nothing.
 */
export function RequestedTimeBadge({
  requestedAt,
  requestedTime,
  className,
}: {
  requestedAt?: string | null
  requestedTime?: string | null
  className?: string
}) {
  if (requestedAt) {
    return (
      <span
        className={cn('inline-flex items-center gap-1 rounded-md border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-900', className)}
        data-testid="badge-lead-requested"
      >
        <CalendarClock className="size-3.5" aria-hidden="true" />
        Requested: {formatRequestedAt(requestedAt)}
      </span>
    )
  }
  if (requestedTime) return <span className={cn('text-sm text-muted-foreground', className)}>{requestedTime}</span>
  return null
}

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  const variant = status === 'active' ? 'default' : status === 'paused' ? 'secondary' : 'outline'
  return <Badge variant={variant} data-testid={`badge-campaign-status-${status}`}>{CAMPAIGN_STATUS_LABELS[status] ?? status}</Badge>
}

/** The offer as the caller will present it: what's included, the price line, any urgency. */
export function OfferSummary({ campaign, className }: { campaign: any; className?: string }) {
  const priceLine = formatPriceLine(campaign)
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Included</p>
        {campaign.offerItems?.length ? (
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-foreground">
            {campaign.offerItems.map((item: string, i: number) => <li key={i}>{item}</li>)}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">Nothing listed yet.</p>
        )}
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Price on the call</p>
        <p className="mt-1 text-sm text-foreground" data-testid="text-offer-price-line">
          {priceLine ? `\u201c${priceLine}\u201d` : 'Price is not mentioned'}
        </p>
        {campaign.priceLineStyle === 'no_price' && (campaign.regularPriceCents !== null || campaign.offerPriceCents !== null) ? (
          <p className="text-xs text-muted-foreground">
            For the office: {campaign.regularPriceCents !== null ? `regular ${formatDollars(campaign.regularPriceCents)}` : ''}
            {campaign.regularPriceCents !== null && campaign.offerPriceCents !== null ? ' · ' : ''}
            {campaign.offerPriceCents !== null ? `offer ${formatDollars(campaign.offerPriceCents)}` : ''}
          </p>
        ) : null}
      </div>
      {campaign.urgencyNote ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Urgency</p>
          <p className="mt-1 text-sm text-foreground">{campaign.urgencyNote}</p>
        </div>
      ) : null}
    </div>
  )
}
