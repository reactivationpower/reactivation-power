import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getSalesImport, previewSalesImport, resolveSalesMerge, resumeSalesImport, startSalesImport } from '@/app/actions/sales-leads'
import { Banner, Empty, ErrorBox, Field, LeadsTabs, Pill, REFRESH_MS, Skeleton, btn, btn2, card, errMsg, fmt, inp } from '@/components/leads/ui'

export default function AdminLeadsImportPage() {
  const qc = useQueryClient()
  const [scope, setScope] = useState('')
  const imp = useQuery({ queryKey: ['sales-leads', 'import'], queryFn: () => getSalesImport(), refetchInterval: REFRESH_MS })
  const preview = useMutation({ mutationFn: () => previewSalesImport(scope.trim()), onError: (e) => toast.error(errMsg(e)) })
  const start = useMutation({
    mutationFn: (pid: string) => startSalesImport(pid),
    onSuccess: () => { toast.success('Import started'); preview.reset(); qc.invalidateQueries({ queryKey: ['sales-leads'] }) },
    onError: (e) => toast.error(errMsg(e)),
  })
  const resume = useMutation({ mutationFn: (id: string) => resumeSalesImport(id), onSuccess: () => { toast.success('Import resumed'); qc.invalidateQueries({ queryKey: ['sales-leads', 'import'] }) }, onError: (e) => toast.error(errMsg(e)) })
  const merge = useMutation({ mutationFn: (v: { reviewId: string; leadId: string | null }) => resolveSalesMerge(v.reviewId, v.leadId), onSuccess: () => { toast.success('Review resolved'); qc.invalidateQueries({ queryKey: ['sales-leads'] }) }, onError: (e) => toast.error(errMsg(e)) })

  const p = preview.data
  const cur: any = imp.data
  const reviews: any[] = cur?.reviews ?? cur?.merge_reviews ?? []
  const status = String(cur?.status ?? cur?.state ?? '')
  const processed = cur?.processed ?? cur?.imported ?? cur?.progress
  const total = cur?.total
  return (
    <div className="space-y-6">
      <header><h1 className="text-2xl font-semibold">Leads</h1><p className="mt-1 text-sm text-muted-foreground">Manual-only import from GoHighLevel. Nothing imports until you review and start it.</p></header>
      <LeadsTabs />
      <section className={card + ' space-y-3'} data-testid="section-scope">
        <h2 className="font-semibold">1. Define scope</h2>
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); preview.mutate() }}>
          <div className="min-w-64 flex-1"><Field label="Name, email, or phone query" hint="At least 3 characters; narrow to a reviewable lead scope. Provider tag-search is not verified. Preview creates no contacts."><input required minLength={3} className={inp} value={scope} onChange={(e) => setScope(e.target.value)} data-testid="input-scope" /></Field></div>
          <button className={btn2} disabled={!scope.trim() || preview.isPending} data-testid="button-preview">{preview.isPending ? 'Loading preview...' : 'Preview scope'}</button>
        </form>
        {preview.isError && <Banner kind="error">{errMsg(preview.error)}</Banner>}
        {p && (
          <div className="space-y-3" data-testid="preview-result">
            <Banner kind="info"><strong>{p.total}</strong> contact{p.total === 1 ? '' : 's'} match "{p.scope}". Preview expires {fmt(p.expires_at)}.</Banner>
            {p.sample.length === 0 ? <Empty title="Nothing matches" body="Adjust the tag or query and preview again." /> : (
              <table className="w-full text-sm"><thead className="text-left text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="py-1">Name</th><th>Source</th><th>Added</th></tr></thead>
                <tbody>{p.sample.map((r) => <tr key={r.id} className="border-t border-border"><td className="py-1.5">{r.name}</td><td>{r.source}</td><td>{fmt(r.dateAdded)}</td></tr>)}</tbody></table>
            )}
            <p className="text-xs text-muted-foreground">Showing a sample of {p.sample.length}.</p>
            <button className={btn} disabled={p.total === 0 || start.isPending} data-testid="button-start-import"
              onClick={() => { if (window.confirm(`Import ${p.total} contacts for "${p.scope}"? Automation stays off.`)) start.mutate(p.preview_id) }}>{start.isPending ? 'Starting...' : `Approve and import ${p.total}`}</button>
          </div>
        )}
      </section>

      <section className={card + ' space-y-3'} data-testid="section-status">
        <h2 className="font-semibold">2. Import status</h2>
        {imp.isLoading ? <Skeleton rows={2} /> : imp.isError ? <ErrorBox error={imp.error} retry={() => imp.refetch()} /> : !cur ? <Empty title="No imports yet" body="Preview a scope above to begin." /> : (
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-2"><Pill>{status || 'unknown'}</Pill>{processed !== undefined && <span data-testid="text-progress">{String(processed)}{total !== undefined ? ` of ${total}` : ''} processed</span>}</div>
            {cur.error && <Banner kind="error">{String(cur.error)}</Banner>}
            {cur.id && /fail|pause|stop|error|interrupt/i.test(status) && <button className={btn} disabled={resume.isPending} onClick={() => resume.mutate(cur.id)} data-testid="button-resume">Resume import</button>}
            <button className={btn2} onClick={() => imp.refetch()} data-testid="button-refresh-import">Refresh</button>
          </div>
        )}
      </section>

      <section className={card + ' space-y-3'} data-testid="section-reviews">
        <h2 className="font-semibold">3. Ambiguous merges</h2>
        {reviews.length === 0 ? <Empty title="No merges to review" body="Contacts matching more than one existing lead appear here." /> : reviews.map((r, i) => {
          const id = String(r.id ?? r.review_id ?? i)
          const cands: any[] = r.candidates ?? r.leads ?? []
          return (
            <div key={id} className="space-y-2 rounded-lg border border-border p-3 text-sm" data-testid={`review-${id}`}>
              <p className="font-medium">{r.name ?? r.contact?.name ?? r.email ?? `Review ${id}`}</p>
              <div className="flex flex-wrap gap-2">
                {cands.map((c) => <button key={String(c.id)} className={btn2} disabled={merge.isPending} onClick={() => merge.mutate({ reviewId: id, leadId: String(c.id) })} data-testid={`button-merge-${id}-${c.id}`}>Merge into {c.name ?? c.email ?? c.id}</button>)}
                <button className={btn2} disabled={merge.isPending} onClick={() => merge.mutate({ reviewId: id, leadId: null })} data-testid={`button-new-${id}`}>Keep as new lead</button>
              </div>
            </div>
          )
        })}
      </section>
    </div>
  )
}
