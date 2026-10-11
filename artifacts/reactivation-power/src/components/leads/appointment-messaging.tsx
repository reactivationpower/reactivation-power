import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { action } from '@/lib/api'
import { toast } from 'sonner'
import { Banner, ErrorBox, Field, Skeleton, btn, btn2, card, errMsg, fmt, inp } from './ui'

type Host = { ghl_user_id: string; admin_id: string; name: string; reply_email: string; active: boolean }
export type Messaging = {
  config: { enabled: boolean; sms_enabled?: boolean }; hosts: Host[]; superAdmin: boolean; schedulerReady: boolean;
  team: { id: string; name: string | null; email: string }[];
  deliveries: { id: string; first_name: string; last_name: string; kind: string; channel: string; state: string; email_status: string | null; due_at: string; last_error: string | null }[];
  issues: { appointment_id: string; first_name: string; last_name: string; last_error: string }[];
}
export const loadAppointmentMessaging = action<Messaging>('appointment-messages', 'getAppointmentMessaging')
export const saveAppointmentMessaging = action<void>('appointment-messages', 'saveAppointmentMessaging')
const saveHost = action<void>('appointment-messages', 'saveAppointmentHost')
const empty = { ghlUserId: '', adminId: '', name: '', replyEmail: '', active: true }

/** Advanced: who hosts the calls, and the recent reminder log. The on/off switches live in QuickSwitches. */
export function AppointmentMessaging() {
  const qc = useQueryClient()
  const [draft, setDraft] = useState(empty)
  const query = useQuery({ queryKey: ['appointment-messaging'], queryFn: () => loadAppointmentMessaging(), refetchInterval: 20_000 })
  const host = useMutation({ mutationFn: () => saveHost(draft), onError: e => toast.error(errMsg(e)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['appointment-messaging'] }); toast.success('Host saved'); setDraft(empty) } })
  if (query.isLoading) return <Skeleton rows={3} />
  if (!query.data || query.isError) return <ErrorBox error={query.error} retry={() => query.refetch()} />
  const data = query.data
  return <section className={card + ' space-y-4'} data-testid="appointment-messaging">
    <h2 className="font-semibold">Who hosts the calls</h2>
    <p className="text-sm text-muted-foreground">Reminders use the host's name. Changing a host turns reminders off. Turn them back on at the top.</p>
    {data.hosts.length === 0 && <Banner kind="warn">No hosts yet. Reminders can't turn on until you add one.</Banner>}
    <ul className="space-y-2">{data.hosts.map(h => <li key={h.ghl_user_id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm">
      <span>{h.name} · {h.reply_email} · {h.active ? 'Active' : 'Inactive'}</span>
      {data.superAdmin && <button type="button" className={btn2} onClick={() => setDraft({ ghlUserId: h.ghl_user_id, adminId: h.admin_id, name: h.name, replyEmail: h.reply_email, active: h.active })}>Edit</button>}
    </li>)}</ul>
    {data.superAdmin && <form className="grid gap-3 md:grid-cols-2" onSubmit={e => { e.preventDefault(); host.mutate() }}>
      <Field label="Staff account"><select required className={inp} value={draft.adminId} onChange={e => setDraft({ ...draft, adminId: e.target.value })}><option value="">Choose salesperson</option>{data.team.map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}</select></Field>
      <Field label="GHL user ID" hint="The calendar host in GoHighLevel."><input required className={inp} value={draft.ghlUserId} onChange={e => setDraft({ ...draft, ghlUserId: e.target.value })} /></Field>
      <Field label="Name used in messages"><input required maxLength={70} className={inp} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></Field>
      <Field label="Host's email"><input type="email" required className={inp} value={draft.replyEmail} onChange={e => setDraft({ ...draft, replyEmail: e.target.value })} /></Field>
      <label className="text-sm"><input type="checkbox" checked={draft.active} onChange={e => setDraft({ ...draft, active: e.target.checked })} /> Active</label>
      <div className="flex gap-2"><button className={btn} disabled={host.isPending}>Save host</button><button type="button" className={btn2} onClick={() => setDraft(empty)}>Clear</button></div>
    </form>}
    <h3 className="font-medium">Recent reminders</h3>
    <p className="text-xs text-muted-foreground">"Sent" means it left our system. Failed ones are not sent again on their own.</p>
    {data.issues.map(a => <Banner key={a.appointment_id} kind="warn">{a.first_name} {a.last_name}: {a.last_error}</Banner>)}
    {!data.deliveries.length ? <p className="text-sm text-muted-foreground">No reminders yet.</p> :
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Contact</th><th>Message</th><th>Scheduled</th><th>Status</th></tr></thead><tbody>{data.deliveries.map(d => <tr key={d.id} className="border-t"><td className="py-2 pr-3">{d.first_name} {d.last_name}</td><td className="pr-3">{d.kind.replaceAll('_',' ')} · {d.channel}</td><td className="pr-3">{fmt(d.due_at)}</td><td>{d.state}{d.email_status ? ` · email: ${d.email_status}` : ''}{d.last_error && <p className="text-xs text-muted-foreground">{d.last_error}</p>}</td></tr>)}</tbody></table></div>}
  </section>
}
