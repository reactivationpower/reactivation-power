import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getMarketingActivity, getMarketingEvents, removeMarketingHistory } from '@/app/actions/marketing'
import { ErrorBox, Pill, Skeleton, btn2, card, errMsg, fmt } from '@/components/leads/ui'
import { attrLabel } from './shared'

function Events({ leadId, sessionId, tz }: { leadId: string; sessionId: string; tz?: string | null }) {
  const [page, setPage] = useState(1)
  const q = useQuery({ queryKey: ['marketing', 'events', leadId, sessionId, page], queryFn: () => getMarketingEvents(leadId, sessionId, page) })
  if (q.isLoading) return <Skeleton rows={2} />
  if (q.isError) return <ErrorBox error={q.error} retry={() => q.refetch()} />
  const events: any[] = q.data?.events ?? []
  return (
    <div className="mt-2 space-y-2">
      {events.length === 0 ? <p className="text-xs text-muted-foreground">No events recorded in this session.</p> : (
        <ol className="space-y-1.5 border-l border-border pl-3" start={(page - 1) * 50 + 1}>
          {events.map((e, i) => (
            <li key={e.id} className="text-xs" data-testid={`marketing-event-${e.id}`}>
              <span className="mr-1 tabular-nums text-muted-foreground">{(page - 1) * 50 + i + 1}.</span>
              <span className="font-medium">{String(e.kind).replace(/_/g, ' ')}</span>
              {e.page_id && <span className="text-muted-foreground"> on {e.page_id}</span>}
              {e.detail?.control && <span className="text-muted-foreground"> · {e.detail.control}</span>}
              {e.detail?.category && <span className="text-muted-foreground"> · {e.detail.category}</span>}
              {e.detail?.video && <span className="text-muted-foreground"> · {e.detail.video} / {e.detail.placement}{typeof e.detail.position==='number'?` at ${Math.round(e.detail.position)}s`:''}</span>}
              {e.detail?.trusted && <span className="ml-1 text-primary">Server confirmed</span>}
              <span className="block text-muted-foreground">{fmt(e.occurred_at, tz)}</span>
            </li>
          ))}
        </ol>
      )}
      {(page > 1 || q.data?.hasMore) && (
        <div className="flex items-center gap-2">
          <button className={btn2 + ' px-2 py-1 text-xs'} disabled={page === 1} onClick={() => setPage(page - 1)}>Earlier</button>
          <span className="text-xs text-muted-foreground">Page {page}</span>
          <button className={btn2 + ' px-2 py-1 text-xs'} disabled={!q.data?.hasMore} onClick={() => setPage(page + 1)}>Later</button>
        </div>
      )}
    </div>
  )
}

