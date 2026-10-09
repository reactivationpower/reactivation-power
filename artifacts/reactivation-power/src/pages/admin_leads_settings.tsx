import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { salesCadencePreview, saveSalesReplyPreference, saveSalesSettings, verifySalesCapabilities } from '@/app/actions/sales-leads'
import { Banner, ErrorBox, Field, LeadsTabs, Pill, Skeleton, btn, btn2, card, errMsg, fmt, inp, useDashboard, viewerTz } from '@/components/leads/ui'

export default function AdminLeadsSettingsPage() {
  const qc = useQueryClient()
  const q = useDashboard()
  const done = (m: string) => { toast.success(m); setDraft({}); qc.invalidateQueries({ queryKey: ['sales-leads'] }) }
  const [draft, setDraft] = useState<{ assignee?: string; template?: string; days?: string }>({})
  const [tz, setTz] = useState(viewerTz)
  const save = useMutation({ mutationFn: saveSalesSettings, onSuccess: () => done('Settings saved'), onError: (e) => toast.error(errMsg(e)) })
  const reply = useMutation({ mutationFn: saveSalesReplyPreference, onSuccess: () => done('Preference saved'), onError: (e) => toast.error(errMsg(e)) })
  const verify = useMutation({ mutationFn: verifySalesCapabilities, onSuccess: () => done('Capabilities checked'), onError: (e) => toast.error(errMsg(e)) })
  const preview = useQuery({ queryKey: ['sales-leads', 'cadence', tz], queryFn: () => salesCadencePreview(tz), retry: false, enabled: !!q.data })

  if (q.isLoading) return <div className="space-y-6"><h1 className="text-2xl font-semibold">Leads</h1><Skeleton rows={6} /></div>
  if (q.isError || !q.data) return <ErrorBox error={q.error} retry={() => q.refetch()} />
  const { settings: s, team, super_admin, reply_notifications } = q.data
  const ro = !super_admin
  const days = draft.days ?? s.later_days.join(', ')
  const parsedDays = days.split(',').map((x) => x.trim()).filter(Boolean).map(Number)
  const daysOk = parsedDays.length > 0 && parsedDays.every((n) => Number.isInteger(n) && n > 0)
  const dirty = draft.assignee !== undefined || draft.template !== undefined || draft.days !== undefined
  const caps = Object.entries(s.capabilities)
  const wake = s.capabilities.scheduler_wake
  const wakeAt = Date.parse(wake?.checkedAt ?? '')
  const schedulerReady = wake?.state === 'verified' && Number.isFinite(wakeAt) && wakeAt <= Date.now() && Date.now() - wakeAt < 10 * 60_000
  const failing = caps.filter(([k, c]) => ['contacts', 'conversations', 'messages', 'notes', 'appointments', 'sms_write'].includes(k) && !['ok', 'verified', 'passed', 'operator_confirmed'].includes(c.state))

  return (
    <div className="space-y-6">
      <header><h1 className="text-2xl font-semibold">Leads</h1><p className="mt-1 text-sm text-muted-foreground">Settings for the provider sales pipeline.</p></header>
      <LeadsTabs />
      {ro && <Banner kind="info">Only super admins can change these settings. You can still set your own reply notification preference.</Banner>}
      {!s.default_assignee_id && <Banner kind="warn">A default assignee is required. Until one is set, new leads are unassigned and automation cannot be enabled.</Banner>}
      <section className={card + ' space-y-2'} data-testid="section-scheduler">
        <h2 className="font-semibold">Five-minute scheduler</h2>
        <p className="text-sm">{s.capabilities.native_scheduler?.requirement ?? 'External wake schedule not configured. In-process timers alone do not wake an idle autoscaled app.'}</p>
        <p className="text-sm">{wake?.requirement ?? 'A healthy scheduled production wake is required before SMS automation can be enabled.'}</p>
        <p className="text-xs text-muted-foreground">Last healthy wake: {fmt(wake?.checkedAt)} · {schedulerReady ? 'healthy' : 'pending or stale'}</p>
        {!schedulerReady && <Banner kind="warn">Automation stays off until the published worker receives a healthy scheduled wake. Configuring the job does not publish the app or send texts.</Banner>}
      </section>

      <section className={card + ' space-y-3'} data-testid="section-assignee">
        <h2 className="font-semibold">Default assignee</h2>
        <div className="flex flex-wrap gap-2">
          <select className={inp + ' max-w-sm'} disabled={ro} value={draft.assignee ?? s.default_assignee_id ?? ''} onChange={(e) => setDraft({ ...draft, assignee: e.target.value })} data-testid="select-default-assignee">
            <option value="">Not set</option>{team.filter((t) => t.active).map((t) => <option key={t.id} value={t.id}>{t.name || t.email}</option>)}
          </select>
          <button className={btn} disabled={ro || !draft.assignee || save.isPending} onClick={() => save.mutate({ defaultAssigneeId: draft.assignee })} data-testid="button-save-assignee">Save assignee</button>
        </div>
      </section>

      <section className={card + ' space-y-3'} data-testid="section-capabilities">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="font-semibold">Admin scope and capability checks</h2><p className="text-xs text-muted-foreground">Last checked {fmt(s.capabilities_checked_at)}</p></div>
          <button className={btn2} disabled={ro || verify.isPending} onClick={() => verify.mutate()} data-testid="button-verify">{verify.isPending ? 'Checking...' : 'Run checks'}</button>
        </div>
        {caps.length === 0 ? <p className="text-sm text-muted-foreground">No capability results yet. Run checks.</p> : (
          <ul className="divide-y divide-border">{caps.map(([k, c]) => (
            <li key={k} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm" data-testid={`cap-${k}`}><div><p className="font-medium">{k}</p><p className="text-xs text-muted-foreground">{c.requirement}</p></div><Pill tone={['ok', 'verified', 'passed'].includes(c.state) ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive'}>{c.state}</Pill></li>
          ))}</ul>
        )}
        {failing.length > 0 && <Banner kind="warn">{failing.length} capability check{failing.length === 1 ? '' : 's'} not passing. Automation should stay off.</Banner>}
        {s.capabilities.sms_write?.state === 'review_required' && <div className="space-y-2 rounded-md border border-border p-3 text-sm">
          <p>Read-only checks cannot prove SMS send permission or sender readiness. In the existing GoHighLevel location, verify <strong>conversations/message.write</strong>, an SMS-enabled sender, and required A2P/consent configuration. This app does not change existing GoHighLevel workflows. Review overlapping outreach workflows before enabling this plan.</p>
          <button className={btn2} disabled={ro || save.isPending} onClick={() => {
            if (window.confirm('Have you verified the SMS permission, sender/A2P configuration, and absence of overlapping outreach workflows in GoHighLevel? No test SMS has been sent by this app.')) save.mutate({ confirmSmsConfiguration: true })
          }}>Confirm provider SMS configuration</button>
        </div>}
        <div className="flex items-center justify-between rounded-md bg-muted/50 p-3 text-sm">
          <span>Scope reviewed: {s.scope_reviewed_at ? fmt(s.scope_reviewed_at) : 'not reviewed'}</span>
          <button className={btn2} disabled={ro || save.isPending} onClick={() => save.mutate({ reviewScope: true })} data-testid="button-review-scope">Mark scope reviewed</button>
        </div>
      </section>

      <section className={card + ' space-y-3'}>
        <h2 className="font-semibold">Reply notifications</h2>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={reply_notifications} disabled={reply.isPending} onChange={(e) => reply.mutate(e.target.checked)} data-testid="checkbox-reply-notifications" />Notify me when a lead replies</label>
      </section>

      <section className={card + ' space-y-3'} data-testid="section-template">
        <div className="flex items-center justify-between"><h2 className="font-semibold">Template and cadence</h2><Pill>{s.approved_at ? `Approved ${fmt(s.approved_at)}` : 'Not approved'}</Pill></div>
        <Field label="Message template"><textarea rows={4} className={inp} disabled={ro} value={draft.template ?? s.template} onChange={(e) => setDraft({ ...draft, template: e.target.value })} data-testid="input-template" /></Field>
        <Field label="Later follow-up days (comma separated)" hint="Days after first touch."><input className={inp} disabled={ro} value={days} onChange={(e) => setDraft({ ...draft, days: e.target.value })} data-testid="input-later-days" /></Field>
        <div className="flex flex-wrap gap-2">
          <button className={btn} disabled={ro || !dirty || !daysOk || save.isPending} data-testid="button-save-template"
            onClick={() => save.mutate({ ...(draft.template !== undefined && { template: draft.template }), ...(draft.days !== undefined && { laterDays: parsedDays }) })}>Save template</button>
          <button className={btn2} disabled={ro || dirty || !s.template || save.isPending} onClick={() => save.mutate({ approveTemplate: true })} data-testid="button-approve-template" title={dirty ? 'Save changes before approving' : undefined}>Approve saved template</button>
        </div>
        {!daysOk && <p className="text-xs text-destructive">Enter positive whole numbers separated by commas.</p>}
        <div className="border-t border-border pt-3">
          <Field label="Preview timezone (IANA)"><input className={inp + ' max-w-sm'} value={tz} onChange={(e) => setTz(e.target.value)} data-testid="input-preview-tz" /></Field>
          <p className="mt-2 text-xs text-muted-foreground">Preview only. Nothing is sent.</p>
          {preview.isLoading ? <Skeleton rows={2} /> : preview.isError ? <p className="text-sm text-destructive">{errMsg(preview.error)}</p> : (
            <ul className="mt-2 space-y-1 text-sm" data-testid="list-cadence">{(preview.data ?? []).map((p, i) => <li key={i}>Day {p.day} · {p.kind} · {fmt(p.dueAt, tz)}</li>)}</ul>
          )}
        </div>
      </section>

      <section className={card + ' space-y-3'} data-testid="section-automation">
        <div className="flex items-center justify-between"><h2 className="font-semibold">Automation</h2><Pill tone={s.automation_enabled ? 'bg-success/15 text-success' : undefined}>{s.automation_enabled ? 'On' : 'Off'}</Pill></div>
        <p className="text-sm text-muted-foreground">Off by default. Enabling requires a default assignee, passing read checks, confirmed provider SMS configuration, reviewed scope and an approved template. Only eligible website leads submitted after enabling enter this plan; historical and manually entered leads remain manual-only. Manual scheduling never restarts it.</p>
        <button className={s.automation_enabled ? btn2 : btn} disabled={ro || save.isPending || (!s.automation_enabled && (!schedulerReady || !s.default_assignee_id || !s.approved_at || !s.scope_reviewed_at || failing.length > 0 || caps.length === 0))}
          onClick={() => save.mutate({ enableAutomation: !s.automation_enabled })} data-testid="button-toggle-automation">{s.automation_enabled ? 'Turn automation off' : 'Enable automation'}</button>
      </section>
    </div>
  )
}
