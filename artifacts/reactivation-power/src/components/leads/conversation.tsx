import { useEffect, useRef, useState } from 'react'
import { Link } from 'wouter'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getConversation, refreshConversation, sendMessage, type EmailSnapshot, type InboxChannel, type InboxMessage, type SendState } from '@/app/actions/sales-inbox'
import { Banner, ErrorBox, Field, Pill, Skeleton, btn, btn2, card, errMsg, fmt, inp } from '@/components/leads/ui'

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

/** Outer wrapper: keyed by leadId so drafts, filters and media state never leak across contacts. */
export function LeadConversation({ leadId, onBack, embedded = false }: { leadId: string; onBack?: () => void; embedded?: boolean }) {
  return <Thread key={leadId} leadId={leadId} onBack={onBack} embedded={embedded} />
}

function Thread({ leadId, onBack, embedded }: { leadId: string; onBack?: () => void; embedded: boolean }) {
  const qc = useQueryClient()
  const key = conversationKey(leadId)
  const [denied, setDenied] = useState(false)
  const q = useQuery({ queryKey: key, queryFn: () => getConversation(leadId), enabled: !denied, retry: (n, e) => !isDenied(e) && n < 2,
    refetchInterval: denied ? false : THREAD_MS, refetchIntervalInBackground: false })
  const [filter, setFilter] = useState<Record<InboxChannel, boolean>>({ email: true, sms: true, call: true })
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
  const { lead, messages, readiness, contactUrl, historyTruncated, synchronization } = q.data
  const shown = [...messages].filter((m) => filter[m.channel]).sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))
  const stale = q.isError

  return (
    <div className="min-w-0 space-y-4 break-words" data-testid="lead-conversation">
      <section className={card + ' space-y-3'}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {back}
            <h2 className="text-lg font-semibold" data-testid="text-thread-name">{embedded ? 'Conversation' : `${lead.first_name} ${lead.last_name}`}</h2>
            <p className="break-all text-sm text-muted-foreground">{[lead.email, lead.phone].filter(Boolean).join(' · ') || 'No contact details'}</p>
            {!embedded && <Link href={`/admin/leads/${encodeURIComponent(lead.id)}`} className="text-sm text-muted-foreground hover:underline" data-testid="link-lead-detail">Open lead record</Link>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={btn2} disabled={refresh.isPending} onClick={() => refresh.mutate()} data-testid="button-refresh-thread">{refresh.isPending ? 'Refreshing...' : 'Refresh'}</button>
            {!embedded && (contactUrl ? <a href={contactUrl} target="_blank" rel="noopener noreferrer" className={btn2} data-testid="link-thread-call">Call in GoHighLevel</a>
              : <button className={btn2} disabled title="No GoHighLevel contact is linked yet">Call in GoHighLevel</button>)}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter channels">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Show</span>
          {(Object.keys(CH_LABEL) as InboxChannel[]).map((c) => (
            <button key={c} type="button" aria-pressed={filter[c]} onClick={() => setFilter({ ...filter, [c]: !filter[c] })} data-testid={`filter-${c}`}
              className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${filter[c] ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card hover:bg-muted'}`}>{CH_LABEL[c]}</button>
          ))}
          {q.isFetching && <span className="text-xs text-muted-foreground">Updating...</span>}
        </div>
        <p className="text-xs text-muted-foreground" data-testid="text-sync-time">Last updated {fmt(new Date(q.dataUpdatedAt).toISOString())}. Updates every 30 seconds while open. Calls are placed in GoHighLevel, never from this browser.</p>
        {stale && <Banner kind="warn"><span data-testid="banner-stale">Could not update: {errMsg(q.error)}. Showing the last loaded history; drafts are kept.</span></Banner>}
        {synchronization && synchronization.state !== 'current' && <Banner kind="warn"><span data-testid="banner-provider-sync">{synchronization.reason || 'Provider refresh is delayed; showing saved history.'}</span></Banner>}
        {syncNote && <Banner kind={syncNote.kind}><span data-testid="banner-sync">{syncNote.text}</span></Banner>}
      </section>

      <section className={card} aria-label="Messages" data-testid="section-thread">
        {historyTruncated && <p className="mb-3 text-xs text-muted-foreground" data-testid="text-history-truncated">Older history is not shown. GoHighLevel has additional provider text and call history; automated email history is stored separately.</p>}
        {shown.length === 0 ? <p className="text-sm text-muted-foreground" data-testid="text-thread-empty">{messages.length === 0 ? 'No messages or calls recorded for this lead yet.' : 'Nothing matches the selected channels.'}</p> : (
          <ol className="max-h-[32rem] space-y-3 overflow-y-auto">{shown.map((m) => <MessageRow key={m.id} m={m} />)}</ol>
        )}
      </section>

      {readiness.reasons.length > 0 && (
        <Banner kind="warn"><p className="font-medium">Some sending is blocked</p><ul className="mt-1 list-disc pl-5">{readiness.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul></Banner>
      )}
      <SmsComposer leadId={leadId} ready={readiness.sms} to={lead.phone} />
    </div>
  )
}

function statusLabel(m: InboxMessage) {
  const s = m.canonical_status ?? m.status
  if (!s) return null
  return s === 'sent' || s === 'accepted' ? 'accepted by provider' : s
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

export function SmsComposer({ leadId, ready, to }: { leadId: string; ready: boolean; to: string | null }) {
  const qc = useQueryClient()
  const [body, setBody] = useState('')
  const [outcome, setOutcome] = useState<Outcome>(null)
  // Same payload reuses the same requestId (safe retry); any change gets a new one.
  const pending = useRef<{ payload: string; requestId: string } | null>(null)
  const send = useMutation({
    mutationFn: (input: Parameters<typeof sendMessage>[0]) => sendMessage(input),
    onSuccess: (r) => {
      const accepted = r.state === 'sent' || r.canonical_state === 'accepted'
      setOutcome(accepted ? { state: 'sent' } : r)
      if (accepted) { setBody(''); pending.current = null; toast.success('Text accepted by provider') }
      qc.invalidateQueries({ queryKey: conversationKey(leadId) })
    },
    onError: (e) => setOutcome({ state: 'error', error: errMsg(e) }),
  })
  const len = body.trim().length
  const over = len > SMS_MAX
  const canSend = ready && !!to && len > 0 && !over && !send.isPending
  const submit = () => {
    const payload = body.trim()
    if (!pending.current || pending.current.payload !== payload) pending.current = { payload, requestId: newId() }
    setOutcome(null)
    send.mutate({ leadId, channel: 'sms', body: payload, requestId: pending.current.requestId })
  }
  return (
    <section className={card + ' min-w-0 space-y-3'} data-testid="composer-sms">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Text</h3>
        <Pill tone={ready ? 'bg-success/15 text-success' : 'bg-yellow-500/15'}>{ready ? 'Ready' : 'Blocked'}</Pill>
      </div>
      <p className="break-all text-xs text-muted-foreground">To: {to || 'no phone on file'}</p>
      <Field label="Message" hint={`Plain text only. ${len}/${SMS_MAX} characters.`}>
        <textarea rows={4} className={inp} value={body} maxLength={SMS_MAX + 200} disabled={!ready || send.isPending} aria-invalid={over}
          onChange={(e) => { setBody(e.target.value); if (outcome?.state === 'sent') setOutcome(null) }} data-testid="input-sms-body" />
      </Field>
      {over && <p className="text-xs text-destructive" data-testid="text-sms-over">Texts are limited to {SMS_MAX} characters.</p>}
      <button className={btn} disabled={!canSend} onClick={submit} data-testid="button-send-sms">
        {send.isPending ? 'Sending...' : outcome && outcome.state !== 'sent' && outcome.state !== 'sending' ? 'Try text again' : 'Send text'}
      </button>
      {!ready && <p className="text-xs text-muted-foreground">Texting is blocked. See the reasons above.</p>}
      {outcome?.state === 'sent' && <Banner kind="ok">Accepted by the provider. This does not confirm delivery.</Banner>}
      {outcome?.state === 'sending' && <Banner kind="info">Still sending. Check the thread shortly before trying again.</Banner>}
      {outcome?.state === 'uncertain' && <Banner kind="warn">The result is uncertain. It may have been sent. Check the thread before trying again; nothing is resent automatically.{outcome.error ? ` ${outcome.error}` : ''}</Banner>}
      {outcome?.state === 'failed' && <Banner kind="error">Not sent{outcome.error ? `: ${outcome.error}` : '.'} Your draft is kept.</Banner>}
      {outcome?.state === 'error' && <Banner kind="error"><span data-testid="banner-send-error">Could not reach the server: {outcome.error}. Your draft is kept. Trying again with the same message is safe.</span></Banner>}
    </section>
  )
}