/** Behavioral activity for one lead. No polling: reading this never counts as staff activity. */
export function MarketingActivityPanel({ leadId, tz }: { leadId: string; tz?: string | null }) {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')
  const [open, setOpen] = useState<string | null>(null)
  const q = useQuery({ queryKey: ['marketing', 'activity', leadId, page, order], queryFn: () => getMarketingActivity(leadId, page, order) })
  const remove = useMutation({
    mutationFn: () => removeMarketingHistory(leadId),
    onSuccess: () => { toast.success('Behavioral history removed'); qc.invalidateQueries({ queryKey: ['marketing'] }) },
    onError: (e) => toast.error(errMsg(e)),
  })
  const d = q.data
  const pages = d ? Math.max(1, Math.ceil(d.total / 20)) : 1
  return (
    <section className={card + ' space-y-4'} data-testid="section-marketing-activity" aria-labelledby="mkt-activity-h">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id="mkt-activity-h" className="font-semibold">Website activity</h2>
          <p className="text-xs text-muted-foreground">Observed browser sessions, not verified identity.{q.dataUpdatedAt ? ` Loaded ${fmt(new Date(q.dataUpdatedAt).toISOString(), tz)}.` : ''}</p>
        </div>
        <button className={btn2 + ' px-2 py-1 text-xs'} onClick={() => q.refetch()} disabled={q.isFetching}>{q.isFetching ? 'Loading' : 'Reload'}</button>
      </div>
      {q.isLoading ? <Skeleton rows={3} /> : q.isError || !d ? <ErrorBox error={q.error} retry={() => q.refetch()} /> : (
        <>
          <dl className="grid gap-2 text-sm">
            {[['First touch', d.first], ['Latest touch', d.latest]].map(([l, t]: any) => (
              <div key={l} className="rounded-md bg-muted/50 p-2"><dt className="text-xs uppercase tracking-wider text-muted-foreground">{l}</dt>
                <dd className="font-medium">{attrLabel(t?.attribution)}</dd>{t && <dd className="text-xs text-muted-foreground">{fmt(t.occurred_at, tz)}</dd>}</div>
            ))}
            <div className="rounded-md bg-muted/50 p-2"><dt className="text-xs uppercase tracking-wider text-muted-foreground">Conversions</dt>
              {d.conversions.length === 0 ? <dd className="text-muted-foreground">None recorded</dd> : d.conversions.map((c: any) => (
                <dd key={c.id} className="mt-1 text-xs"><Pill>{c.kind}</Pill> {fmt(c.occurred_at, tz)}<span className="block text-muted-foreground">First: {attrLabel(c.first_touch)} · Last: {attrLabel(c.last_touch)}</span></dd>
              ))}</div>
          </dl>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">{d.total} session{d.total === 1 ? '' : 's'}</p>
            <button className={btn2 + ' px-2 py-1 text-xs'} onClick={() => { setOrder(order === 'desc' ? 'asc' : 'desc'); setPage(1) }} data-testid="button-session-order">
              {order === 'desc' ? 'Newest first' : 'Oldest first'}</button>
          </div>
          {d.sessions.length === 0 ? <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">No tracked sessions for this lead yet.</p> : (
            <ul className="space-y-2">
              {d.sessions.map((s: any) => {
                const isOpen = open === s.id
                return (
                  <li key={s.id} className="rounded-md border border-border" data-testid={`marketing-session-${s.id}`}>
                    <button className="flex w-full items-start gap-3 p-2 text-left hover:bg-muted/50" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : s.id)}>
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold tabular-nums text-primary">{s.number}</span>
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="block font-medium">{fmt(s.started_at, tz)}</span>
                        <span className="block truncate text-xs text-muted-foreground">{s.funnel ?? 'unknown funnel'} · {s.event_count} events · {attrLabel(s.attribution)}</span>
                        <span className="block text-xs text-muted-foreground">{s.entry_page} · {s.device} · {s.summary?.pages??0} page views · {s.summary?.clicks??0} clicks · {s.summary?.errors??0} errors</span>
                      </span>
                      <span aria-hidden="true" className="text-xs text-muted-foreground">{isOpen ? 'Hide' : 'Show'}</span>
                    </button>
                    {isOpen && <div className="border-t border-border p-2"><Events leadId={leadId} sessionId={s.id} tz={tz} /></div>}
                  </li>
                )
              })}
            </ul>
          )}
          {pages > 1 && (
            <div className="flex items-center justify-between">
              <button className={btn2 + ' px-2 py-1 text-xs'} disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button>
              <span className="text-xs text-muted-foreground">Page {page} of {pages}</span>
              <button className={btn2 + ' px-2 py-1 text-xs'} disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          )}
          {d.superAdmin && d.total > 0 && (
            <button className={btn2 + ' w-full text-destructive'} disabled={remove.isPending} data-testid="button-remove-marketing"
              onClick={() => { if (window.confirm('Permanently remove all behavioral history for this lead? This is audited and cannot be undone.')) remove.mutate() }}>
              {remove.isPending ? 'Removing...' : 'Remove behavioral history'}</button>
          )}
        </>
      )}
    </section>
  )
}
