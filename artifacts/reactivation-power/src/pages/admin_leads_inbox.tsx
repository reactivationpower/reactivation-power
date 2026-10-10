import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useSearch } from 'wouter'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getConversation, listInbox, refreshConversation, sendMessage, type InboxChannel, type InboxMessage, type SendState } from '@/app/actions/sales-inbox'
import { Banner, Empty, ErrorBox, Field, LeadsTabs, Pill, Skeleton, btn, btn2, card, errMsg, fmt, inp } from '@/components/leads/ui'

const PAGE_SIZE = 25
const THREAD_MS = 30000
const CH_LABEL: Record<InboxChannel, string> = { email: 'Email', sms: 'Text', call: 'Call' }
const CH_TONE: Record<InboxChannel, string> = { email: 'bg-accent text-accent-foreground', sms: 'bg-secondary text-secondary-foreground', call: 'bg-muted text-muted-foreground' }

function newId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16) })
}

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
      <header><h1 className="text-2xl font-semibold">Leads</h1><p className="mt-1 text-sm text-muted-foreground">One thread per lead: email, texts and call records together.</p></header>
      <LeadsTabs />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
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
          {selected ? <Thread key={selected} leadId={selected} onBack={() => select(null)} /> : <Empty title="Select a conversation" body="Choose a lead to see email, texts and calls in one place." />}
        </main>
      </div>
    </div>
  )
}

