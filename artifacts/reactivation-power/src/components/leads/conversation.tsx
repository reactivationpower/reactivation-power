import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'wouter'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getConversation, refreshConversation, sendMessage, type EmailSnapshot, type InboxChannel, type InboxMessage, type SendState } from '@/app/actions/sales-inbox'
import { Banner, ErrorBox, Pill, Skeleton, btn2, card, errMsg, fmt } from '@/components/leads/ui'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'

export const THREAD_MS = 30000
export const SMS_MAX = 1600
const CH_LABEL: Record<InboxChannel, string> = { email: 'Email', sms: 'Text', call: 'Call' }
const CH_TONE: Record<InboxChannel, string> = { email: 'bg-accent text-accent-foreground', sms: 'bg-secondary text-secondary-foreground', call: 'bg-muted text-muted-foreground' }

export const conversationKey = (leadId: string) => ['sales-inbox', 'conversation', leadId]

function newId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16) })
}
const statusOf = (e: unknown) => (e && typeof e === 'object' && 'status' in e && typeof (e as { status: unknown }).status === 'number' ? (e as { status: number }).status : 0)
export const isDenied = (e: unknown) => [401, 403].includes(statusOf(e)) || (e instanceof Error && e.message === 'Lead not available to this salesperson')

type View = 'texts' | 'other'

/** Outer wrapper: keyed by leadId so drafts, filters and media state never leak across contacts. */
export function LeadConversation({ leadId, onBack, embedded = false }: { leadId: string; onBack?: () => void; embedded?: boolean }) {
  return <Thread key={leadId} leadId={leadId} onBack={onBack} embedded={embedded} />
}

function Thread({ leadId, onBack, embedded }: { leadId: string; onBack?: () => void; embedded: boolean }) {
  const qc = useQueryClient()
  const key = conversationKey(leadId)
  const [denied, setDenied] = useState(false)
  const [view, setView] = useState<View>('texts')
  const q = useQuery({ queryKey: key, queryFn: () => getConversation(leadId), enabled: !denied, retry: (n, e) => !isDenied(e) && n < 2,
    refetchInterval: denied ? false : THREAD_MS, refetchIntervalInBackground: false })
  const [syncNote, setSyncNote] = useState<{ kind: 'warn' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (q.isError && isDenied(q.error)) { setDenied(true); qc.removeQueries({ queryKey: key }) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.isError, q.error])

  const refresh = useMutation({
    mutationFn: () => refreshConversation(leadId),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: key })
      if (r && r.state === 'throttled') setSyncNote({ kind: 'warn', text: r.reason || 'Refresh recently ran. Try again in a moment.' })
      else if (r && r.state === 'unavailable') setSyncNote({ kind: 'error', text: r.reason || 'Provider unavailable; showing saved history.' })
      else { setSyncNote(null); toast.success('Conversation refreshed') }
    },
    onError: (e) => { if (isDenied(e)) { setDenied(true); qc.removeQueries({ queryKey: key }) } else setSyncNote({ kind: 'error', text: errMsg(e) }) },
  })

  const back = onBack ? <button className="text-sm text-muted-foreground hover:underline lg:hidden" onClick={onBack} data-testid="button-inbox-back">Back to list</button> : null
  if (denied) return <section className={card + ' space-y-2'} data-testid="conversation-denied">{back}<h2 className="font-semibold">Conversation not available</h2><p className="text-sm text-muted-foreground">You no longer have access to this lead's conversation. Nothing from it is kept on this screen.</p></section>
  if (q.isLoading) return <div className={card} data-testid="conversation-loading"><Skeleton rows={5} /></div>
  if (!q.data) return <div className={card + ' space-y-3'}>{back}<ErrorBox error={q.error} retry={() => q.refetch()} /></div>
  const { lead, messages, readiness, historyTruncated, synchronization } = q.data
  const texts = messages.filter((m) => m.channel === 'sms').sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))
  const other = messages.filter((m) => m.channel !== 'sms')

  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card break-words" data-testid="lead-conversation">
      <header className="space-y-2 border-b border-border px-4 py-3">
        {back}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate font-semibold" data-testid="text-thread-name">{lead.first_name} {lead.last_name}</h2>
            <p className="truncate text-xs text-muted-foreground">{lead.phone || 'No phone number'}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg bg-muted p-0.5" role="tablist" aria-label="Conversation type">
              {([['texts', `Texts${texts.length ? ` (${texts.length})` : ''}`], ['other', `Emails & calls${other.length ? ` (${other.length})` : ''}`]] as const).map(([v, l]) => (
                <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} data-testid={`tab-conversation-${v}`}
                  className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${view === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{l}</button>
              ))}
            </div>
            <button className={btn2 + ' px-2.5 py-1.5'} disabled={refresh.isPending} onClick={() => refresh.mutate()} data-testid="button-refresh-thread" title="Check GoHighLevel for new messages">{refresh.isPending ? 'Refreshing...' : 'Refresh'}</button>
          </div>
        </div>
        {!embedded && <Link href={`/admin/leads/${encodeURIComponent(lead.id)}`} className="text-xs text-muted-foreground hover:underline" data-testid="link-lead-detail">Open lead record</Link>}
        {q.isError && <Banner kind="warn"><span data-testid="banner-stale">Could not update: {errMsg(q.error)}. Showing the last loaded messages; your draft is kept.</span></Banner>}
        {synchronization && synchronization.state !== 'current' && synchronization.state !== 'throttled' && <Banner kind="warn"><span data-testid="banner-provider-sync">{synchronization.reason || 'Could not reach GoHighLevel; showing saved messages.'}</span></Banner>}
        {syncNote && <Banner kind={syncNote.kind}><span data-testid="banner-sync">{syncNote.text}</span></Banner>}
      </header>
      {view === 'texts'
        ? <TextThread leadId={leadId} texts={texts} ready={readiness.sms} reasons={readiness.reasons} confirm={readiness.confirm ?? []} to={lead.phone} />
        : <OtherActivity messages={other} truncated={!!historyTruncated} />}
      <p className="sr-only" aria-live="polite">{q.isFetching ? 'Updating messages' : ''}</p>
    </section>
  )
}

