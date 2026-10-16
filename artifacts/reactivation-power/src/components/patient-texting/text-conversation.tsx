import { useCallback, useEffect, useRef, useState } from 'react'
import { MessageSquareText, RotateCcw, UserRound, FlaskConical } from 'lucide-react'
import { action } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { LiveConversation, type LiveThread } from './live-conversation'

type Message = {
  id: string; role: 'patient' | 'assistant' | 'staff' | 'system'; text: string; at: string
  delivery: 'simulated' | 'received' | 'cancelled' | 'failed'; source: 'model' | 'human' | 'rule'; modelId?: string; tokens?: number
}
type Simulation = {
  mode: 'simulation'; leadId: string; patient: string; submittedAt: string; practice: string
  campaign: { name: string }; clock: string; recipientTimezone: string; consent: boolean; stopped: boolean
  ownership: 'ai' | 'team'; reason: string | null; summary?: string; nextOpening: string | null; messages: Message[]
  events: string[]; revision: number; pending: string | null; reminderAt: string | null; preferences: string
  policy: { timezone: string }
}
type Conversation = { simulation: Simulation | null; conversation?: LiveThread | null; isOwner?: boolean; isDemo: boolean; liveEnabled: boolean; budget: { reservedCents: number; limitCents: number; calls: number } | null }

const getTextConversation = action<Conversation>('patient-texting', 'getTextConversation')
const startTextSimulation = action<Simulation>('patient-texting', 'startTextSimulation')
const changeTextSimulation = action<Simulation>('patient-texting', 'changeTextSimulation')

const fmt = (iso: string | null | undefined, tz?: string) => iso ? new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: tz, timeZoneName: 'short' }).format(new Date(iso)) : '—'
const eventId = () => `ev-${crypto.randomUUID()}`
const ROLE: Record<Message['role'], string> = { patient: 'Patient (fictional)', assistant: 'AI Text Assistant', staff: 'Staff', system: 'System' }

