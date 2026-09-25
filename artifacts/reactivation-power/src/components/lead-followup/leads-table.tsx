import { Link } from 'wouter'
import { PhoneCall } from 'lucide-react'
import { formatDateTime } from '@workspace/shared/format'
import { formatPhone } from '@workspace/shared/phone'
import { LEAD_SOURCE_LABELS, isLeadDue, isParkedLead, leadCallBlockReason, timeAgo } from '@workspace/shared/lead-followup'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { LeadStatusBadge, RequestedTimeBadge } from './lead-bits'
import { cn } from '@/lib/utils'

/** The same lead information and calling actions in a campaign or across the account. */
export function LeadsTable({
  rows, nowMs, showCampaign = false, emptyText = 'No leads match these filters.',
}: {
  rows: Array<{ lead: any; campaign: any }>
  nowMs: number
  showCampaign?: boolean
  emptyText?: string
}) {
  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-card">
      <Table>
        <TableHeader><TableRow>
          <TableHead>Lead</TableHead>
          {showCampaign && <TableHead>Campaign</TableHead>}
          <TableHead>Submitted</TableHead>
          <TableHead>Requested time</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Last attempt</TableHead>
          <TableHead className="text-right"><span className="sr-only">Call</span></TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {!rows.length && <TableRow><TableCell colSpan={showCampaign ? 7 : 6} className="py-8 text-center text-muted-foreground">{emptyText}</TableCell></TableRow>}
          {rows.map(({ lead, campaign }) => {
            const blocked = leadCallBlockReason(campaign, lead)
            return <TableRow key={lead.id} data-testid={`row-lead-${lead.id}`}>
              <TableCell>
                <Link href={`/portal/campaigns/${campaign.id}/leads/${lead.id}`} className="font-medium text-foreground hover:underline" data-testid={`link-lead-${lead.id}`}>
                  {lead.firstName} {lead.lastName}
                </Link>
                <p className="text-xs text-muted-foreground">{formatPhone(lead.phone)}{lead.email ? ` · ${lead.email}` : ''}</p>
              </TableCell>
              {showCampaign && <TableCell><Link href={`/portal/campaigns/${campaign.id}`} className="font-medium text-accent hover:underline">{campaign.name}</Link></TableCell>}
              <TableCell>
                <span className={cn('text-sm', lead.status === 'new' ? 'font-medium text-foreground' : 'text-muted-foreground')} title={formatDateTime(lead.submittedAt)}>
                  {timeAgo(lead.submittedAt, nowMs)}
                </span>
                <p className="text-xs text-muted-foreground">{LEAD_SOURCE_LABELS[lead.source as keyof typeof LEAD_SOURCE_LABELS] ?? lead.source}</p>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                <RequestedTimeBadge requestedAt={lead.requestedAt} requestedTime={lead.requestedTime} status={lead.status} />
              </TableCell>
              <TableCell><LeadStatusBadge status={lead.status} />{isParkedLead(lead) ? <p className="mt-1 text-xs text-muted-foreground">Parked</p> : null}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {lead.lastAttemptAt ? timeAgo(lead.lastAttemptAt, nowMs) : '—'}
                {isLeadDue(lead, nowMs) && <p className="text-xs font-medium text-amber-700">Due now</p>}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  render={<Link href={`/portal/campaigns/${campaign.id}/leads/${lead.id}/call`} />}
                  nativeButton={false} size="sm" variant={lead.status === 'new' ? 'default' : 'outline'}
                  className={cn('gap-1.5', blocked && 'pointer-events-none opacity-50')} aria-disabled={Boolean(blocked)}
                  title={blocked ?? undefined} data-testid={`button-call-lead-${lead.id}`}
                >
                  <PhoneCall className="size-3.5" />Call
                </Button>
              </TableCell>
            </TableRow>
          })}
        </TableBody>
      </Table>
    </div>
  )
}