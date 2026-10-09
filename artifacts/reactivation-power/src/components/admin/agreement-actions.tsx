// @ts-nocheck
import { useState } from 'react'
import QRCode from 'qrcode'
import { Copy, Download, ExternalLink, Loader2, MessageSquare, Pencil, QrCode, RefreshCw, Send } from 'lucide-react'

import { resendAgreement, retryAgreementCompletion } from '@/app/actions/agreements'
import { AgreementFormDialog } from '@/components/admin/agreement-form-dialog'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { apiUrl } from '@/lib/api'
import { notifyDone, notifyError } from '@/lib/notify'
import { useRouter } from '@/hooks/use-router'

/** Open / download / copy link / re-send / edit / QR for one agreement. */
export function AgreementActions({ agreement, size = 'sm' }: { agreement: any; size?: 'sm' | 'default' }) {
  const router = useRouter()
  const [qr, setQr] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [resending, setResending] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [copyEmails, setCopyEmails] = useState('')
  const [smsOpen, setSmsOpen] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [resendResult, setResendResult] = useState<{ ok: boolean; text: string } | null>(null)
  const signerEmail: string = agreement.delivery_email ?? agreement.email
  const delivery: any[] = Array.isArray(agreement.delivery_status) ? agreement.delivery_status : []
  const url: string = agreement.public_url
  const smsHref = `sms:?body=${encodeURIComponent(url)}`
  const pdf = apiUrl(`/agreements/${agreement.token}/pdf`)

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      notifyDone('Agreement link copied', agreement.customer_name)
    } catch {
      notifyError('Could not copy the link')
    }
  }
  async function showQr() {
    try {
      setQr(await QRCode.toDataURL(url, { width: 320, margin: 2, color: { dark: '#1d3d47', light: '#ffffff' } }))
    } catch {
      notifyError('Could not generate the QR code')
    }
  }
  async function resend() {
    setResending(true)
    setResendResult(null)
    try {
      const copies = copyEmails.split(',').map((e) => e.trim()).filter(Boolean)
      const res = await resendAgreement(agreement.id, { signerEmail, copyEmails: copies })
      const st = res.status ?? (res.emailed === false ? 'failed' : res.ok ? 'provider_accepted' : 'failed')
      if (!res.ok || st === 'failed') {
        const text = res.error ?? 'Email failed. It was not delivered. Copy the link instead.'
        setResendResult({ ok: false, text })
        notifyError(text)
      } else {
        const text = `Email provider accepted the message for ${signerEmail}. Delivery is not yet confirmed.`
        setResendResult({ ok: true, text })
        notifyDone('Provider accepted email', signerEmail)
        setConfirmOpen(false)
      }
      router.refresh()
    } finally {
      setResending(false)
    }
  }
  async function retry() {
    setRetrying(true)
    try {
      const res = await retryAgreementCompletion(agreement.id)
      if (!res?.ok) notifyError(res?.error ?? 'Could not retry documents and email')
      else notifyDone('Retry started', agreement.customer_name)
      router.refresh()
    } finally {
      setRetrying(false)
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size={size} className="bg-transparent" onClick={() => window.open(url, '_blank', 'noopener')} data-testid="ag-open">
          <ExternalLink className="size-3.5" /> Open
        </Button>
        {agreement.locked ? (
          <a href={pdf} data-testid="ag-download" className={buttonVariants({ variant: 'outline', size, className: 'bg-transparent' })}>
            <Download className="size-3.5" /> Download PDF
          </a>
        ) : null}
        <Button variant="outline" size={size} className="bg-transparent" onClick={copy} data-testid="ag-copy">
          <Copy className="size-3.5" /> Copy link
        </Button>
        <Button variant="outline" size={size} className="bg-transparent" onClick={showQr} data-testid="ag-qr">
          <QrCode className="size-3.5" /> QR code
        </Button>
        <Button variant="outline" size={size} className="bg-transparent md:hidden" onClick={() => setSmsOpen(true)} data-testid="ag-sms">
          <MessageSquare className="size-3.5" /> Text link
        </Button>
        {agreement.locked && agreement.completed_at ? (
          <Button variant="outline" size={size} className="bg-transparent" onClick={retry} disabled={retrying} data-testid="ag-retry-completion">
            {retrying ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Retry documents/email
          </Button>
        ) : null}
        {!agreement.locked ? (
          <>
            <Button variant="outline" size={size} className="bg-transparent" onClick={() => { setResendResult(null); setConfirmOpen(true) }} data-testid="ag-resend">
              <Send className="size-3.5" /> Resend Email
            </Button>
            <Button size={size} onClick={() => setEditing(true)} data-testid="ag-edit">
              <Pencil className="size-3.5" /> Edit
            </Button>
          </>
        ) : null}
      </div>

      {resendResult ? (
        <p className={`text-xs ${resendResult.ok ? 'text-muted-foreground' : 'text-destructive'}`} data-testid="ag-resend-result">{resendResult.text}</p>
      ) : null}
      {agreement.locked && agreement.completed_at ? (
        <div className="w-full rounded-md border p-3 text-xs" data-testid="ag-completion-status">
          <p className="font-medium">Completed agreement: {agreement.pdf_ready ? 'PDF stored' : 'PDF not stored yet'}</p>
          {delivery.length ? (
            <ul className="mt-1 space-y-0.5">
              {delivery.map((d, i) => (
                <li key={i} className={d.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'}>
                  {d.recipient}: {String(d.status).replace('_', ' ')}{d.error ? ` (${d.error})` : ''}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-muted-foreground">No completion emails recorded.</p>
          )}
          <p className="mt-1 text-muted-foreground">Provider accepted means handed to the email service, not confirmed delivered.</p>
        </div>
      ) : null}
      {agreement.initial_delivery_status?.length ? (
        <div className="w-full rounded-md border p-3 text-xs" data-testid="ag-initial-delivery-status">
          <p className="font-medium">Enrollment email</p>
          {agreement.initial_delivery_status.map((d: any, i: number) => (
            <p key={i} className={d.status === 'failed' || d.status === 'bounced' ? 'text-destructive' : 'text-muted-foreground'}>
              {d.recipient}: {String(d.status).replace('_', ' ')}{d.error ? ` (${d.error})` : ''}
            </p>
          ))}
        </div>
      ) : null}

      <Dialog open={confirmOpen} onOpenChange={(o) => !resending && setConfirmOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Resend signing email</DialogTitle>
            <DialogDescription>The signing link goes to the signer only. Copies are informational and do not change the signer or account.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1 text-sm">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Signer delivery address</p>
            <p className="font-medium" data-testid="ag-resend-signer">{signerEmail}</p>
          </div>
          <div className="space-y-1 text-sm">
            <label htmlFor="ag-copy-emails" className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Copy emails (optional, comma-separated)</label>
            <Input id="ag-copy-emails" value={copyEmails} onChange={(e) => setCopyEmails(e.target.value)} placeholder="office@example.com, partner@example.com" />
          </div>
          {resendResult && !resendResult.ok ? <p className="text-xs text-destructive">{resendResult.text}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={resending}>Cancel</Button>
            <Button onClick={resend} disabled={resending || !signerEmail} data-testid="ag-resend-confirm">
              {resending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} Send email
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={smsOpen} onOpenChange={setSmsOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Text the link manually</DialogTitle>
            <DialogDescription>This opens your phone's messaging app with the link filled in. The app did not send an SMS. You must pick the recipient and press send yourself.</DialogDescription>
          </DialogHeader>
          <code className="block truncate rounded bg-muted px-2 py-1 text-xs">{url}</code>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={copy}><Copy className="size-3.5" /> Copy link (desktop)</Button>
            <a href={smsHref} className={buttonVariants({ size: 'default' })} data-testid="ag-sms-open" onClick={() => setSmsOpen(false)}>
              <MessageSquare className="size-3.5" /> Open phone composer
            </a>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={qr !== null} onOpenChange={(o) => !o && setQr(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Scan to sign</DialogTitle>
            <DialogDescription>{agreement.customer_name} — opens the signing page on their phone.</DialogDescription>
          </DialogHeader>
          {qr ? (
            <div className="flex justify-center rounded-lg bg-white p-4">
              <img src={qr} alt="QR code for the agreement" width={288} height={288} />
            </div>
          ) : null}
          <code className="block truncate rounded bg-muted px-2 py-1 text-xs">{url}</code>
        </DialogContent>
      </Dialog>

      <AgreementFormDialog
        open={editing}
        onOpenChange={setEditing}
        linkId={agreement.link_id}
        agreementId={agreement.id}
        mode="edit"
        onSaved={() => router.refresh()}
      />
    </>
  )
}
