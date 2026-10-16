import { useState } from 'react'
import { Link } from 'wouter'
import { useQuery } from '@tanstack/react-query'
import { MessageSquare } from 'lucide-react'
import { getSalesLead } from '@/app/actions/sales-leads'
import { LeadWorkspace } from '@/components/leads/workspace'
import { ErrorBox, REFRESH_MS, Skeleton, card, inp } from '@/components/leads/ui'

export type LinkedLead = { id: string; first_name: string; last_name: string; practice_name: string; stage: string; source: string; created_at: string }

const leadLabel = (l: LinkedLead) => `${`${l.first_name} ${l.last_name}`.trim() || 'Unnamed lead'}${l.practice_name ? ` · ${l.practice_name}` : ''} · ${l.source} · ${new Date(l.created_at).toLocaleDateString('en-US', { dateStyle: 'medium' })}`

/** Customer page view of the linked sales lead's texts, calls, notes and history. Same records as the lead page. */
export function CustomerLeadPanel({ leads, superAdmin }: { leads: LinkedLead[]; superAdmin: boolean }) {
  const [selected, setSelected] = useState<string | null>(null)
  if (leads.length === 0) return (
    <section className={card + ' space-y-1'} data-testid="customer-no-lead">
      <h2 className="flex items-center gap-2 font-semibold"><MessageSquare className="size-4 text-muted-foreground" /> Messages and history</h2>
      <p className="text-sm text-muted-foreground">This customer has no lead record, so texting, call logging and notes aren't available here.</p>
    </section>
  )
  // Leads arrive newest first; the newest opens by default.
  const leadId = leads.some((l) => l.id === selected) ? selected! : leads[0]!.id
  return (
    <section className="min-w-0 space-y-4 break-words" data-testid="section-customer-lead">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground"><MessageSquare className="size-4" /> Messages and history</h2>
        <Link href={`/admin/leads/${encodeURIComponent(leadId)}`} className="text-sm font-medium text-primary hover:underline" data-testid="link-open-lead">Open lead record</Link>
      </div>
      {leads.length > 1 && (
        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{leads.length} lead records are linked. Choose one to view</span>
          <select className={inp} value={leadId} onChange={(e) => setSelected(e.target.value)} data-testid="select-customer-lead">
            {leads.map((l) => <option key={l.id} value={l.id}>{leadLabel(l)}</option>)}
          </select>
        </label>
      )}
      <LinkedLeadWorkspace key={leadId} leadId={leadId} superAdmin={superAdmin} />
    </section>
  )
}

function LinkedLeadWorkspace({ leadId, superAdmin }: { leadId: string; superAdmin: boolean }) {
  // Same query key as the lead page, so a call or note logged here refreshes there too.
  const q = useQuery({ queryKey: ['sales-leads', 'detail', leadId], queryFn: () => getSalesLead(leadId), refetchInterval: REFRESH_MS })
  if (q.isLoading) return <Skeleton rows={4} />
  if (q.isError || !q.data) return <ErrorBox error={q.error} retry={() => q.refetch()} />
  return <LeadWorkspace leadId={leadId} detail={q.data} superAdmin={superAdmin} />
}
