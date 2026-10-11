import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getInboxSettings, saveInboxSettings } from '@/app/actions/sales-inbox'
import { saveSalesReplyPreference } from '@/app/actions/sales-leads'
import { ErrorBox, Skeleton, card, errMsg, useDashboard } from './ui'
import { loadAppointmentMessaging, saveAppointmentMessaging } from './appointment-messaging'

function Switch({ id, label, line, on, busy, blocker, onChange }: {
  id: string; label: string; line: string; on: boolean; busy: boolean; blocker?: string | null; onChange: (next: boolean) => void
}) {
  // A blocker only stops turning on. Turning off always works.
  const locked = busy || (!on && !!blocker)
  return <li className="flex items-start justify-between gap-4 py-3">
    <div className="min-w-0">
      <p className="font-medium" id={`${id}-label`}>{label}</p>
      <p className="text-sm text-muted-foreground">{line}</p>
      {blocker && !on && <p className="mt-1 text-sm text-destructive" data-testid={`${id}-blocker`}>{blocker}</p>}
    </div>
    <button type="button" role="switch" aria-checked={on} aria-labelledby={`${id}-label`} disabled={locked}
      onClick={() => onChange(!on)} data-testid={`switch-${id}`}
      className={`relative mt-1 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${on ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  </li>
}

const ask = (on: boolean, offNote = '') => window.confirm(on ? 'Turn this on?' : `Turn this off?${offNote}`)

export function QuickSwitches() {
  const qc = useQueryClient()
  const inbox = useQuery({ queryKey: ['sales-inbox', 'settings'], queryFn: getInboxSettings })
  const meet = useQuery({ queryKey: ['appointment-messaging'], queryFn: () => loadAppointmentMessaging(), refetchInterval: 20_000 })
  const dash = useDashboard()
  const fail = (e: unknown) => toast.error(errMsg(e))
  const texting = useMutation({ mutationFn: (on: boolean) => saveInboxSettings({ smsReady: on }), onError: fail,
    onSuccess: (_, on) => { toast.success(on ? 'Texting is on' : 'Texting is off'); qc.invalidateQueries({ queryKey: ['sales-inbox'] }) } })
  const reminders = useMutation({ mutationFn: (v: { enabled: boolean; smsEnabled: boolean }) => saveAppointmentMessaging({ ...v, confirmReadiness: v.enabled }),
    onError: fail, onSuccess: () => { toast.success('Reminders saved'); qc.invalidateQueries({ queryKey: ['appointment-messaging'] }) } })
  const reply = useMutation({ mutationFn: (on: boolean) => saveSalesReplyPreference(on), onError: fail,
    onSuccess: () => { toast.success('Saved'); qc.invalidateQueries({ queryKey: ['sales-leads'] }) } })

  if (inbox.isLoading || meet.isLoading || dash.isLoading) return <section className={card}><Skeleton rows={4} /></section>
  const err = inbox.isError ? inbox : meet.isError ? meet : dash.isError ? dash : null
  if (err || !inbox.data || !meet.data || !dash.data) return <section className={card}><ErrorBox error={err?.error} retry={() => { inbox.refetch(); meet.refetch(); dash.refetch() }} /></section>

  const m = meet.data
  const owner = inbox.data.superAdmin && m.superAdmin
  const notOwner = owner ? null : 'Only a super admin can change this.'
  const emailsOn = m.config.enabled
  const textsOn = emailsOn && m.config.sms_enabled === true
  const meetingBlocker = notOwner ?? (!m.schedulerReady ? 'Needs the published app running.' : !m.hosts.some(h => h.active) ? 'Add who hosts the calls in Advanced.' : null)
  const busy = texting.isPending || reminders.isPending || reply.isPending

  return <section className={card + ' space-y-3'} data-testid="section-quick-switches">
    <div>
      <h2 className="font-semibold">On / off</h2>
      <p className="text-sm text-muted-foreground">Meeting reminders go out when they book, 1 day before, 12 hours before, 2 hours before, and 5 minutes before, by email and text.</p>
    </div>
    <ul className="divide-y divide-border">
      <Switch id="texting" label="Texting from the portal" line="Send and get texts in each lead's text thread."
        on={inbox.data.settings.sms_ready} busy={busy} blocker={notOwner}
        onChange={on => { if (ask(on)) texting.mutate(on) }} />
      <Switch id="reminder-emails" label="Meeting reminder emails" line="Email reminders for new strategy-call bookings."
        on={emailsOn} busy={busy} blocker={meetingBlocker}
        onChange={on => { if (ask(on, ' Reminder texts stop too, and waiting reminders are cancelled.')) reminders.mutate({ enabled: on, smsEnabled: on && textsOn }) }} />
      <Switch id="reminder-texts" label="Meeting reminder texts" line="Also send the reminders by text."
        on={textsOn} busy={busy} blocker={notOwner ?? (!emailsOn ? 'Turn on reminder emails first.' : meetingBlocker)}
        onChange={on => { if (ask(on, ' Waiting reminder texts are cancelled.')) reminders.mutate({ enabled: true, smsEnabled: on }) }} />
      <Switch id="reply-email" label="Email me when a lead replies" line="Get an email when one of your leads writes back."
        on={dash.data.reply_notifications} busy={busy}
        onChange={on => reply.mutate(on)} />
    </ul>
  </section>
}