const dayKey = (iso: string) => new Date(iso).toDateString()
function dayLabel(iso: string) {
  const d = new Date(iso), today = new Date(), y = new Date(); y.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === y.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) })
}
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
function textStatus(m: InboxMessage): { label: string; bad?: boolean } | null {
  if (m.direction !== 'outbound') return null
  const s = String(m.canonical_status ?? m.status ?? '')
  if (s === 'delivered') return { label: 'Delivered' }
  if (s === 'read') return { label: 'Read' }
  if (s === 'failed') return { label: 'Not delivered', bad: true }
  if (s === 'uncertain') return { label: 'May not have sent — check GoHighLevel', bad: true }
  if (s === 'sending' || s === 'pending') return { label: 'Sending…' }
  if (s === 'accepted' || s === 'sent') return { label: 'Sent' }
  return null
}
const cleanBody = (b: string | null) => (b ?? '').replace(/\n\[[^\]]*\]$/, '')

function TextThread({ leadId, texts, ready, reasons, confirm, to }: { leadId: string; texts: InboxMessage[]; ready: boolean; reasons: string[]; confirm: string[]; to: string | null }) {
  const scroller = useRef<HTMLDivElement>(null)
  const nearBottom = useRef(true)
  const lastCount = useRef(0)
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    // Jump to the newest message on open and when new ones arrive, unless the user scrolled up to read.
    if (lastCount.current === 0 || nearBottom.current) el.scrollTop = el.scrollHeight
    lastCount.current = texts.length
  }, [texts.length])
  return (
    <>
      <div ref={scroller} onScroll={(e) => { const el = e.currentTarget; nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80 }}
        className="h-[28rem] overflow-y-auto bg-muted/30 px-3 py-4 sm:px-4 lg:h-[calc(100vh-22rem)] lg:min-h-[24rem]" aria-label="Text messages" data-testid="section-thread">
        {texts.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center"><p className="text-sm text-muted-foreground" data-testid="text-thread-empty">No texts yet. Send the first one below.</p></div>
        ) : (
          <ol className="space-y-1">
            {texts.map((m, i) => {
              const out = m.direction === 'outbound'
              const prev = texts[i - 1], next = texts[i + 1]
              const newDay = !prev || dayKey(prev.created_at) !== dayKey(m.created_at)
              const lastOfRun = !next || next.direction !== m.direction || dayKey(next.created_at) !== dayKey(m.created_at)
              const st = textStatus(m)
              return (
                <li key={m.id} data-testid={`message-${m.id}`}>
                  {newDay && <p className="py-3 text-center text-xs font-medium text-muted-foreground">{dayLabel(m.created_at)}</p>}
                  <div className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed sm:max-w-[70%] ${out ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-foreground'} ${lastOfRun ? (out ? 'rounded-br-md' : 'rounded-bl-md') : ''}`}
                      title={fmt(m.created_at)}>{cleanBody(m.body) || <span className="italic opacity-70">(no text)</span>}</div>
                  </div>
                  {lastOfRun && (
                    <p className={`mt-1 mb-2 px-1 text-[11px] text-muted-foreground ${out ? 'text-right' : 'text-left'}`}>
                      {out && m.source === 'appointment' ? 'Automatic reminder · ' : out && m.author_name ? `${m.author_name} · ` : ''}{timeOf(m.created_at)}
                      {st && <span className={st.bad ? 'font-medium text-destructive' : ''}> · {st.label}</span>}
                    </p>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </div>
      <SmsComposer leadId={leadId} ready={ready} reasons={reasons} confirm={confirm} to={to} />
    </>
  )
}

function OtherActivity({ messages, truncated }: { messages: InboxMessage[]; truncated: boolean }) {
  const [filter, setFilter] = useState<Record<'email' | 'call', boolean>>({ email: true, call: true })
  const shown = messages.filter((m) => m.channel !== 'sms' && filter[m.channel]).sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter">
        {(['email', 'call'] as const).map((c) => (
          <button key={c} type="button" aria-pressed={filter[c]} onClick={() => setFilter({ ...filter, [c]: !filter[c] })} data-testid={`filter-${c}`}
            className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${filter[c] ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card hover:bg-muted'}`}>{c === 'email' ? 'Emails' : 'Calls'}</button>
        ))}
      </div>
      {truncated && <p className="text-xs text-muted-foreground" data-testid="text-history-truncated">Older history is not shown here. GoHighLevel has the full history.</p>}
      {shown.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground" data-testid="text-other-empty">{messages.length === 0 ? 'No emails or calls yet.' : 'Nothing matches the selected filters.'}</p> : (
        <ol className="max-h-[36rem] space-y-3 overflow-y-auto">{shown.map((m) => <MessageRow key={m.id} m={m} />)}</ol>
      )}
      <p className="text-xs text-muted-foreground" data-testid="external-reply-warning">Email replies go to the reply-to mailbox, not here. An email reply does not automatically stop portal outreach, so update the lead if they respond.</p>
    </div>
  )
}

function statusLabel(m: InboxMessage) {
  const s = m.canonical_status ?? m.status
  if (!s) return null
  return s === 'sent' || s === 'accepted' ? 'sent' : s
}

function MessageRow({ m }: { m: InboxMessage }) {
  const out = m.direction === 'outbound'
  const event = m.direction === 'event' || m.channel === 'call'
  const st = statusLabel(m)
  return (
    <li className={`flex ${event ? 'justify-center' : out ? 'justify-end' : 'justify-start'}`} data-testid={`message-${m.id}`}>
      <div className={`min-w-0 max-w-full rounded-lg border p-3 sm:max-w-[85%] ${event ? 'border-dashed border-border bg-muted/40' : out ? 'border-primary/20 bg-primary/5' : 'border-border bg-card'} ${m.emailSnapshot ? 'w-full' : ''}`}>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Pill tone={CH_TONE[m.channel]}>{CH_LABEL[m.channel]}</Pill>
          <span>{m.direction === 'inbound' ? 'From lead' : m.direction === 'outbound' ? (m.author_name ? `Outbound · ${m.author_name}` : 'Outbound') : 'Event'}</span>
          {st && <span>{st}</span>}
          <span>{fmt(m.created_at)}</span>
        </div>
        {m.subject && <p className="mt-1 text-sm font-medium">{m.subject}</p>}
        {m.emailSnapshot ? <EmailSnapshotView s={m.emailSnapshot} id={m.id} /> : m.body ? <p className="mt-1 whitespace-pre-wrap text-sm">{m.body}</p> : null}
        {m.channel === 'call' && m.callMedia && <CallMediaPanel detailsUrl={m.callMedia.detailsUrl} id={m.id} />}
      </div>
    </li>
  )
}

const CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'"
export function snapshotDoc(html: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}"><meta name="referrer" content="no-referrer"><style>body{margin:0;padding:12px;font-family:system-ui,sans-serif}a{pointer-events:none;cursor:default}</style></head><body>${html}</body></html>`
}

export function EmailSnapshotView({ s, id }: { s: EmailSnapshot; id: string }) {
  return (
    <div className="mt-2 space-y-2" data-testid={`email-snapshot-${id}`}>
      <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
        <div><dt className="inline text-muted-foreground">To </dt><dd className="inline break-all">{s.recipient ?? 'Unknown'}</dd></div>
        <div><dt className="inline text-muted-foreground">From </dt><dd className="inline break-all">{s.from ?? 'Unknown'}</dd></div>
        {s.replyTo && <div><dt className="inline text-muted-foreground">Reply-To </dt><dd className="inline break-all">{s.replyTo}</dd></div>}
        <div><dt className="inline text-muted-foreground">Dispatch </dt><dd className="inline">{s.dispatchState}{s.providerStatus ? ` · provider: ${s.providerStatus}` : ''}</dd></div>
        <div><dt className="inline text-muted-foreground">Sent </dt><dd className="inline">{s.sentAt ? fmt(s.sentAt) : 'Not recorded'}</dd></div>
        <div><dt className="inline text-muted-foreground">Delivered </dt><dd className="inline">{s.deliveredAt ? fmt(s.deliveredAt) : 'Not confirmed'}</dd></div>
      </dl>
      {s.contentAvailable && s.html ? (
        <iframe title="Email snapshot" sandbox="" referrerPolicy="no-referrer" srcDoc={snapshotDoc(s.html)} className="h-80 w-full rounded-md border border-border bg-card" data-testid={`iframe-email-${id}`} />
      ) : <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground" data-testid={`email-unavailable-${id}`}>The email content was not stored, so it cannot be shown. Delivery details above are all that is recorded.</p>}
      <p className="text-xs text-muted-foreground">Read-only snapshot. Links, tracking and remote images are removed; image descriptions are shown when available.</p>
    </div>
  )
}

type Details = { direction: string | null; timestamp: string | null; outcome: string | null; durationSeconds: number | null; recording?: { playbackUrl: string }; transcript?: { url: string }; ghlLink?: { url: string; level: string } }
type Segment = { text: string; startMs: number | null; channel: number | null }
const safe = (u: unknown) => typeof u === 'string' && /^\/api\/sales\/leads\/[\w-]+\/calls\/[\w-]+\/(?:details|recording|transcript)$/.test(u) ? u : null
const ghlSafe = (u: unknown) => typeof u === 'string' && /^https:\/\/app\.gohighlevel\.com\/v2\/location\/[\w-]+\/contacts\/detail\/[\w-]+$/.test(u) ? u : null
async function mediaGet(url: string) {
  const r = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json' } })
  const body = await r.json().catch(() => null)
  if (!r.ok) {
    const msg = r.status === 401 || r.status === 403 ? 'You do not have access to this call.' : r.status === 404 ? 'Call not available.' : r.status === 429 ? 'Too many media requests. Wait a minute and try again.' : body?.explanation || 'GoHighLevel could not return this media.'
    throw Object.assign(new Error(msg), { status: r.status })
  }
  return body
}
const dur = (s: number) => `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`

export function CallMediaPanel({ detailsUrl, id }: { detailsUrl: string; id: string }) {
  const [details, setDetails] = useState<{ state: 'idle' | 'loading' | 'ok' | 'error'; data?: Details; error?: string }>({ state: 'idle' })
  const [transcript, setTranscript] = useState<{ state: 'idle' | 'loading' | 'ok' | 'error'; segs?: Segment[]; error?: string }>({ state: 'idle' })
  const [play, setPlay] = useState(false)
  const [audioErr, setAudioErr] = useState(false)
  const url = safe(detailsUrl)
  if (!url) return <p className="mt-2 text-xs text-muted-foreground">Call media link is not valid.</p>
  const load = async () => {
    setDetails({ state: 'loading' })
    try { setDetails({ state: 'ok', data: await mediaGet(url) }) } catch (e) { setDetails({ state: 'error', error: errMsg(e) }) }
  }
  const d = details.data
  const playback = safe(d?.recording?.playbackUrl)
  const tUrl = safe(d?.transcript?.url)
  const ghl = ghlSafe(d?.ghlLink?.url)
  const loadT = async () => {
    if (!tUrl) return
    setTranscript({ state: 'loading' })
    try { const b = await mediaGet(tUrl); setTranscript({ state: 'ok', segs: Array.isArray(b?.segments) ? b.segments : [] }) } catch (e) { setTranscript({ state: 'error', error: errMsg(e) }) }
  }
  return (
    <div className="mt-2 space-y-2 text-sm" data-testid={`call-media-${id}`}>
      {details.state === 'idle' && <button className={btn2} onClick={load} data-testid={`button-call-details-${id}`}>Load recording and transcript</button>}
      {details.state === 'loading' && <p className="text-xs text-muted-foreground" role="status">Checking GoHighLevel...</p>}
      {details.state === 'error' && <div className="space-y-1" role="alert"><p className="text-xs text-destructive" data-testid={`call-error-${id}`}>{details.error}</p><button className={btn2} onClick={load}>Try again</button></div>}
      {d && (
        <>
          <p className="text-xs text-muted-foreground">{[d.direction, d.outcome, d.durationSeconds != null ? dur(d.durationSeconds) : null, d.timestamp ? fmt(d.timestamp) : null].filter(Boolean).join(' · ') || 'No call details reported'}</p>
          {ghl && <a className={btn2} href={ghl} target="_blank" rel="noopener noreferrer">Open call's contact in GoHighLevel</a>}
          {!playback && <p className="text-xs text-muted-foreground">Inline recording playback is not available for this call.</p>}
          {!tUrl && <p className="text-xs text-muted-foreground">A transcript is not available for this call.</p>}
          {playback && (play ? (
            audioErr ? <div><p className="text-xs text-destructive" role="alert" data-testid={`audio-error-${id}`}>The recording could not be played. Availability and media permission are not confirmed; check GoHighLevel or try again.</p><button className={btn2} onClick={() => { setAudioErr(false); setPlay(false) }}>Retry recording</button></div>
              : <audio controls preload="none" src={playback} onError={() => setAudioErr(true)} className="w-full" aria-label="Call recording" data-testid={`audio-${id}`} />
          ) : <button className={btn2} onClick={() => setPlay(true)} data-testid={`button-play-${id}`}>Play recording</button>)}
          {tUrl && transcript.state === 'idle' && <button className={btn2} onClick={loadT} data-testid={`button-transcript-${id}`}>Show transcript</button>}
          {transcript.state === 'loading' && <p className="text-xs text-muted-foreground" role="status">Loading transcript...</p>}
          {transcript.state === 'error' && <div><p className="text-xs text-destructive" role="alert" data-testid={`transcript-error-${id}`}>{transcript.error}</p><button className={btn2} onClick={loadT}>Retry transcript</button></div>}
          {transcript.state === 'ok' && (transcript.segs!.length === 0 ? <p className="text-xs text-muted-foreground">No transcript text.</p> : (
            <ol className="max-h-60 space-y-1 overflow-y-auto rounded-md bg-muted/50 p-2 text-xs" aria-label="Call transcript" data-testid={`transcript-${id}`}>
              {transcript.segs!.map((s, i) => <li key={i}><span className="text-muted-foreground">{s.channel != null ? `Speaker ${s.channel}` : 'Speaker'}{s.startMs != null ? ` · ${dur(s.startMs / 1000)}` : ''}: </span>{s.text}</li>)}
            </ol>
          ))}
        </>
      )}
    </div>
  )
}

type Outcome = { state: SendState | 'error'; error?: string } | null
type SendInput = Parameters<typeof sendMessage>[0]

/** The server ends "ask first" refusals with this question (e.g. it became night after the thread loaded). */
const ASK_SUFFIX = 'Send anyway?'
const askItems = (e: unknown) => {
  const m = errMsg(e).trim()
  return m.endsWith(ASK_SUFFIX) ? [m.slice(0, -ASK_SUFFIX.length).trim()].filter(Boolean) : null
}

export function SmsComposer({ leadId, ready, reasons = [], confirm = [], to }: { leadId: string; ready: boolean; reasons?: string[]; confirm?: string[]; to: string | null }) {
  const qc = useQueryClient()
  const [body, setBody] = useState('')
  const [outcome, setOutcome] = useState<Outcome>(null)
  // "Send anyway?" popup: the concerns to show and the exact send waiting on a yes.
  const [ask, setAsk] = useState<{ items: string[]; input: SendInput } | null>(null)
  const box = useRef<HTMLTextAreaElement>(null)
  // Same payload reuses the same requestId (safe retry); any change gets a new one.
  const pending = useRef<{ payload: string; requestId: string } | null>(null)
  const send = useMutation({
    mutationFn: (input: SendInput) => sendMessage(input),
    onSuccess: (r) => {
      const accepted = r.state === 'sent' || r.canonical_state === 'accepted'
      setOutcome(accepted ? null : r)
      if (accepted) { setBody(''); pending.current = null; toast.success('Text sent') }
      qc.invalidateQueries({ queryKey: conversationKey(leadId) })
      qc.invalidateQueries({ queryKey: ['sales-leads'] })
    },
    onError: (e, input) => {
      const items = !input.confirmed && askItems(e)
      if (items) setAsk({ items: items.length ? items : ['Please double-check before sending.'], input })
      else setOutcome({ state: 'error', error: errMsg(e) })
    },
  })
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [body])
  const len = body.trim().length
  const over = len > SMS_MAX
  // Only true hard stops block sending; "ask first" items become a popup on Send.
  const stops = !ready ? (reasons.length ? reasons : ['Texting is not available.']) : !to ? ['This lead has no phone number.'] : []
  const canSend = ready && !!to && len > 0 && !over && !send.isPending && !ask
  const submit = () => {
    if (!canSend) return
    const payload = body.trim()
    if (!pending.current || pending.current.payload !== payload) pending.current = { payload, requestId: newId() }
    setOutcome(null)
    const input: SendInput = { leadId, channel: 'sms', body: payload, requestId: pending.current.requestId }
    if (confirm.length) setAsk({ items: confirm, input })
    else send.mutate(input)
  }
  const sendAnyway = () => {
    if (!ask) return
    send.mutate({ ...ask.input, confirmed: true })
    setAsk(null)
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit() }
  }
  return (
    <div className="space-y-2 border-t border-border p-3" data-testid="composer-sms">
      <div className="flex items-end gap-2">
        <label className="sr-only" htmlFor={`sms-${leadId}`}>Text message</label>
        <textarea id={`sms-${leadId}`} ref={box} rows={1} value={body} onChange={(e) => setBody(e.target.value)} onKeyDown={onKey}
          placeholder="Text message" data-testid="input-sms-body"
          className="max-h-40 min-h-[2.5rem] flex-1 resize-none rounded-2xl border border-input bg-card px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60" />
        <button type="button" className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!canSend} onClick={submit} data-testid="button-send-sms">
          {send.isPending ? 'Sending…' : outcome && (outcome.state === 'error' || outcome.state === 'failed') ? 'Try again' : 'Send'}
        </button>
      </div>
      {stops.length > 0 && <p className="px-1 text-xs text-muted-foreground" role="status" data-testid="sms-blocked">Can’t send: {stops.join(' ')}</p>}
      <div className="flex justify-between gap-2 px-1 text-[11px] text-muted-foreground">
        <span>Sent from your GoHighLevel number{to ? ` to ${to}` : ''}. Enter sends · Shift+Enter for a new line.</span>
        {len > 140 && <span className={over ? 'font-medium text-destructive' : ''} data-testid={over ? 'text-sms-over' : 'text-sms-count'}>{len}/{SMS_MAX}</span>}
      </div>
      {outcome?.state === 'sending' && <Banner kind="info">Still sending. Check the thread in a moment before trying again.</Banner>}
      {outcome?.state === 'uncertain' && <Banner kind="warn">We’re not sure this text went out. Check GoHighLevel before sending it again.{outcome.error ? ` ${outcome.error}` : ''}</Banner>}
      {outcome?.state === 'failed' && <Banner kind="error">Not sent{outcome.error ? `: ${outcome.error}` : '.'} Your message is kept.</Banner>}
      {outcome?.state === 'error' && <Banner kind="error"><span data-testid="banner-send-error">Not sent: {outcome.error}. Your message is kept, so you can try again.</span></Banner>}
      <AlertDialog open={!!ask} onOpenChange={(open) => { if (!open) setAsk(null) }}>
        <AlertDialogContent data-testid="dialog-send-anyway">
          <AlertDialogHeader>
            <AlertDialogTitle>Send anyway?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1">{ask?.items.map((t, i) => <p key={i}>{t}</p>)}</div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-send-anyway-no">No, keep draft</AlertDialogCancel>
            <AlertDialogAction onClick={sendAnyway} data-testid="button-send-anyway-yes">Yes, send</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
