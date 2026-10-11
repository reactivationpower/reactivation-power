import { useEffect, useState } from 'react'
import { useLocation, useSearch } from 'wouter'
import { useQuery } from '@tanstack/react-query'
import { listInbox } from '@/app/actions/sales-inbox'
import { Empty, ErrorBox, Field, LeadsTabs, Skeleton, btn2, fmt, inp } from '@/components/leads/ui'
import { LeadConversation } from '@/components/leads/conversation'
import { LeadContactPanel } from '@/components/leads/contact-panel'

const PAGE_SIZE = 25

export default function AdminLeadsInboxPage() {
  const search = useSearch()
  const [, navigate] = useLocation()
  const selected = new URLSearchParams(search).get('lead')
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [page, setPage] = useState(1)
  useEffect(() => { const t = setTimeout(() => { setDebounced(query.trim()); setPage(1) }, 300); return () => clearTimeout(t) }, [query])
  const list = useQuery({ queryKey: ['sales-inbox', 'list', debounced, page], queryFn: () => listInbox({ query: debounced || undefined, page }), placeholderData: (p) => p })
  const pages = Math.max(1, Math.ceil((list.data?.total ?? 0) / PAGE_SIZE))
  const select = (id: string | null) => navigate(id ? `/admin/leads/inbox?lead=${encodeURIComponent(id)}` : '/admin/leads/inbox')

  return (
    <div className="space-y-6">
      <header><h1 className="text-2xl font-semibold">Leads</h1><p className="mt-1 text-sm text-muted-foreground">Text your leads here. Their replies show up in the thread.</p></header>
      <LeadsTabs />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,17rem)_minmax(0,1fr)_minmax(0,20rem)]">
        <aside className={`min-w-0 space-y-3 ${selected ? 'hidden lg:block' : ''}`} aria-label="Conversations">
          <Field label="Search leads"><input type="search" className={inp} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, practice, email or phone" data-testid="input-inbox-search" /></Field>
          {list.isLoading ? <Skeleton rows={6} /> : list.isError || !list.data ? <ErrorBox error={list.error} retry={() => list.refetch()} /> : list.data.leads.length === 0 ? (
            <Empty title={debounced ? 'No matching leads' : 'No conversations yet'} body={debounced ? 'Try a different name, email or phone.' : 'Leads you can access appear here once they have activity.'} />
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card" data-testid="list-inbox">
              {list.data.leads.map((l) => (
                <li key={l.id}>
                  <button type="button" onClick={() => select(l.id)} aria-current={selected === l.id ? 'true' : undefined} data-testid={`inbox-lead-${l.id}`}
                    className={`block w-full min-w-0 px-4 py-3 text-left transition-colors hover:bg-muted ${selected === l.id ? 'bg-muted' : ''}`}>
                    <span className="block truncate text-sm font-medium">{l.first_name} {l.last_name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{l.practice_name || l.email || l.phone || 'No contact details'}</span>
                    <span className="block text-xs text-muted-foreground">{l.last_activity_at ? fmt(l.last_activity_at) : 'No activity'}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {list.data && list.data.total > 0 && (
            <div className="flex items-center justify-between gap-2 text-sm">
              <button className={btn2} disabled={page <= 1 || list.isFetching} onClick={() => setPage(page - 1)} data-testid="button-prev-page">Previous</button>
              <span className="text-muted-foreground">Page {page} of {pages}</span>
              <button className={btn2} disabled={page >= pages || list.isFetching} onClick={() => setPage(page + 1)} data-testid="button-next-page">Next</button>
            </div>
          )}
        </aside>
        <main className={`min-w-0 ${selected ? '' : 'hidden lg:block'}`}>
          {selected ? <LeadConversation leadId={selected} onBack={() => select(null)} /> : <Empty title="Pick a lead" body="Choose a lead on the left to see and send texts." />}
        </main>
        {selected && <aside className="min-w-0 lg:col-start-2 xl:col-start-auto" aria-label="Contact info"><LeadContactPanel key={selected} leadId={selected} /></aside>}
      </div>
    </div>
  )
}
