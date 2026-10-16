import { Link } from 'wouter'
import { useQuery } from '@tanstack/react-query'
import { getSalesLead } from '@/app/actions/sales-leads'
import { Skeleton, btn2, card, fmt } from '@/components/leads/ui'

/** Right-hand contact summary for the Inbox. Shares the lead-detail query cache. */
export function LeadContactPanel({ leadId }: { leadId: string }) {
  const q = useQuery({ queryKey: ['sales-leads', 'detail', leadId], queryFn: () => getSalesLead(leadId), retry: false })
  if (q.isLoading) return <section className={card}><Skeleton rows={4} /></section>
  if (!q.data) return <section className={card + ' text-sm text-muted-foreground'}>Contact details could not be loaded.</section>
  const { lead: l, contact_url } = q.data
  const rows: Array<[string, React.ReactNode]> = [
    ['Practice', l.practice_name || '—'],
    ['Phone', l.phone ? <a className="hover:underline" href={`tel:${l.phone}`}>{l.phone}</a> : '—'],
    ['Email', l.email ? <a className="break-all hover:underline" href={`mailto:${l.email}`}>{l.email}</a> : '—'],
    ['Stage', l.stage],
    ['Texts allowed', l.dnd ? 'No — do not contact' : l.consent ? 'Yes' : 'No consent yet'],
    ['Time zone', l.timezone ?? 'Not set'],
    ['Next follow-up', l.next_followup_at ? fmt(l.next_followup_at) : 'None'],
    ['Source', l.source],
  ]
  return (
    <section className={card + ' space-y-4'} data-testid="panel-contact">
      <div>
        <h2 className="font-semibold">{l.first_name} {l.last_name}</h2>
        <p className="text-xs text-muted-foreground">Lead since {fmt(l.created_at)}</p>
      </div>
      <dl className="space-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2">
            <dt className="text-muted-foreground">{k}</dt><dd className="min-w-0 break-words">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap gap-2">
        <Link href={`/admin/leads/${encodeURIComponent(l.id)}`} className={btn2} data-testid="link-open-lead">Open full lead</Link>
        {contact_url && <a href={contact_url} target="_blank" rel="noopener noreferrer" className={btn2} data-testid="link-ghl">Call in GoHighLevel</a>}
      </div>
    </section>
  )
}
