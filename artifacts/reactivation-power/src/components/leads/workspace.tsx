import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { addSalesNote, getSalesMedia, logSalesCall } from '@/app/actions/sales-leads'
import { SALES_DISPOSITIONS, type SalesDetail, type SalesDisposition } from '@workspace/shared/sales-leads'
import { LeadConversation } from '@/components/leads/conversation'
import { Field, Pill, btn, btn2, card, errMsg, fmt, inp, localToIso, viewerTz } from '@/components/leads/ui'

const TERMINAL: SalesDisposition[] = ['Booked', 'Wrong Number', 'Do Not Contact']
const MEDIA_RE = /call|media|recording|voicemail|attachment|image|audio/i
export const LEAD_TABS = [['conversation', 'Texts & messages'], ['call', 'Log call & notes'], ['history', 'History']] as const
type LeadTab = typeof LEAD_TABS[number][0]

/**
 * The lead's "Texts & messages", "Log call & notes" and "History" sections.
 * Shared by the lead page and the customer page so both show one history.
 * A lead already linked to a customer stays Won when a call is logged, so a follow-up time is optional.
 */
export function LeadWorkspace({ leadId, detail, superAdmin }: { leadId: string; detail: SalesDetail; superAdmin: boolean }) {
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: ['sales-leads'] })
  const [note, setNote] = useState('')
  const [disp, setDisp] = useState<SalesDisposition | null>(null)
  const [callNotes, setCallNotes] = useState(''); const [fu, setFu] = useState(''); const [useSlot, setUseSlot] = useState(false)
  const [tab, setTab] = useState<LeadTab>('conversation')

  const addNote = useMutation({ mutationFn: () => addSalesNote(leadId, note.trim()), onSuccess: () => { toast.success('Note added'); setNote(''); refresh() }, onError: (e) => toast.error(errMsg(e)) })
  const log = useMutation({
    mutationFn: (p: Parameters<typeof logSalesCall>[1]) => logSalesCall(leadId, p),
    onSuccess: () => { toast.success('Call logged'); setDisp(null); setCallNotes(''); setFu(''); setUseSlot(false); refresh() },
    onError: (e) => toast.error(errMsg(e)),
  })
  const media = useMutation({
    mutationFn: (aid: string) => getSalesMedia(leadId, aid),
    onSuccess: (r) => { if (r.contactUrl) window.open(r.contactUrl, '_blank', 'noopener,noreferrer'); else toast.message(r.explanation || 'Media unavailable') ; if (r.contactUrl) toast.message(r.explanation) },
    onError: (e) => toast.error(errMsg(e)),
  })

  const { lead, activities, submissions, suggested_followup } = detail
  const tz = lead.timezone
  const customer = !!lead.customer_id
  const nonTerminal = disp !== null && !TERMINAL.includes(disp)
  const hasFu = !!fu || (useSlot && !!suggested_followup)
  const canLog = !!disp && callNotes.trim().length > 0 && (!nonTerminal || hasFu || customer) && !log.isPending
  const priorNotes = activities.filter((a) => a.kind === 'note' || a.kind === 'call')
  const sorted = [...activities].sort((a, b) => +new Date(b.occurred_at) - +new Date(a.occurred_at))
  const followup = nonTerminal && hasFu ? (useSlot ? { nextFollowupAt: suggested_followup!, confirmedSuggestedSlot: true } : { nextFollowupAt: localToIso(fu) }) : {}

  return (
    <>
      <nav className="flex gap-1 overflow-x-auto border-b border-border" role="tablist" aria-label="Lead sections">
        {LEAD_TABS.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} data-testid={`tab-lead-${k}`}
            className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium ${tab === k ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{l}</button>
        ))}
      </nav>
      {tab === 'conversation' && <LeadConversation leadId={leadId} embedded />}
      {tab === 'call' && <>
      <section className={card + ' space-y-3'} data-testid="section-context">
        <h2 className="font-semibold">Context before you contact</h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Next follow-up</dt><dd>{fmt(lead.next_followup_at, tz)}</dd></div>
          <div><dt className="text-muted-foreground">Last reply</dt><dd>{fmt(lead.last_reply_at, tz)}</dd></div>
          <div><dt className="text-muted-foreground">Appointment</dt><dd>{lead.appointment_status ?? 'None'}</dd></div>
          <div><dt className="text-muted-foreground">Created</dt><dd>{fmt(lead.created_at, tz)}</dd></div>
        </dl>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Submissions</p>
          {submissions.length === 0 ? <p className="text-sm text-muted-foreground">No form submissions recorded.</p> : submissions.map((s) => (
            <details key={s.id} className="mt-1 rounded-md border border-border p-2 text-sm" data-testid={`submission-${s.id}`}>
              <summary className="cursor-pointer">{s.source} · {s.source_path} · {fmt(s.submitted_at, tz)}{s.historical ? ' (historical)' : ''}</summary>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs">{JSON.stringify({ context: s.context, consent_evidence: s.consent_evidence }, null, 2)}</pre>
            </details>
          ))}
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Previous notes and calls</p>
          {priorNotes.length === 0 ? <p className="text-sm text-muted-foreground">No previous notes. This is a first touch.</p> : (
            <ul className="mt-1 space-y-2">{priorNotes.slice().sort((a, b) => +new Date(b.occurred_at) - +new Date(a.occurred_at)).slice(0, 5).map((a) => (
              <li key={a.id} className="rounded-md bg-muted/50 p-2 text-sm"><span className="text-xs text-muted-foreground">{fmt(a.occurred_at, tz)} · {a.author_name ?? 'System'}{a.disposition ? ` · ${a.disposition}` : ''}</span><p className="whitespace-pre-wrap">{a.body}</p></li>
            ))}</ul>
          )}
        </div>
      </section>

      <section className={card + ' space-y-3'} data-testid="section-log-call">
        <h2 className="font-semibold">Disposition</h2>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Call disposition">
          {SALES_DISPOSITIONS.map((d) => (
            <button key={d} type="button" aria-pressed={disp === d} onClick={() => setDisp(d)} data-testid={`chip-${d}`}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${disp === d ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card hover:bg-muted'}`}>{d}</button>
          ))}
        </div>
        {customer && <p className="text-xs text-muted-foreground" data-testid="text-customer-call">This lead is already a customer. Logging a call keeps the stage at {lead.stage}, and a follow-up time is optional.</p>}
        <div className="space-y-3 border-t border-border pt-3">
          <button className={btn} disabled={!canLog} data-testid="button-log-call"
            onClick={() => log.mutate({ disposition: disp!, notes: callNotes.trim(), ...followup })}>
            {log.isPending ? 'Logging...' : 'Log Call'}
          </button>
          {!disp ? <p className="text-xs text-muted-foreground">Choose a disposition to enable Log Call.</p> : nonTerminal && !canLog && !customer ? <p className="text-xs text-muted-foreground">Choose a follow-up time below or explicitly confirm the suggested slot.</p> : null}
          <Field label="Call notes"><textarea rows={3} className={inp} value={callNotes} onChange={(e) => setCallNotes(e.target.value)} data-testid="input-call-notes" /></Field>
          {nonTerminal && (
            <div className="space-y-2 rounded-md bg-muted/50 p-3 text-sm" data-testid={customer ? 'followup-optional' : 'followup-required'}>
              <p className="font-medium">{customer ? `Follow-up for ${disp} (optional)` : `Follow-up required for ${disp}`}</p>
              <Field label={`Follow-up time (${viewerTz})`}><input type="datetime-local" className={inp} value={fu} onChange={(e) => { setFu(e.target.value); if (e.target.value) setUseSlot(false) }} data-testid="input-followup" /></Field>
              {suggested_followup ? (
                <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={useSlot} onChange={(e) => { setUseSlot(e.target.checked); if (e.target.checked) setFu('') }} data-testid="checkbox-suggested-slot" />
                  <span>Confirm suggested slot: {fmt(suggested_followup, tz)}</span></label>
              ) : <p className="text-muted-foreground">No suggested slot available. Pick a time.</p>}
            </div>
          )}
        </div>
      </section>

      <section className={card + ' space-y-3'}>
        <h2 className="font-semibold">Notes</h2>
        <textarea rows={3} className={inp} placeholder="Add a note" value={note} onChange={(e) => setNote(e.target.value)} data-testid="input-note" />
        <button className={btn} disabled={!note.trim() || addNote.isPending} onClick={() => addNote.mutate()} data-testid="button-add-note">Add note</button>
      </section>
      </>}

      {tab === 'history' && <section className={card} data-testid="section-timeline">
        <h2 className="mb-3 font-semibold">Timeline <span className="text-xs font-normal text-muted-foreground">(times in {tz || viewerTz})</span></h2>
        {sorted.length === 0 ? <p className="text-sm text-muted-foreground">No activity yet.</p> : (
          <ol className="space-y-3 border-l border-border pl-4">
            {sorted.map((a) => (
              <li key={a.id} data-testid={`activity-${a.id}`}>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Pill>{a.kind}</Pill>{a.disposition && <Pill>{a.disposition}</Pill>}{a.status && <span>{a.status}</span>}<span>{fmt(a.occurred_at, tz)}</span><span>{a.author_name ?? 'System'}</span></div>
                {a.body && <p className="mt-1 whitespace-pre-wrap text-sm">{a.body}</p>}
                {a.next_followup_at && <p className="text-xs text-muted-foreground">Follow-up: {fmt(a.next_followup_at, tz)}</p>}
                {MEDIA_RE.test(a.kind) && (superAdmin ? (
                  <button className={btn2 + ' mt-1'} disabled={media.isPending} onClick={() => media.mutate(a.id)} data-testid={`button-media-${a.id}`}>Open media in GoHighLevel</button>
                ) : <p className="mt-1 text-xs text-muted-foreground">Media access requires a super admin.</p>)}
              </li>
            ))}
          </ol>
        )}
      </section>}
    </>
  )
}
