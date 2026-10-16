import { useRef, useState } from 'react'
import { Link, useParams, useLocation } from 'wouter'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { downloadTermsEvidence } from '@/app/actions/lead-terms'
import { convertSalesLead, getSalesLead, retrySalesSync, updateSalesLead } from '@/app/actions/sales-leads'
import { SALES_STAGES, type SalesStage } from '@workspace/shared/sales-leads'
import { LeadWorkspace } from '@/components/leads/workspace'
import { MarketingActivityPanel } from '@/components/marketing/activity-panel'
import { Banner, ErrorBox, Field, Pill, REFRESH_MS, Skeleton, btn, btn2, card, errMsg, fmt, inp, localToIso, useDashboard } from '@/components/leads/ui'

export default function AdminLeadDetailPage() {
  const { id = '' } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const dash = useDashboard()
  const q = useQuery({ queryKey: ['sales-leads', 'detail', id], queryFn: () => getSalesLead(id), refetchInterval: q => q.state.data?.lead.sync_state === 'pending' ? 2000 : REFRESH_MS })
  const refresh = () => qc.invalidateQueries({ queryKey: ['sales-leads'] })
  const [draft, setDraft] = useState<Record<string, string> | null>(null)
  const draftRevision = useRef<number | null>(null)
  const [nextFu, setNextFu] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [, navigate] = useLocation()

  const save = useMutation({
    mutationFn: (p: Parameters<typeof updateSalesLead>[1]) => updateSalesLead(id, p),
    onSuccess: () => { toast.success('Saved'); setDraft(null); setEditing(false); draftRevision.current = null; setNextFu(null); refresh() },
    onError: (e) => toast.error(errMsg(e)),
  })
  const convert = useMutation({ mutationFn: () => convertSalesLead(id), onSuccess: (r) => navigate(r.enrollmentUrl), onError: (e) => toast.error(errMsg(e)) })
  const retry = useMutation({ mutationFn: () => retrySalesSync(id), onSuccess: () => { toast.success('Sync retry queued'); refresh() }, onError: (e) => toast.error(errMsg(e)) })
  const evidence = useMutation({
    mutationFn: (aid: string) => downloadTermsEvidence(aid),
    onSuccess: (data, aid) => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
      const a = document.createElement('a'); a.href = url; a.download = `terms-acceptance-${aid}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
    },
    onError: (e) => toast.error(errMsg(e)),
  })

  if (q.isLoading) return <Skeleton rows={8} />
  if (q.isError || !q.data) return <ErrorBox error={q.error} retry={() => q.refetch()} />
  const { lead, contact_url, jobs } = q.data
  const acceptances = q.data.terms_acceptances ?? []
  const team = dash.data?.team ?? []
  const superAdmin = dash.data?.super_admin === true
  const tz = lead.timezone
  const v = (k: string, server: string) => draft?.[k] ?? server
  const setV = (k: string, val: string) => {
    if (!draft) draftRevision.current = lead.revision
    setDraft({ ...(draft ?? {}), [k]: val })
  }
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
          <Link href={`/admin/leads/inbox?lead=${encodeURIComponent(id)}`} className={btn2} data-testid="link-inbox">Open in Inbox</Link>
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4 break-words">
          <LeadWorkspace leadId={id} detail={q.data} superAdmin={superAdmin} />
        </div>

        <aside className="min-w-0 space-y-6 break-words">
          <section className={card + ' space-y-3'} data-testid="section-contact">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">Contact</h2>
              {!editing && <button className={btn2 + ' px-3 py-1'} onClick={() => setEditing(true)} data-testid="button-edit-contact">Edit</button>}
            </div>
            {!editing ? (
              <dl className="space-y-2 text-sm">
                {([['Name', `${lead.first_name} ${lead.last_name}`.trim() || '—'], ['Practice', lead.practice_name || '—'],
                  ['Phone', lead.phone ? <a className="hover:underline" href={`tel:${lead.phone}`}>{lead.phone}</a> : '—'],
                  ['Email', lead.email ? <a className="break-all hover:underline" href={`mailto:${lead.email}`}>{lead.email}</a> : '—'],
                  ['Time zone', lead.timezone ? `${lead.timezone}${lead.timezone_confirmed_at ? '' : ' (not confirmed)'}` : 'Not set'],
                  ['Texts allowed', lead.dnd ? 'No — do not contact' : lead.consent ? 'Yes' : 'No consent yet']] as const).map(([k, val]) => (
                  <div key={k} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2"><dt className="text-muted-foreground">{k}</dt><dd className="min-w-0 break-words" data-testid={`text-contact-${k.toLowerCase().replace(/\s+/g, '-')}`}>{val}</dd></div>
                ))}
              </dl>
            ) : (
              <>
                {([['firstName', 'First name', lead.first_name], ['lastName', 'Last name', lead.last_name], ['email', 'Email', lead.email], ['phone', 'Phone', lead.phone], ['practiceName', 'Practice', lead.practice_name], ['timezone', 'Time zone (e.g. America/New_York)', lead.timezone ?? '']] as const).map(([k, l, s]) => (
                  <Field key={k} label={l} hint={k === 'timezone' ? (lead.timezone_confirmed_at ? `Confirmed ${fmt(lead.timezone_confirmed_at, tz)}` : `Origin: ${lead.timezone_origin ?? 'unknown'}, not confirmed`) : undefined}>
                    <input className={inp} value={v(k, s)} onChange={(e) => setV(k, e.target.value)} data-testid={`input-${k}`} /></Field>
                ))}
                <Field label="Consent evidence"><textarea rows={2} className={inp} value={v('consentEvidence', '')} placeholder={lead.consent ? 'Consent on file. Add evidence to update.' : 'Describe how consent was given'} onChange={(e) => setV('consentEvidence', e.target.value)} data-testid="input-consent" /></Field>
                <div className="flex gap-2">
                  <button className={btn} disabled={!dirty || save.isPending} onClick={saveContact} data-testid="button-save-contact">{save.isPending ? 'Saving...' : 'Save'}</button>
                  <button className={btn2} onClick={() => { setDraft(null); draftRevision.current = null; setEditing(false) }} data-testid="button-discard">Cancel</button>
                </div>
              </>
            )}
          </section>

          <section className={card + ' space-y-3'} data-testid="section-terms-acceptances">
            <h2 className="font-semibold">Terms acceptance history</h2>
            {acceptances.length === 0 ? <p className="text-sm text-muted-foreground">No Terms acceptance recorded for this lead. This does not mean the lead declined; it may predate the Terms checkbox.</p> : acceptances.map((t) => (
              <div key={t.id} className="space-y-1 rounded-md border border-border p-2 text-sm" data-testid={`terms-acceptance-${t.id}`}>
                <p className="font-medium">{t.label} · {fmt(t.accepted_at, tz)}</p>
                <p className="text-xs text-muted-foreground">Source: {t.source_path}</p>
                <p className="text-xs text-muted-foreground">Submitted identity (unverified): {t.submitted_identity.firstName} {t.submitted_identity.lastName} · {t.submitted_identity.email} · {t.submitted_identity.phone}{t.submitted_identity.practiceName ? ` · ${t.submitted_identity.practiceName}` : ''}</p>
                <p className="text-xs text-muted-foreground">Checkbox: {t.checkbox_wording}</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Link href={`/terms/${t.version_id}`} className={btn2 + ' px-3 py-1'}>Archived document</Link>
                  <button className={btn2 + ' px-3 py-1'} disabled={evidence.isPending} onClick={() => evidence.mutate(t.id)} data-testid={`button-download-evidence-${t.id}`}>Download evidence</button>
                </div>
              </div>
            ))}
          </section>
          <MarketingActivityPanel leadId={id} tz={tz} />
          <section className={card + ' space-y-3'} data-testid="section-owner">
            <h2 className="font-semibold">Owner and stage</h2>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Owner"><select className={inp} value={lead.assignee_id ?? ''} disabled={save.isPending} onChange={(e) => save.mutate({ revision: lead.revision, assigneeId: e.target.value || null })} data-testid="select-assignee">
                <option value="">Unassigned</option>{team.filter((t) => t.active || t.id === lead.assignee_id).map((t) => <option key={t.id} value={t.id}>{t.name || t.email}</option>)}</select></Field>
              <Field label="Stage"><select className={inp} value={lead.stage} disabled={save.isPending} onChange={(e) => save.mutate({ revision: lead.revision, stage: e.target.value as SalesStage })} data-testid="select-stage">
                {SALES_STAGES.map((s) => <option key={s}>{s}</option>)}</select></Field>
            </div>
            <Field label="Next follow-up" hint={lead.next_followup_at ? `Now: ${fmt(lead.next_followup_at, tz)}` : 'None set'}>
              <div className="flex gap-2"><input type="datetime-local" className={inp} value={nextFu ?? ''} onChange={(e) => setNextFu(e.target.value)} data-testid="input-next-followup" />
                <button className={btn2} disabled={nextFu === null || save.isPending} onClick={() => save.mutate({ revision: lead.revision, nextFollowupAt: nextFu ? localToIso(nextFu)! : null })} data-testid="button-save-followup">Set</button>
                {lead.next_followup_at && <button className={btn2} onClick={() => save.mutate({ revision: lead.revision, nextFollowupAt: null })} data-testid="button-clear-followup">Clear</button>}</div></Field>
            <details className="border-t border-border pt-2 text-xs" data-testid="section-sync">
              <summary className="cursor-pointer text-muted-foreground">GoHighLevel sync: <Pill>{lead.sync_state}</Pill>{jobs.some((j) => j.last_error) && <span className="ml-1 text-destructive">· has errors</span>}</summary>
              <div className="mt-2 space-y-1">
                <p className="text-muted-foreground">Contact ID: {lead.ghl_contact_id ?? 'not linked'} · Updated {fmt(lead.updated_at, tz)}</p>
                {jobs.length === 0 ? <p className="text-muted-foreground">No background jobs.</p> : jobs.map((j) => (
                  <div key={j.id} className="rounded-md bg-muted/50 p-2"><span className="font-medium">{j.kind}</span> · {j.state} · {j.attempts} attempt{j.attempts === 1 ? '' : 's'} · due {fmt(j.due_at, tz)}{j.last_error && <p className="text-destructive">{j.last_error}</p>}</div>
                ))}
              </div>
            </details>
          </section>
        </aside>
      </div>
    </div>
  )
}
