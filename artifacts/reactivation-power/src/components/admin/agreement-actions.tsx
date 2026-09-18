// @ts-nocheck
import { useState } from 'react'
import QRCode from 'qrcode'
import { Copy, Download, ExternalLink, Loader2, Pencil, QrCode, Send } from 'lucide-react'

import { resendAgreement } from '@/app/actions/agreements'
import { AgreementFormDialog } from '@/components/admin/agreement-form-dialog'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { apiUrl } from '@/lib/api'
import { notifyDone, notifyError } from '@/lib/notify'
import { useRouter } from '@/hooks/use-router'

/** Open / download / copy link / re-send / edit / QR for one agreement. */
export function AgreementActions({ agreement, size = 'sm' }: { agreement: any; size?: 'sm' | 'default' }) {
  const router = useRouter()
  const [qr, setQr] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [resending, setResending] = useState(false)
  const url: string = agreement.public_url
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
    try {
      const res = await resendAgreement(agreement.id)
      if (!res.ok) notifyError(res.error ?? 'Could not re-send')
      else if (res.emailed === false) notifyError('Email failed — copy the link instead')
      else notifyDone('Signing link re-sent', agreement.email)
      router.refresh()
    } finally {
      setResending(false)
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
        {!agreement.locked ? (
          <>
            <Button variant="outline" size={size} className="bg-transparent" onClick={resend} disabled={resending} data-testid="ag-resend">
              {resending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />} Re-send
            </Button>
            <Button size={size} onClick={() => setEditing(true)} data-testid="ag-edit">
              <Pencil className="size-3.5" /> Edit
            </Button>
          </>
        ) : null}
      </div>

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
