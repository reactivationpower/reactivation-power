import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getInboxSettings, saveInboxSettings } from '@/app/actions/sales-inbox'
import { Banner, ErrorBox, Field, Pill, Skeleton, btn, card, errMsg, inp } from '@/components/leads/ui'

const RECOMMENDED = 'patientpipeline.app'

function Check({ ok, label }: { ok: boolean; label: string }) {
  return <li className="flex flex-wrap items-center justify-between gap-2"><span>{label}</span><Pill tone={ok ? 'bg-success/15 text-success' : 'bg-yellow-500/15'}>{ok ? 'Detected' : 'Not detected'}</Pill></li>
}

/** Super-admin-only setup for the unified inbox. Nothing here enables a channel automatically. */
export function InboxSetup() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['sales-inbox', 'settings'], queryFn: getInboxSettings })
  const [draft, setDraft] = useState<{ domain?: string; sms?: boolean; email?: boolean }>({})
  const save = useMutation({
    mutationFn: saveInboxSettings,
    onSuccess: () => { toast.success('Inbox setup saved'); setDraft({}); qc.invalidateQueries({ queryKey: ['sales-inbox'] }) },
    onError: (e) => toast.error(errMsg(e)),
  })
  if (q.isLoading) return <section className={card}><Skeleton rows={2} /></section>
  if (q.isError || !q.data) return <section className={card}><ErrorBox error={q.error} retry={() => q.refetch()} /></section>
  const { superAdmin, settings, receivingAccess, webhookConfigured } = q.data
  if (!superAdmin) return null
  const domain = draft.domain ?? settings.email_domain ?? ''
  const sms = draft.sms ?? settings.sms_ready
  const email = draft.email ?? settings.email_ready
  const dirty = draft.domain !== undefined || draft.sms !== undefined || draft.email !== undefined
  const domainOk = !domain.trim() || /^(?:[a-z0-9-]+\.)*patientpipeline\.app$/i.test(domain.trim())

  return (
    <section className={card + ' space-y-4 break-words'} data-testid="section-inbox-setup">
      <div>
        <h2 className="font-semibold">Inbox setup</h2>
        <p className="mt-1 text-sm text-muted-foreground">Routes lead replies into the shared inbox. Outbound email goes through Resend; texts and call history come from GoHighLevel. Each channel stays blocked until you confirm it below. Nothing is turned on automatically.</p>
      </div>

      <div className="space-y-2 rounded-md bg-muted/50 p-3 text-sm">
        <p className="font-medium">Email receiving requirements</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>The selected receiving domain is <code className="break-all rounded bg-card px-1">{RECOMMENDED}</code>. Resend will receive mail for this entire domain; this does not create staff mailboxes.</li>
          <li>At your DNS provider, add the inbound MX record Resend shows for that domain. This is manual; this page does not change DNS.</li>
          <li>In Resend, add an <code className="rounded bg-card px-1">email.received</code> webhook pointing at the existing <code className="break-all rounded bg-card px-1">/api/webhooks/resend</code> endpoint. It uses the same signing secret as the current Resend webhook configuration.</li>
          <li>Reading received messages may need a Resend key with full access. Provision it securely as <code>RESEND_RECEIVING_API_KEY</code>, and the webhook signing secret as <code>RESEND_WEBHOOK_SECRET</code>. Never paste keys into this page.</li>
        </ol>
        <ul className="space-y-1 pt-2">
          <Check ok={webhookConfigured} label="Resend webhook secret configured" />
          <Check ok={receivingAccess} label="Server can read received email" />
        </ul>
      </div>

      {!!q.data.receivingIssues && <Banner kind="warn">{q.data.receivingIssues} incoming email event(s) need review. Check Resend receiving access or the sender/recipient match before treating this inbox as up to date. Unmatched senders are not attached to a lead automatically.</Banner>}
      <Field label="Replies domain" hint="Email replies are only routed for this domain. Sending still goes only to the lead's address on file.">
        <input className={inp} value={domain} placeholder={RECOMMENDED} onChange={(e) => setDraft({ ...draft, domain: e.target.value })} data-testid="input-inbox-domain" />
      </Field>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={email} onChange={(e) => setDraft({ ...draft, email: e.target.checked })} data-testid="checkbox-email-ready" />
        <span>I confirm the MX record and the email.received webhook are configured for this domain and email sending from the inbox may be enabled.</span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={sms} onChange={(e) => setDraft({ ...draft, sms: e.target.checked })} data-testid="checkbox-sms-ready" />
        <span>Operator attestation: the GoHighLevel sending number is registered (A2P/10DLC where required), opt-out handling is active, and texting leads from this inbox is approved.</span>
      </label>
      {email && (!webhookConfigured || !receivingAccess) && <Banner kind="warn">Receiving checks are not detected yet. Replies may not appear in the inbox until setup is complete.</Banner>}

      <button className={btn} disabled={!dirty || !domainOk || (email && !domain.trim()) || save.isPending} onClick={() => save.mutate({ emailDomain: domain.trim().toLowerCase(), smsReady: sms, emailReady: email })} data-testid="button-save-inbox-setup">
        {save.isPending ? 'Saving...' : 'Save inbox setup'}
      </button>
      {dirty && !domainOk && <p className="text-xs text-destructive">Enter a valid domain, for example {RECOMMENDED}.</p>}
    </section>
  )
}
