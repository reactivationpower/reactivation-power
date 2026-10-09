import { useRef, useState } from 'react'
import { Link, useParams, useLocation } from 'wouter'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { addSalesNote, convertSalesLead, getSalesLead, getSalesMedia, logSalesCall, retrySalesSync, updateSalesLead } from '@/app/actions/sales-leads'
import { SALES_DISPOSITIONS, SALES_STAGES, type SalesDisposition, type SalesStage } from '@workspace/shared/sales-leads'
import { MarketingActivityPanel } from '@/components/marketing/activity-panel'
import { Banner, ErrorBox, Field, Pill, REFRESH_MS, Skeleton, btn, btn2, card, errMsg, fmt, inp, localToIso, useDashboard, viewerTz } from '@/components/leads/ui'

const TERMINAL: SalesDisposition[] = ['Booked', 'Wrong Number', 'Do Not Contact']
const MEDIA_RE = /call|media|recording|voicemail|attachment|image|audio/i

export default function AdminLeadDetailPage() {
  const { id = '' } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const dash = useDashboard()
  const q = useQuery({ queryKey: ['sales-leads', 'detail', id], queryFn: () => getSalesLead(id), refetchInterval: q => q.state.data?.lead.sync_state === 'pending' ? 2000 : REFRESH_MS })
  const refresh = () => qc.invalidateQueries({ queryKey: ['sales-leads'] })
  const [draft, setDraft] = useState<Record<string, string> | null>(null)
  const draftRevision = useRef<number | null>(null)
  const [note, setNote] = useState('')
  const [disp, setDisp] = useState<SalesDisposition | null>(null)
  const [callNotes, setCallNotes] = useState(''); const [fu, setFu] = useState(''); const [useSlot, setUseSlot] = useState(false)
  const [nextFu, setNextFu] = useState<string | null>(null)
  const [, navigate] = useLocation()

  const save = useMutation({
    mutationFn: (p: Parameters<typeof updateSalesLead>[1]) => updateSalesLead(id, p),
    onSuccess: () => { toast.success('Saved'); setDraft(null); draftRevision.current = null; setNextFu(null); refresh() },
    onError: (e) => toast.error(errMsg(e)),
  })
  const addNote = useMutation({ mutationFn: () => addSalesNote(id, note.trim()), onSuccess: () => { toast.success('Note added'); setNote(''); refresh() }, onError: (e) => toast.error(errMsg(e)) })
  const log = useMutation({
    mutationFn: (p: Parameters<typeof logSalesCall>[1]) => logSalesCall(id, p),
    onSuccess: () => { toast.success('Call logged'); setDisp(null); setCallNotes(''); setFu(''); setUseSlot(false); refresh() },
    onError: (e) => toast.error(errMsg(e)),
  })
  const convert = useMutation({ mutationFn: () => convertSalesLead(id), onSuccess: (r) => navigate(r.enrollmentUrl), onError: (e) => toast.error(errMsg(e)) })
  const retry = useMutation({ mutationFn: () => retrySalesSync(id), onSuccess: () => { toast.success('Sync retry queued'); refresh() }, onError: (e) => toast.error(errMsg(e)) })
  const media = useMutation({
    mutationFn: (aid: string) => getSalesMedia(id, aid),
    onSuccess: (r) => { if (r.contactUrl) window.open(r.contactUrl, '_blank', 'noopener,noreferrer'); else toast.message(r.explanation || 'Media unavailable') ; if (r.contactUrl) toast.message(r.explanation) },
    onError: (e) => toast.error(errMsg(e)),
  })

  if (q.isLoading) return <Skeleton rows={8} />
  if (q.isError || !q.data) return <ErrorBox error={q.error} retry={() => q.refetch()} />
  const { lead, activities, submissions, contact_url, suggested_followup, jobs } = q.data
  const team = dash.data?.team ?? []
  const superAdmin = dash.data?.super_admin === true
  const tz = lead.timezone
  const v = (k: string, server: string) => draft?.[k] ?? server
  const setV = (k: string, val: string) => {
    if (!draft) draftRevision.current = lead.revision
    setDraft({ ...(draft ?? {}), [k]: val })
  }
  const nonTerminal = disp !== null && !TERMINAL.includes(disp)
  const hasFu = !!fu || (useSlot && !!suggested_followup)
  const canLog = !!disp && callNotes.trim().length > 0 && (!nonTerminal || hasFu) && !log.isPending
  const priorNotes = activities.filter((a) => a.kind === 'note' || a.kind === 'call')
  const sorted = [...activities].sort((a, b) => +new Date(b.occurred_at) - +new Date(a.occurred_at))
  const dirty = !!draft

  const saveContact = () => {
    const d = draft ?? {}
    save.mutate({ revision: draftRevision.current ?? lead.revision, ...(d.firstName !== undefined && { firstName: d.firstName.trim() }), ...(d.lastName !== undefined && { lastName: d.lastName.trim() }),
      ...(d.email !== undefined && { email: d.email.trim() }), ...(d.phone !== undefined && { phone: d.phone.trim() }), ...(d.practiceName !== undefined && { practiceName: d.practiceName.trim() }),
      ...(d.timezone !== undefined && { timezone: d.timezone.trim() }), ...(d.consentEvidence !== undefined && { consentEvidence: d.consentEvidence.trim() }) })
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/leads" className="text-sm text-muted-foreground hover:underline" data-testid="link-back">Back to leads</Link>
          <h1 className="mt-1 text-2xl font-semibold" data-testid="text-lead-name">{lead.first_name} {lead.last_name}</h1>
          <p className="text-sm text-muted-foreground">{lead.practice_name} · {lead.source}{lead.historical ? ' · historical' : ''}</p>
          <div className="mt-2 flex flex-wrap gap-1.5"><Pill>{lead.stage}</Pill>{lead.dnd && <Pill tone="bg-destructive/15 text-destructive">Do not disturb</Pill>}{!lead.consent && <Pill tone="bg-yellow-500/15">No consent on file</Pill>}<Pill>{`Automation ${lead.automation_state}`}</Pill></div>
        </div>
        <div className="flex flex-wrap gap-2">
          {contact_url ? (
            <a href={contact_url} target="_blank" rel="noopener noreferrer" className={btn} data-testid="link-ghl-call">Open in GoHighLevel to call</a>
          ) : (
            <button className={btn} disabled title="No GoHighLevel contact is linked yet" data-testid="button-ghl-call-disabled">Open in GoHighLevel to call</button>
          )}
          {lead.customer_id ? <Link href={`/admin/customers/${lead.customer_id}`} className={btn2} data-testid="link-customer">View customer / continue enrollment</Link> : (
            <button className={btn2} disabled={convert.isPending || lead.stage === 'Lost/Do Not Contact'} onClick={() => convert.mutate()} data-testid="button-convert">{convert.isPending ? 'Opening...' : 'Start enrollment'}</button>
          )}
        </div>
      </header>
      {!contact_url && <Banner kind="info">No GoHighLevel contact link yet. Calls are placed in GoHighLevel in a new tab, never from this browser.</Banner>}
      {(lead.sync_state !== 'synced' || lead.sync_error) && (
        <Banner kind={lead.sync_error ? 'error' : 'info'}>
          <div className="flex flex-wrap items-center justify-between gap-2"><span>Sync: {lead.sync_state}{lead.sync_error ? ` - ${lead.sync_error}` : ''}</span>
            <button className={btn2} disabled={retry.isPending || lead.sync_state === 'uncertain'} onClick={() => retry.mutate()} data-testid="button-retry-sync">{retry.isPending ? 'Queuing retry...' : 'Retry sync'}</button></div>
        </Banner>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 break-words lg:col-span-2">
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
            <div className="space-y-3 border-t border-border pt-3">
              <button className={btn} disabled={!canLog} data-testid="button-log-call"
                onClick={() => log.mutate({ disposition: disp!, notes: callNotes.trim(), ...(nonTerminal && (useSlot ? { nextFollowupAt: suggested_followup!, confirmedSuggestedSlot: true } : { nextFollowupAt: localToIso(fu) })) })}>
                {log.isPending ? 'Logging...' : 'Log Call'}
              </button>
              {!disp ? <p className="text-xs text-muted-foreground">Choose a disposition to enable Log Call.</p> : nonTerminal && !canLog ? <p className="text-xs text-muted-foreground">Choose a follow-up time below or explicitly confirm the suggested slot.</p> : null}
              <Field label="Call notes"><textarea rows={3} className={inp} value={callNotes} onChange={(e) => setCallNotes(e.target.value)} data-testid="input-call-notes" /></Field>
              {nonTerminal && (
                <div className="space-y-2 rounded-md bg-muted/50 p-3 text-sm" data-testid="followup-required">
                  <p className="font-medium">Follow-up required for {disp}</p>
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

          <section className={card} data-testid="section-timeline">
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
          </section>
        </div>

        <aside className="min-w-0 space-y-6 break-words">
          <MarketingActivityPanel leadId={id} tz={tz} />
          <section className={card + ' space-y-3'}>
            <h2 className="font-semibold">Assignment and stage</h2>
            <Field label="Assignee"><select className={inp} value={lead.assignee_id ?? ''} disabled={save.isPending} onChange={(e) => save.mutate({ revision: lead.revision, assigneeId: e.target.value || null })} data-testid="select-assignee">
              <option value="">Unassigned</option>{team.filter((t) => t.active || t.id === lead.assignee_id).map((t) => <option key={t.id} value={t.id}>{t.name || t.email}</option>)}</select></Field>
            <Field label="Stage"><select className={inp} value={lead.stage} disabled={save.isPending} onChange={(e) => save.mutate({ revision: lead.revision, stage: e.target.value as SalesStage })} data-testid="select-stage">
              {SALES_STAGES.map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Field label={`Next follow-up (${viewerTz})`} hint={`Current: ${fmt(lead.next_followup_at, tz)}`}>
              <div className="flex gap-2"><input type="datetime-local" className={inp} value={nextFu ?? ''} onChange={(e) => setNextFu(e.target.value)} data-testid="input-next-followup" />
                <button className={btn2} disabled={nextFu === null || save.isPending} onClick={() => save.mutate({ revision: lead.revision, nextFollowupAt: nextFu ? localToIso(nextFu)! : null })} data-testid="button-save-followup">Set</button></div></Field>
            {lead.next_followup_at && <button className={btn2} onClick={() => save.mutate({ revision: lead.revision, nextFollowupAt: null })} data-testid="button-clear-followup">Clear follow-up</button>}
          </section>

          <section className={card + ' space-y-3'}>
            <h2 className="font-semibold">Contact</h2>
            {([['firstName', 'First name', lead.first_name], ['lastName', 'Last name', lead.last_name], ['email', 'Email', lead.email], ['phone', 'Phone', lead.phone], ['practiceName', 'Practice', lead.practice_name], ['timezone', 'Timezone (IANA)', lead.timezone ?? '']] as const).map(([k, l, s]) => (
              <Field key={k} label={l} hint={k === 'timezone' ? (lead.timezone_confirmed_at ? `Confirmed ${fmt(lead.timezone_confirmed_at, tz)}` : `Origin: ${lead.timezone_origin ?? 'unknown'}, unconfirmed`) : undefined}>
                <input className={inp} value={v(k, s)} onChange={(e) => setV(k, e.target.value)} data-testid={`input-${k}`} /></Field>
            ))}
            <Field label="Consent evidence"><textarea rows={2} className={inp} value={v('consentEvidence', '')} placeholder={lead.consent ? 'Consent on file. Add evidence to update.' : 'Describe how consent was given'} onChange={(e) => setV('consentEvidence', e.target.value)} data-testid="input-consent" /></Field>
            <div className="flex gap-2">
              <button className={btn} disabled={!dirty || save.isPending} onClick={saveContact} data-testid="button-save-contact">{save.isPending ? 'Saving...' : 'Save contact'}</button>
              {dirty && <button className={btn2} onClick={() => setDraft(null)} data-testid="button-discard">Discard</button>}
            </div>
            {dirty && <p className="text-xs text-muted-foreground">Unsaved edits are kept during background refresh.</p>}
          </section>

          <section className={card + ' space-y-2'} data-testid="section-sync">
            <h2 className="font-semibold">Sync status</h2>
            <p className="text-sm">State: <Pill>{lead.sync_state}</Pill></p>
            <p className="text-xs text-muted-foreground">GHL contact: {lead.ghl_contact_id ?? 'not linked'} · Updated {fmt(lead.updated_at, tz)}</p>
            {jobs.length === 0 ? <p className="text-sm text-muted-foreground">No background jobs.</p> : jobs.map((j) => (
              <div key={j.id} className="rounded-md bg-muted/50 p-2 text-xs"><span className="font-medium">{j.kind}</span> · {j.state} · {j.attempts} attempt{j.attempts === 1 ? '' : 's'} · due {fmt(j.due_at, tz)}{j.last_error && <p className="text-destructive">{j.last_error}</p>}</div>
            ))}
          </section>
        </aside>
      </div>
    </div>
  )
}
