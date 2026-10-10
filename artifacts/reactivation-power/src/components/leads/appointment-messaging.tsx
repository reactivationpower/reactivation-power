import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { action } from '@/lib/api'
import { toast } from 'sonner'
import { Banner, ErrorBox, Field, Pill, Skeleton, btn, btn2, card, errMsg, fmt, inp } from './ui'

type Host = { ghl_user_id: string; admin_id: string; name: string; reply_email: string; active: boolean }
type Messaging = {
  config: { enabled: boolean }; hosts: Host[]; superAdmin: boolean; schedulerReady: boolean;
  team: { id: string; name: string | null; email: string }[];
  deliveries: { id: string; first_name: string; last_name: string; kind: string; channel: string; state: string; email_status: string | null; due_at: string; last_error: string | null }[];
  issues: { appointment_id: string; first_name: string; last_name: string; last_error: string }[];
}
const load = action<Messaging>('appointment-messages', 'getAppointmentMessaging')
const saveHost = action<void>('appointment-messages', 'saveAppointmentHost')
const saveSettings = action<void>('appointment-messages', 'saveAppointmentMessaging')
const empty = { ghlUserId: '', adminId: '', name: '', replyEmail: '', active: true }
export function AppointmentMessaging() {
  const qc = useQueryClient()
  const [draft, setDraft] = useState(empty)
  const [reviewed, setReviewed] = useState(false)
  const query = useQuery({ queryKey: ['appointment-messaging'], queryFn: () => load(), refetchInterval: 20_000 })
  const done = () => { qc.invalidateQueries({ queryKey: ['appointment-messaging'] }); toast.success('Appointment messaging settings saved') }
  const host = useMutation({ mutationFn: () => saveHost(draft), onSuccess: () => { done(); setDraft(empty) }, onError: e => toast.error(errMsg(e)) })
  const settings = useMutation({ mutationFn: (enabled: boolean) => saveSettings({ enabled, confirmReadiness: reviewed }), onSuccess: done, onError: e => toast.error(errMsg(e)) })
  if (query.isLoading) return <Skeleton rows={3} />
  if (!query.data || query.isError) return <ErrorBox error={query.error} retry={() => query.refetch()} />
  const data = query.data
  return <section className={card + ' space-y-4'} data-testid="appointment-messaging">
    <div className="flex items-center justify-between"><h2 className="font-semibold">Strategy-call confirmations and reminders</h2><Pill>{data.config.enabled ? 'On' : 'Off'}</Pill></div>
    <p className="text-sm">Separate from unbooked-lead outreach. Confirmation email + text, 24-hour email + text, and a final text 30 minutes before. Only new website bookings after activation are enrolled; existing appointments are not backfilled.</p>
    <p className="text-sm text-muted-foreground">Texts: 8 AM–8 PM in the recipient’s verified device/staff time zone, including weekends. Nighttime confirmations wait until 8 AM. Missed 24-hour reminders are skipped; texts are spaced at least one hour apart. Emails have no quiet-hour delay. The five-minute worker may send a few minutes after the scheduled time.</p>
    <p className="text-sm">Messages use the actual meeting host’s name, request the 4-minute walkthrough, and ask attendees to join Google Meet from a computer. The final text focuses on joining. Email replies go to the host’s inbox; SMS is blocked unless the GHL conversation is assigned to that host.</p>
    <h3 className="font-medium">Salesperson profiles</h3>
    {data.hosts.length === 0 && <Banner kind="warn">No host profiles yet. Nothing will send until a verified host and reply routing are configured.</Banner>}
    <ul className="space-y-2">{data.hosts.map(h => <li key={h.ghl_user_id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm">
      <span>{h.name} · {h.reply_email} · {h.active ? 'Active' : 'Inactive'}</span>
      {data.superAdmin && <button type="button" className={btn2} onClick={() => setDraft({ ghlUserId: h.ghl_user_id, adminId: h.admin_id, name: h.name, replyEmail: h.reply_email, active: h.active })}>Edit profile</button>}
    </li>)}</ul>
    {data.superAdmin && <>
      <form className="grid gap-3 md:grid-cols-2" onSubmit={e => { e.preventDefault(); host.mutate() }}>
        <Field label="Staff account"><select required className={inp} value={draft.adminId} onChange={e => setDraft({ ...draft, adminId: e.target.value })}><option value="">Choose salesperson</option>{data.team.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}</select></Field>
        <Field label="GHL user ID" hint="Must match the actual calendar host in your GHL location."><input required className={inp} value={draft.ghlUserId} onChange={e => setDraft({ ...draft, ghlUserId: e.target.value })} /></Field>
        <Field label="Name used in messages"><input required maxLength={70} className={inp} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></Field>
        <Field label="Salesperson’s monitored reply email"><input type="email" required className={inp} value={draft.replyEmail} onChange={e => setDraft({ ...draft, replyEmail: e.target.value })} /></Field>
        <label className="text-sm"><input type="checkbox" checked={draft.active} onChange={e => setDraft({ ...draft, active: e.target.checked })} /> Active</label>
        <div className="flex gap-2"><button className={btn} disabled={host.isPending}>Save host profile</button><button type="button" className={btn2} onClick={() => setDraft(empty)}>Clear</button></div>
      </form>
      <p className="text-xs text-muted-foreground">Profile changes pause sending for a fresh readiness review. Deactivate a former salesperson rather than deleting their history. Changing a profile does not reassign appointments.</p>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} /><span>I have verified the email sender and each host’s reply inbox, GHL SMS permission and A2P readiness, host conversation ownership/notifications, and that no overlapping GHL confirmation/reminder workflows are active. Enabling may assign booked contacts to their meeting host.</span></label>
      {!data.schedulerReady && <Banner kind="warn">Activation requires a healthy scheduled wake from the published app. Preview never sends these messages.</Banner>}
      <button className={btn} disabled={settings.isPending || (!data.config.enabled && (!reviewed || !data.schedulerReady || !data.hosts.some(h => h.active)))} onClick={() => {
        if (window.confirm(data.config.enabled ? 'Stop all pending appointment messages? Re-enabling will not restart them.' : 'Enable messages for new website bookings? No historical appointments will be enrolled.')) settings.mutate(!data.config.enabled)
      }}>{data.config.enabled ? 'Disable and cancel pending messages' : 'Enable for new bookings'}</button>
    </>}
    <h3 className="font-medium">Recent message status</h3>
    <p className="text-xs text-muted-foreground">“Sent” means provider acceptance, not inbox/handset delivery. Email delivery updates appear separately. Failed or uncertain messages require review and are not automatically resent.</p>
    {data.issues.map(a => <Banner key={a.appointment_id} kind="warn">{a.first_name} {a.last_name}: {a.last_error}</Banner>)}
    {!data.deliveries.length ? <p className="text-sm text-muted-foreground">No appointment messages scheduled yet.</p> :
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Contact</th><th>Message</th><th>Scheduled</th><th>Status</th></tr></thead><tbody>{data.deliveries.map(d => <tr key={d.id} className="border-t"><td className="py-2 pr-3">{d.first_name} {d.last_name}</td><td className="pr-3">{d.kind.replaceAll('_',' ')} · {d.channel}</td><td className="pr-3">{fmt(d.due_at)}</td><td>{d.state}{d.email_status ? ` · email: ${d.email_status}` : ''}{d.last_error && <p className="text-xs text-muted-foreground">{d.last_error}</p>}</td></tr>)}</tbody></table></div>}
  </section>
}