export function TextConversation({ leadId }: { leadId: string }) {
  const [conv, setConv] = useState<Conversation | null>(null)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [patientText, setPatientText] = useState('')
  const [staffText, setStaffText] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)
  const busyRef = useRef(false)

  const refresh = useCallback(async () => {
    try { setConv(await getTextConversation(leadId)); setLoadError('') }
    catch (e: any) { setLoadError(e?.message || 'Unable to load the texting conversation.') }
  }, [leadId])

  useEffect(() => { refresh() }, [refresh])
  useEffect(() => {
    const t = setInterval(() => { if (!busyRef.current && document.visibilityState === 'visible') refresh() }, 6000)
    return () => clearInterval(t)
  }, [refresh])

  const run = async (fn: () => Promise<Simulation | undefined>, after?: () => void) => {
    setBusy(true); busyRef.current = true; setError('')
    try { const s = await fn(); if (s) setConv(c => c ? { ...c, simulation: s } : c); after?.() }
    catch (e: any) { setError(e?.message || 'That did not work. Please try again.') }
    finally { setBusy(false); busyRef.current = false; refresh() }
  }
  const cmd = (c: Record<string, unknown>, after?: () => void) => run(() => changeTextSimulation(leadId, { ...c, eventId: eventId() }), after)

  const shell = (body: React.ReactNode) => (
    <section className="mt-6 rounded-lg border border-border bg-card" aria-label="Patient texting">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-3">
        <MessageSquareText className="size-4 text-accent" />
        <h2 className="text-base font-semibold text-foreground">Patient texting</h2>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-dashed border-accent/60 bg-accent/5 px-2.5 py-0.5 text-xs font-medium text-accent"><FlaskConical className="size-3" />{conv && !conv.isDemo ? 'Live texting disabled, nothing sent' : 'Simulation only, nothing sent'}</span>
      </div>
      <div className="px-6 py-4">{body}</div>
    </section>
  )

  if (!conv) return shell(loadError
    ? <div role="alert" className="flex items-center gap-3 text-sm text-destructive">{loadError}<Button size="sm" variant="outline" onClick={refresh}>Retry</Button></div>
    : <div className="space-y-2" role="status" aria-label="Loading"><div className="h-4 w-2/3 animate-pulse rounded bg-muted" /><div className="h-20 animate-pulse rounded bg-muted" /></div>)

  if (!conv.isDemo) return shell(<LiveConversation leadId={leadId} conversation={conv.conversation ?? null} isOwner={!!conv.isOwner}
    onChange={t => setConv(c => c ? { ...c, conversation: t } : c)} />)

  const s = conv.simulation
  const budget = conv.budget
  if (!s) return shell(<>
    <p className="text-sm text-foreground">Rehearse a text conversation with the fictional Melissa Tran lead. Only that demo lead is eligible.</p>
    <p className="mt-1 text-xs text-muted-foreground">Starting is free. AI replies are generated only when you send a fictional patient message and draw from a small demo budget.</p>
    {error ? <p role="alert" className="mt-3 text-sm text-destructive">{error}</p> : null}
    <Button className="mt-3" disabled={busy} onClick={() => run(() => startTextSimulation(leadId))} data-testid="button-start-simulation">{busy ? 'Starting…' : 'Start fictional simulation'}</Button>
  </>)

  const tz = s.recipientTimezone
  const advance = (hours: number) => cmd({ kind: 'clock', clock: new Date(new Date(s.clock).getTime() + hours * 3600000).toISOString() })

  return shell(<>
    <div className="rounded-md border border-amber-300/60 bg-amber-50/60 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
      Enter fictional inputs only. Never type real patient names, health details, or contact information.
    </div>

    <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
      <div className="rounded-md border border-border p-3">
        <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actual source submission</dt>
        <dd className="mt-1 text-foreground">{fmt(s.submittedAt)}</dd>
        <dd className="text-xs text-muted-foreground">{s.campaign.name}. Real record, unchanged by the simulation.</dd>
      </div>
      <div className="rounded-md border border-dashed border-accent/60 bg-accent/5 p-3">
        <dt className="text-xs font-semibold uppercase tracking-wide text-accent">Simulated clock</dt>
        <dd className="mt-1 font-mono text-foreground" data-testid="text-sim-clock">{fmt(s.clock, tz)}</dd>
        <dd className="text-xs text-muted-foreground">Recipient timezone {tz} (fixture). Next office opening {fmt(s.nextOpening, s.policy.timezone)}</dd>
      </div>
    </dl>

    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${s.ownership === 'ai' ? 'bg-accent/10 text-accent' : 'bg-muted text-foreground'}`}>
        {s.ownership === 'ai' ? 'AI Text Assistant handling' : 'Team Member handling'}
      </span>
      {s.stopped ? <span className="rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">Opted out (STOP)</span> : null}
      {s.pending ? <span className="animate-pulse text-xs text-muted-foreground">AI reply in progress…</span> : null}
      {s.reason ? <span className="text-xs text-muted-foreground">{s.reason}</span> : null}
    </div>
    {s.summary ? <p className="whitespace-pre-line text-sm text-muted-foreground">{s.summary}</p> : null}

    {s.preferences ? (
      <div className="mt-3 rounded-md border-l-2 border-accent bg-muted/40 px-3 py-2 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Appointment preferences, pending staff confirmation</p>
        <p className="mt-0.5 text-foreground">{s.preferences}</p>
      </div>
    ) : null}

    <ol className="mt-4 space-y-3" aria-label="Simulated transcript">
      {s.messages.length === 0 ? <li className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">No simulated messages yet. Send a fictional patient message to begin.</li> : null}
      {s.messages.map(m => {
        const mine = m.role !== 'patient'
        return (
          <li key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${m.role === 'system' ? 'border border-destructive/40 bg-destructive/5' : mine ? 'bg-accent/10' : 'bg-muted'}`}>
              <p className="whitespace-pre-wrap text-foreground">{m.text}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {ROLE[m.role]} · {m.source === 'model' ? `model${m.modelId ? ` ${m.modelId}` : ''}` : m.source === 'rule' ? 'rule' : 'typed'} · {m.delivery} · {fmt(m.at, tz)}
              </p>
            </div>
          </li>
        )
      })}
    </ol>

    {error ? <p role="alert" className="mt-3 text-sm text-destructive">{error}</p> : null}

    <div className="mt-4 grid gap-3 md:grid-cols-2">
      <form className="space-y-2" onSubmit={e => { e.preventDefault(); if (patientText.trim()) cmd({ kind: 'patient', text: patientText }, () => setPatientText('')) }}>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="sim-patient">As the fictional patient</label>
        <textarea id="sim-patient" maxLength={1000} rows={2} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={patientText} onChange={e => setPatientText(e.target.value)} disabled={busy || s.stopped} placeholder="e.g. Is Saturday morning possible?" />
        <Button type="submit" size="sm" variant="outline" disabled={busy || !patientText.trim() || !!s.pending || s.stopped}>Send as patient</Button>
      </form>
      <form className="space-y-2" onSubmit={e => { e.preventDefault(); if (staffText.trim()) cmd({ kind: 'staff', text: staffText }, () => setStaffText('')) }}>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="sim-staff">As staff</label>
        <textarea id="sim-staff" maxLength={1000} rows={2} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={staffText} onChange={e => setStaffText(e.target.value)} disabled={busy || s.stopped} placeholder="Replying cancels automation" />
        <Button type="submit" size="sm" disabled={busy || !staffText.trim() || s.stopped}>Send as staff</Button>
      </form>
    </div>

    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
      <Button size="sm" variant="outline" className="gap-1.5" disabled={busy || s.ownership === 'team'} onClick={() => cmd({ kind: 'takeover' })}><UserRound className="size-3.5" />Take over</Button>
      <span className="text-xs text-muted-foreground">Advance clock:</span>
      {[1, 4, 24].map(h => <Button key={h} size="sm" variant="ghost" disabled={busy || !!s.pending} onClick={() => advance(h)}>+{h}h</Button>)}
      <div className="ml-auto">
        {confirmReset ? (
          <span className="inline-flex items-center gap-2 text-xs">
            Clear transcript and clock? Calls and campaign stay unchanged.
            <Button size="sm" variant="destructive" disabled={busy} onClick={() => cmd({ kind: 'reset' }, () => setConfirmReset(false))}>Reset</Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmReset(false)}>Cancel</Button>
          </span>
        ) : <Button size="sm" variant="ghost" className="gap-1.5" disabled={busy} onClick={() => setConfirmReset(true)}><RotateCcw className="size-3.5" />Reset simulation</Button>}
      </div>
    </div>

    {budget ? <p className="mt-3 text-xs text-muted-foreground">Demo AI budget: ${(budget.reservedCents / 100).toFixed(2)} of ${(budget.limitCents / 100).toFixed(2)} reserved across {budget.calls} calls.</p> : null}
    {s.events.length ? (
      <details className="mt-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer">Simulation log ({s.events.length})</summary>
        <ul className="mt-1 space-y-0.5 font-mono">{s.events.map((e, i) => <li key={i}>{e}</li>)}</ul>
      </details>
    ) : null}
  </>)
}
