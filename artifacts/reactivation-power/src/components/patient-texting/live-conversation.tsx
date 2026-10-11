import { useEffect, useState } from 'react'
import { ShieldOff, UserRound, NotebookPen } from 'lucide-react'
import { action } from '@/lib/api'
import { Button } from '@/components/ui/button'

export type LiveThread = {
  thread: { id: string; ownership: string; revision: number; handoffReason: string | null; preferences: string | null; nextOpening: string | null; createdAt: string }
  recipient: { id: string; consent: boolean; consentEvidence: string | null; timezone: string | null; stopped: boolean; updatedAt: string }
  messages: { id: string; sequence: number; role: string; body: string; delivery: string; actorId: string | null; createdAt: string }[]
  liveEnabled: false
}

const openTextConversation = action<LiveThread | null>('patient-texting', 'openTextConversation')
const takeTextConversation = action<LiveThread | null>('patient-texting', 'takeTextConversation')
const saveTextEligibility = action<LiveThread | null>('patient-texting', 'saveTextEligibility')

const ZONES = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu']
const fmt = (iso: string | null | undefined) => iso ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) : '—'
const DELIVERY: Record<string, string> = { internal_note: 'internal note, not sent' }

export function LiveConversation({ leadId, conversation, isOwner, onChange }: {
  leadId: string; conversation: LiveThread | null; isOwner: boolean; onChange: (t: LiveThread | null) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const run = async (fn: () => Promise<LiveThread | null>, after?: () => void) => {
    setBusy(true); setError('')
    try { onChange(await fn()); after?.() }
    catch (e: any) { setError(e?.message || 'That did not work. Please try again.') }
    finally { setBusy(false) }
  }

  const disabledNote = <p className="text-xs text-muted-foreground">Live patient texting is disabled. This ledger records staff activity only; no message is sent to the patient. Readiness requirements are listed under Settings.</p>

  if (!conversation) return <>
    {disabledNote}
    <p className="mt-3 text-sm text-foreground">No conversation is open for this lead. Opening one creates an internal record so staff can claim it and the owner can record consent. It does not text anyone.</p>
    {error ? <p role="alert" className="mt-3 text-sm text-destructive">{error}</p> : null}
    <Button className="mt-3" disabled={busy} onClick={() => run(() => openTextConversation(leadId))} data-testid="button-open-conversation">{busy ? 'Opening…' : 'Open conversation'}</Button>
  </>

  const { thread, recipient, messages } = conversation
  return <>
    {disabledNote}
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${thread.ownership === 'team' ? 'bg-muted text-foreground' : 'bg-accent/10 text-accent'}`}>{thread.ownership === 'team' ? 'Team Member owns' : 'AI Text Assistant (dormant)'}</span>
      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${recipient.consent ? 'bg-accent/10 text-accent' : 'bg-muted text-muted-foreground'}`}>{recipient.consent ? 'Consent recorded' : 'No consent recorded'}</span>
      {recipient.stopped ? <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive"><ShieldOff className="size-3" />Opted out (STOP)</span> : null}
      {thread.handoffReason ? <span className="text-xs text-muted-foreground">{thread.handoffReason}</span> : null}
    </div>
    <p className="mt-1 text-xs text-muted-foreground">Opened {fmt(thread.createdAt)} · next office opening {fmt(thread.nextOpening)}</p>
    {thread.preferences ? <div className="mt-3 rounded-md border-l-2 border-accent bg-muted/40 px-3 py-2 text-sm"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preferences, pending staff confirmation</p><p className="text-foreground">{thread.preferences}</p></div> : null}

    <ol className="mt-4 space-y-2" aria-label="Conversation ledger">
      {messages.length === 0 ? <li className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">No entries yet.</li> : null}
      {messages.map(m => (
        <li key={m.id} className="rounded-md bg-muted/50 px-3 py-2 text-sm">
          <p className="whitespace-pre-wrap text-foreground">{m.body}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">#{m.sequence} · {m.role} · {DELIVERY[m.delivery] ?? m.delivery} · {fmt(m.createdAt)}</p>
        </li>
      ))}
    </ol>

    {error ? <p role="alert" className="mt-3 text-sm text-destructive">{error}</p> : null}

    <form className="mt-4 space-y-2" onSubmit={e => { e.preventDefault(); run(() => takeTextConversation(leadId, note, `ev-${crypto.randomUUID()}`), () => setNote('')) }}>
      <label htmlFor="live-note" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Internal note (visible to your team only)</label>
      <textarea id="live-note" rows={2} maxLength={1000} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={note} onChange={e => setNote(e.target.value)} disabled={busy} placeholder="Optional. Saving claims the conversation for your team." />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" className="gap-1.5" disabled={busy}>
          {note.trim() ? <><NotebookPen className="size-3.5" />Save note and take over</> : <><UserRound className="size-3.5" />Take over</>}
        </Button>
        <span className="self-center text-xs text-muted-foreground">Never sends an SMS.</span>
      </div>
    </form>

    {isOwner ? <EligibilityForm key={recipient.updatedAt} recipient={recipient} busy={busy} onSave={input => run(() => saveTextEligibility(leadId, input))} /> : null}
  </>
}

function EligibilityForm({ recipient, busy, onSave }: { recipient: LiveThread['recipient']; busy: boolean; onSave: (i: { consent: boolean; evidence: string; timezone: string | null; stopped: boolean }) => void }) {
  const [consent, setConsent] = useState(recipient.consent)
  const [evidence, setEvidence] = useState(recipient.consentEvidence ?? '')
  const [timezone, setTimezone] = useState(recipient.timezone ?? '')
  const [stopped, setStopped] = useState(recipient.stopped)
  const [confirmStop, setConfirmStop] = useState(false)
  useEffect(() => { if (!stopped) setConfirmStop(false) }, [stopped])
  const newStop = stopped && !recipient.stopped
  const invalid = consent && !stopped && !evidence.trim()

  return (
    <form className="mt-6 space-y-3 rounded-lg border border-border bg-muted/20 p-4" onSubmit={e => { e.preventDefault(); onSave({ consent: stopped ? false : consent, evidence, timezone: timezone || null, stopped }) }}>
      <div>
        <p className="text-sm font-semibold text-foreground">Recipient eligibility (owner only)</p>
        <p className="text-xs text-muted-foreground">Consent is never inferred from an import, a form source, or a requested time. Record only what you can document.</p>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={consent && !stopped} disabled={busy || stopped} onChange={e => setConsent(e.target.checked)} />Patient gave texting consent</label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">Consent evidence {consent && !stopped ? '(required)' : ''}</span>
        <textarea rows={2} maxLength={1000} className="rounded-md border border-input bg-background px-3 py-2 text-sm" value={evidence} disabled={busy} onChange={e => setEvidence(e.target.value)} placeholder="Where and when consent was given, e.g. signed intake form, date" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">Recipient timezone</span>
        <select className="h-9 max-w-xs rounded-md border border-input bg-background px-2 text-sm" value={timezone} disabled={busy} onChange={e => setTimezone(e.target.value)}>
          <option value="">Unknown (blocks contact)</option>
          {[...new Set([...(recipient.timezone ? [recipient.timezone] : []), ...ZONES])].map(z => <option key={z} value={z}>{z.replace('_', ' ')}</option>)}
        </select>
      </label>
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
        <label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={stopped} disabled={busy || recipient.stopped} onChange={e => setStopped(e.target.checked)} />Patient opted out (STOP)</label>
        <p className="mt-1 text-xs text-muted-foreground">
          {recipient.stopped ? 'This opt-out is permanent here. It cannot be cleared from this screen; a verified re-consent workflow is required.' : 'Recording STOP removes consent, pauses automation, and cannot be undone here.'}
        </p>
        {newStop ? <label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={confirmStop} onChange={e => setConfirmStop(e.target.checked)} />I understand this opt-out cannot be cleared here.</label> : null}
      </div>
      <Button type="submit" size="sm" variant={newStop ? 'destructive' : 'default'} disabled={busy || invalid || (newStop && !confirmStop)}>{busy ? 'Saving…' : 'Save eligibility'}</Button>
    </form>
  )
}