function Thread({ leadId, onBack }: { leadId: string; onBack: () => void }) {
  const qc = useQueryClient()
  const key = ['sales-inbox', 'conversation', leadId]
  const q = useQuery({ queryKey: key, queryFn: () => getConversation(leadId), refetchInterval: THREAD_MS })
  const [filter, setFilter] = useState<Record<InboxChannel, boolean>>({ email: true, sms: true, call: true })
  const refresh = useMutation({
    mutationFn: () => refreshConversation(leadId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); toast.success('Conversation refreshed') },
    onError: (e) => toast.error(errMsg(e)),
  })

  if (q.isLoading) return <div className={card}><Skeleton rows={6} /></div>
  if (q.isError || !q.data) return <div className={card + ' space-y-3'}><button className={btn2 + ' lg:hidden'} onClick={onBack}>Back to list</button><ErrorBox error={q.error} retry={() => q.refetch()} /></div>
  const { lead, messages, readiness, contactUrl } = q.data
  const shown = [...messages].filter((m) => filter[m.channel]).sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))

  return (
    <div className="space-y-4 break-words">
      <section className={card + ' space-y-3'}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <button className="text-sm text-muted-foreground hover:underline lg:hidden" onClick={onBack} data-testid="button-inbox-back">Back to list</button>
            <h2 className="text-lg font-semibold" data-testid="text-thread-name">{lead.first_name} {lead.last_name}</h2>
            <p className="break-all text-sm text-muted-foreground">{[lead.email, lead.phone].filter(Boolean).join(' · ') || 'No contact details'}</p>
            <Link href={`/admin/leads/${encodeURIComponent(lead.id)}`} className="text-sm text-muted-foreground hover:underline" data-testid="link-lead-detail">Open lead record</Link>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={btn2} disabled={refresh.isPending} onClick={() => refresh.mutate()} data-testid="button-refresh-thread">{refresh.isPending ? 'Refreshing...' : 'Refresh'}</button>
            {contactUrl ? <a href={contactUrl} target="_blank" rel="noopener noreferrer" className={btn2} data-testid="link-thread-call">Call in GoHighLevel</a>
              : <button className={btn2} disabled title="No GoHighLevel contact is linked yet">Call in GoHighLevel</button>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter channels">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Show</span>
          {(Object.keys(CH_LABEL) as InboxChannel[]).map((c) => (
            <button key={c} type="button" aria-pressed={filter[c]} onClick={() => setFilter({ ...filter, [c]: !filter[c] })} data-testid={`filter-${c}`}
              className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${filter[c] ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card hover:bg-muted'}`}>{CH_LABEL[c]}</button>
          ))}
          {q.isFetching && !q.isLoading && <span className="text-xs text-muted-foreground">Updating...</span>}
        </div>
        <p className="text-xs text-muted-foreground">Calls are placed in GoHighLevel in a new tab, never from this browser. Thread updates every 30 seconds.</p>
      </section>

      <section className={card} aria-label="Messages" data-testid="section-thread">
        {shown.length === 0 ? <p className="text-sm text-muted-foreground">{messages.length === 0 ? 'No messages or calls recorded for this lead yet.' : 'Nothing matches the selected channels.'}</p> : (
          <ol className="space-y-3">{shown.map((m) => <MessageRow key={m.id} m={m} />)}</ol>
        )}
      </section>

      {readiness.reasons.length > 0 && (
        <Banner kind="warn"><p className="font-medium">Some sending is blocked</p><ul className="mt-1 list-disc pl-5">{readiness.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul></Banner>
      )}
      <div className="grid gap-4 xl:grid-cols-2">
        <Composer leadId={leadId} channel="email" ready={readiness.email} to={lead.email} />
        <Composer leadId={leadId} channel="sms" ready={readiness.sms} to={lead.phone} />
      </div>
    </div>
  )
}

function MessageRow({ m }: { m: InboxMessage }) {
  const out = m.direction === 'outbound'
  const event = m.direction === 'event' || m.channel === 'call'
  return (
    <li className={`flex ${event ? 'justify-center' : out ? 'justify-end' : 'justify-start'}`} data-testid={`message-${m.id}`}>
      <div className={`min-w-0 max-w-full rounded-lg border p-3 sm:max-w-[85%] ${event ? 'border-dashed border-border bg-muted/40' : out ? 'border-primary/20 bg-primary/5' : 'border-border bg-card'}`}>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Pill tone={CH_TONE[m.channel]}>{CH_LABEL[m.channel]}</Pill>
          <span>{m.direction === 'inbound' ? 'From lead' : m.direction === 'outbound' ? (m.author_name ? `Sent by ${m.author_name}` : 'Sent') : 'Event'}</span>
          {m.status && <span>{m.status === 'sent' ? 'accepted by provider' : m.status}</span>}
          <span>{fmt(m.created_at)}</span>
        </div>
        {m.subject && <p className="mt-1 text-sm font-medium">{m.subject}</p>}
        {m.body ? <p className="mt-1 whitespace-pre-wrap text-sm">{m.body}</p> : null}
      </div>
    </li>
  )
}

type Outcome = { state: SendState | 'error'; error?: string } | null

function Composer({ leadId, channel, ready, to }: { leadId: string; channel: 'email' | 'sms'; ready: boolean; to: string | null }) {
  const qc = useQueryClient()
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [outcome, setOutcome] = useState<Outcome>(null)
  // Same payload reuses the same requestId (safe network retry); any payload change gets a new one.
  const pending = useRef<{ payload: string; requestId: string } | null>(null)
  const isEmail = channel === 'email'
  const label = isEmail ? 'Email' : 'Text'
  const send = useMutation({
    mutationFn: (input: Parameters<typeof sendMessage>[0]) => sendMessage(input),
    onSuccess: (r) => {
      setOutcome(r)
      if (r.state === 'sent') { setSubject(''); setBody(''); pending.current = null; toast.success(`${label} accepted by provider`) }
      qc.invalidateQueries({ queryKey: ['sales-inbox', 'conversation', leadId] })
    },
    onError: (e) => setOutcome({ state: 'error', error: errMsg(e) }),
  })
  const canSend = ready && !!to && body.trim().length > 0 && (!isEmail || subject.trim().length > 0) && !send.isPending
  const submit = () => {
    const payload = JSON.stringify({ channel, subject: isEmail ? subject.trim() : undefined, body: body.trim() })
    if (!pending.current || pending.current.payload !== payload) pending.current = { payload, requestId: newId() }
    setOutcome(null)
    send.mutate({ leadId, channel, ...(isEmail && { subject: subject.trim() }), body: body.trim(), requestId: pending.current.requestId })
  }
  const edit = (fn: () => void) => { fn(); if (outcome?.state === 'sent') setOutcome(null) }

  return (
    <section className={card + ' min-w-0 space-y-3'} data-testid={`composer-${channel}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{label}</h3>
        <Pill tone={ready ? 'bg-success/15 text-success' : 'bg-yellow-500/15'}>{ready ? 'Ready' : 'Blocked'}</Pill>
      </div>
      <p className="break-all text-xs text-muted-foreground">To: {to || (isEmail ? 'no email on file' : 'no phone on file')}</p>
      {isEmail && <Field label="Subject"><input className={inp} value={subject} disabled={!ready || send.isPending} onChange={(e) => edit(() => setSubject(e.target.value))} data-testid="input-email-subject" /></Field>}
      <Field label="Message" hint="Plain text only.">
        <textarea rows={4} className={inp} value={body} disabled={!ready || send.isPending} onChange={(e) => edit(() => setBody(e.target.value))} data-testid={`input-${channel}-body`} />
      </Field>
      <button className={btn} disabled={!canSend} onClick={submit} data-testid={`button-send-${channel}`}>
        {send.isPending ? 'Sending...' : outcome && outcome.state !== 'sent' && outcome.state !== 'sending' ? `Try ${label.toLowerCase()} again` : `Send ${label.toLowerCase()}`}
      </button>
      {!ready && <p className="text-xs text-muted-foreground">{label} is blocked. See the reasons above.</p>}
      {outcome?.state === 'sent' && <Banner kind="ok">Accepted by the provider. This does not confirm delivery.</Banner>}
      {outcome?.state === 'sending' && <Banner kind="info">Still sending. Check the thread shortly before trying again.</Banner>}
      {outcome?.state === 'uncertain' && <Banner kind="warn">The result is uncertain. It may have been sent. Check the thread before trying again; nothing is resent automatically.{outcome.error ? ` ${outcome.error}` : ''}</Banner>}
      {outcome?.state === 'failed' && <Banner kind="error">Not sent{outcome.error ? `: ${outcome.error}` : '.'} Your draft is kept.</Banner>}
      {outcome?.state === 'error' && <Banner kind="error">Could not reach the server: {outcome.error}. Your draft is kept. Trying again with the same message is safe.</Banner>}
    </section>
  )
}
