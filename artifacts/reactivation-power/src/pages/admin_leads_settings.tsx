import { useState } from 'react'
import { Link } from 'wouter'
import { AppointmentMessaging } from '@/components/leads/appointment-messaging'
import { QuickSwitches } from '@/components/leads/quick-switches'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { salesCadencePreview, saveSalesSettings, verifySalesCapabilities } from '@/app/actions/sales-leads'
import { salesAutomationRequirements, schedulerHealthy, SALES_AUTOMATION_GHL_CHECKS } from '@workspace/shared/sales-automation'
import { Banner, ErrorBox, Field, LeadsTabs, Pill, Skeleton, btn, btn2, card, errMsg, fmt, inp, useDashboard, viewerTz } from '@/components/leads/ui'

const TEXT_LABELS = ['Text 1 — day 1', 'Text 2 — day 2', 'Text 3 — day 3', 'Text 4 — about day 7', 'Text 5 — about day 14', 'Text 6 — about day 28 (last text)']

export default function AdminLeadsSettingsPage() {
  const qc = useQueryClient()
  const q = useDashboard()
  const done = (m: string) => { toast.success(m); setDraft({}); qc.invalidateQueries({ queryKey: ['sales-leads'] }) }
  const [draft, setDraft] = useState<{ assignee?: string; texts?: string[]; days?: string }>({})
  const [tz, setTz] = useState(viewerTz)
  const save = useMutation({ mutationFn: saveSalesSettings, onSuccess: () => done('Settings saved'), onError: (e) => toast.error(errMsg(e)) })
  const toggle = useMutation({ mutationFn: (input: { enableAutomation: boolean }) => saveSalesSettings(input), onSuccess: () => done('Settings saved') })
  const verify = useMutation({ mutationFn: verifySalesCapabilities, onSuccess: () => done('Capabilities checked'), onError: (e) => toast.error(errMsg(e)) })
  const preview = useQuery({ queryKey: ['sales-leads', 'cadence', tz], queryFn: () => salesCadencePreview(tz), retry: false, enabled: !!q.data })

  if (q.isLoading) return <div className="space-y-6"><h1 className="text-2xl font-semibold">Leads</h1><Skeleton rows={6} /></div>
  if (q.isError || !q.data) return <ErrorBox error={q.error} retry={() => q.refetch()} />
  const { settings: s, team, super_admin } = q.data
  const ro = !super_admin
  const days = draft.days ?? s.later_days.join(', ')
  const texts = draft.texts ?? s.followup_texts
  const parsedDays = days.split(',').map((x) => x.trim()).filter(Boolean).map(Number)
  const daysOk = parsedDays.length > 0 && parsedDays.every((n) => Number.isInteger(n) && n > 0)
  const dirty = draft.assignee !== undefined || draft.texts !== undefined || draft.days !== undefined
  const caps = Object.entries(s.capabilities)
  const wake = s.capabilities.scheduler_wake
  const schedulerReady = schedulerHealthy(s.capabilities)
  const requirements = salesAutomationRequirements(s)
  const ready = requirements.every((r) => r.ok)
  const failing = requirements.filter((r) => !r.ok && (r.key === 'sms_write' || (SALES_AUTOMATION_GHL_CHECKS as readonly string[]).includes(r.key)))
  const busy = save.isPending || toggle.isPending

  return (
    <div className="space-y-6">
      <header><h1 className="text-2xl font-semibold">Leads</h1><p className="mt-1 text-sm text-muted-foreground">Turn things on or off.</p></header>
      <LeadsTabs />
      <QuickSwitches />
      {super_admin && <section className={card + ' flex flex-wrap items-center justify-between gap-2'} data-testid="section-terms-link"><div><h2 className="font-semibold">Terms of Service</h2><p className="text-sm text-muted-foreground">Manage the terms checkbox on marketing lead forms.</p></div><Link href="/admin/leads/terms" className={btn2} data-testid="link-terms-admin">Manage terms</Link></section>}
      <details className="group space-y-4" data-testid="section-advanced">
        <summary className="cursor-pointer select-none text-sm font-medium text-muted-foreground hover:text-foreground">Advanced</summary>
        <div className="mt-4 space-y-6">
      {ro && <Banner kind="info">Only super admins can change these settings.</Banner>}
      <AppointmentMessaging />
      <section className={card + ' space-y-2'} data-testid="section-scheduler">
        <h2 className="font-semibold">Scheduler</h2>
        <p className="text-sm">Reminders and automatic texts only go out while the published app is running.</p>
        <p className="text-xs text-muted-foreground">Last check-in: {fmt(wake?.checkedAt)} · {schedulerReady ? 'Running' : 'Not running'}</p>
      </section>

      <section className={card + ' space-y-3'} data-testid="section-assignee">
        <h2 className="font-semibold">Default assignee</h2>
        <p className="text-sm text-muted-foreground">Who gets new leads.</p>
        {!s.default_assignee_id && <Banner kind="warn">Not set. New leads stay unassigned.</Banner>}
        <div className="flex flex-wrap gap-2">
          <select className={inp + ' max-w-sm'} disabled={ro} value={draft.assignee ?? s.default_assignee_id ?? ''} onChange={(e) => setDraft({ ...draft, assignee: e.target.value })} data-testid="select-default-assignee">
            <option value="">Not set</option>{team.filter((t) => t.active).map((t) => <option key={t.id} value={t.id}>{t.name || t.email}</option>)}
          </select>
          <button className={btn} disabled={ro || !draft.assignee || save.isPending} onClick={() => save.mutate({ defaultAssigneeId: draft.assignee })} data-testid="button-save-assignee">Save assignee</button>
        </div>
      </section>

      <section className={card + ' space-y-3'} data-testid="section-capabilities">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="font-semibold">GoHighLevel checks</h2><p className="text-xs text-muted-foreground">Last checked {fmt(s.capabilities_checked_at)}</p></div>
          <button className={btn2} disabled={ro || verify.isPending} onClick={() => verify.mutate()} data-testid="button-verify">{verify.isPending ? 'Checking...' : 'Run checks'}</button>
        </div>
        {caps.length === 0 ? <p className="text-sm text-muted-foreground">No capability results yet. Run checks.</p> : (
          <ul className="divide-y divide-border">{caps.map(([k, c]) => (
            <li key={k} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm" data-testid={`cap-${k}`}><div><p className="font-medium">{k}</p><p className="text-xs text-muted-foreground">{c.requirement}</p></div><Pill tone={['ok', 'verified', 'passed'].includes(c.state) ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive'}>{c.state}</Pill></li>
          ))}</ul>
        )}
        {failing.length > 0 && <Banner kind="warn">{failing.length} capability check{failing.length === 1 ? '' : 's'} not passing. Keep automatic texts off.</Banner>}
        {s.capabilities.sms_write?.state === 'review_required' && <div className="space-y-2 rounded-md border border-border p-3 text-sm">
          <p>Your GoHighLevel number must be approved for texting.</p>
          <button className={btn2} disabled={ro || save.isPending} onClick={() => {
            if (window.confirm('Is your GoHighLevel number approved for texting?')) save.mutate({ confirmSmsConfiguration: true })
          }}>Yes, it's approved</button>
        </div>}
        <div className="flex items-center justify-between rounded-md bg-muted/50 p-3 text-sm">
          <span>Scope reviewed: {s.scope_reviewed_at ? fmt(s.scope_reviewed_at) : 'not reviewed'}</span>
          <button className={btn2} disabled={ro || save.isPending} onClick={() => save.mutate({ reviewScope: true })} data-testid="button-review-scope">Mark scope reviewed</button>
        </div>
      </section>

      <section className={card + ' space-y-3'} data-testid="section-template">
        <div className="flex items-center justify-between"><h2 className="font-semibold">Unbooked-lead texts and schedule</h2><Pill>{s.approved_at ? `Approved ${fmt(s.approved_at)}` : 'Not approved'}</Pill></div>
        <p className="text-sm text-muted-foreground">Up to 6 texts, sent in order. Text 6 is always the last one. {'{firstName}'} and {'{practiceName}'} are filled in for each lead.</p>
        {texts.map((t, i) => (
          <Field key={i} label={TEXT_LABELS[i]!}><textarea rows={3} className={inp} disabled={ro} value={t}
            onChange={(e) => setDraft({ ...draft, texts: texts.map((x, j) => j === i ? e.target.value : x) })} data-testid={`input-followup-text-${i + 1}`} /></Field>
        ))}
        <Field label="Later follow-up days (comma separated)" hint="Days after first touch."><input className={inp} disabled={ro} value={days} onChange={(e) => setDraft({ ...draft, days: e.target.value })} data-testid="input-later-days" /></Field>
        <div className="flex flex-wrap gap-2">
          <button className={btn} disabled={ro || !dirty || !daysOk || texts.some((t) => !t.includes('STOP')) || save.isPending} data-testid="button-save-template"
            onClick={() => save.mutate({ ...(draft.texts !== undefined && { followupTexts: draft.texts }), ...(draft.days !== undefined && { laterDays: parsedDays }) })}>Save texts</button>
          <button className={btn2} disabled={ro || dirty || save.isPending} onClick={() => save.mutate({ approveTemplate: true })} data-testid="button-approve-template" title={dirty ? 'Save changes before approving' : undefined}>Approve saved texts</button>
        </div>
        {!daysOk && <p className="text-xs text-destructive">Enter positive whole numbers separated by commas.</p>}
        {texts.some((t) => !t.includes('STOP')) && <p className="text-xs text-destructive">Every text needs "STOP" so leads can opt out.</p>}
        <div className="border-t border-border pt-3">
          <Field label="Preview timezone (IANA)"><input className={inp + ' max-w-sm'} value={tz} onChange={(e) => setTz(e.target.value)} data-testid="input-preview-tz" /></Field>
          <p className="mt-2 text-xs text-muted-foreground">Preview only. Nothing is sent.</p>
          {preview.isLoading ? <Skeleton rows={2} /> : preview.isError ? <p className="text-sm text-destructive">{errMsg(preview.error)}</p> : (
            <ul className="mt-2 space-y-1 text-sm" data-testid="list-cadence">{(preview.data ?? []).map((p, i) => <li key={i}>Day {p.day} · {p.kind === 'sms' ? `Text ${p.textNumber ?? ''}`.trim() : 'Call reminder'} · {fmt(p.dueAt, tz)}</li>)}</ul>
          )}
        </div>
      </section>

      <section className={card + ' space-y-3'} data-testid="section-automation">
        <div className="flex items-center justify-between"><h2 className="font-semibold">Automatic texts to unbooked leads</h2><Pill tone={s.automation_enabled ? 'bg-success/15 text-success' : undefined}>{s.automation_enabled ? 'On' : 'Off'}</Pill></div>
        <p className="text-sm text-muted-foreground">Texts new website leads who haven't booked. Needs an assignee, passing checks and an approved text. Older leads are not included.</p>
        <button className={s.automation_enabled ? btn2 : btn} disabled={ro || busy || (!s.automation_enabled && !ready)}
          onClick={() => toggle.mutate({ enableAutomation: !s.automation_enabled })} data-testid="button-toggle-automation">{s.automation_enabled ? 'Turn automation off' : 'Enable automation'}</button>
        {toggle.isError && <Banner kind="error"><span data-testid="automation-error">{errMsg(toggle.error)}</span></Banner>}
        {!s.automation_enabled && <AutomationChecklist items={requirements} />}
      </section>
        </div>
      </details>
    </div>
  )
}

function AutomationChecklist({ items }: { items: ReturnType<typeof salesAutomationRequirements> }) {
  const left = items.filter((r) => !r.ok).length
  return (
    <div className="space-y-2 border-t border-border pt-3" data-testid="automation-checklist">
      <p className="text-sm font-medium">{left === 0 ? 'Everything is ready.' : `${left} step${left === 1 ? '' : 's'} left before you can turn this on:`}</p>
      <ul className="space-y-1.5 text-sm">{items.map((r) => (
        <li key={r.key} className="flex items-start gap-2" data-testid={`automation-req-${r.key}`} data-ok={r.ok ? 'true' : 'false'}>
          <span aria-hidden className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${r.ok ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive'}`}>{r.ok ? '✓' : '✕'}</span>
          <div><p><span className="sr-only">{r.ok ? 'Done: ' : 'Not done: '}</span>{r.label}</p>{!r.ok && <p className="text-xs text-muted-foreground">{r.fix}</p>}</div>
        </li>
      ))}</ul>
    </div>
  )
}
