'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import QRCode from 'qrcode'
import {
  Copy,
  CreditCard,
  ExternalLink,
  Loader2,
  QrCode,
  Trash2,
  UserPlus,
} from 'lucide-react'

import {
  confirmPayment,
  deletePaymentLink,
  provisionAccountsNow,
  startPaymentCheckout,
  type PaymentLink,
} from '@/app/actions/payments'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { notifyDone, notifyError } from '@/lib/notify'

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY as string,
)

function formatUsd(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  })
}

export function PaymentDetailActions({
  link,
  hasAccounts,
}: {
  link: PaymentLink
  hasAccounts: boolean
}) {
  const router = useRouter()
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [charging, setCharging] = useState(false)
  const [provisioning, setProvisioning] = useState(false)

  const payUrl = () => `${window.location.origin}/pay/${link.token}`
  const isPaid = link.status === 'paid'

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(payUrl())
      notifyDone('Payment link copied', `${link.name} — ready to paste`)
    } catch {
      notifyError('Could not copy the link')
    }
  }

  async function handleQr() {
    try {
      setQrDataUrl(
        await QRCode.toDataURL(payUrl(), {
          width: 320,
          margin: 2,
          color: { dark: '#1d3d47', light: '#ffffff' },
        }),
      )
      notifyDone('QR code generated')
    } catch {
      notifyError('Could not generate the QR code')
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete the pending link for ${link.name}?`)) return
    const res = await deletePaymentLink(link.id)
    if (!res.ok) {
      notifyError(res.error ?? 'Could not delete the link')
      return
    }
    notifyDone('Payment link deleted')
    router.push('/admin/payments')
  }

  async function handleProvision() {
    setProvisioning(true)
    const res = await provisionAccountsNow(link.id)
    setProvisioning(false)
    if (!res.ok) {
      notifyError(res.error ?? 'Could not create the accounts')
      return
    }
    notifyDone('Portal accounts created', `${link.name} can now log in`)
    router.refresh()
  }

  const startChargeSession = useCallback(
    () =>
      startPaymentCheckout(link.token).then((secret) => {
        if (!secret) throw new Error('Could not start checkout')
        return secret
      }),
    [link.token],
  )

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-4">
        <Button
          variant="outline"
          size="sm"
          className="bg-transparent"
          onClick={handleCopy}
        >
          <Copy className="size-3.5" />
          Copy link
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="bg-transparent"
          onClick={() => window.open(payUrl(), '_blank', 'noopener')}
        >
          <ExternalLink className="size-3.5" />
          Open link
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="bg-transparent"
          onClick={handleQr}
        >
          <QrCode className="size-3.5" />
          QR code
        </Button>

        {!isPaid ? (
          <>
            <Button size="sm" onClick={() => setCharging(true)}>
              <CreditCard className="size-3.5" />
              Charge card now
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={handleDelete}
            >
              <Trash2 className="size-3.5" />
              Delete
            </Button>
          </>
        ) : null}

        {isPaid && !hasAccounts ? (
          <Button size="sm" onClick={handleProvision} disabled={provisioning}>
            {provisioning ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <UserPlus className="size-3.5" />
            )}
            Create accounts now
          </Button>
        ) : null}
      </div>

      {/* QR dialog */}
      <Dialog
        open={qrDataUrl !== null}
        onOpenChange={(open) => {
          if (!open) setQrDataUrl(null)
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Scan to pay</DialogTitle>
            <DialogDescription>
              {`${link.name} — ${formatUsd(link.amount_cents)} for Reactivation Power Access`}
            </DialogDescription>
          </DialogHeader>
          {qrDataUrl ? (
            <div className="flex justify-center rounded-lg bg-white p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrDataUrl || '/placeholder.svg'}
                alt={`QR code for the payment link for ${link.name}`}
                width={320}
                height={320}
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Charge-now dialog */}
      <Dialog
        open={charging}
        onOpenChange={(open) => {
          if (!open) setCharging(false)
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Charge card</DialogTitle>
            <DialogDescription>
              {`${link.name} — ${formatUsd(link.amount_cents)} for Reactivation Power Access`}
            </DialogDescription>
          </DialogHeader>
          {charging ? (
            <EmbeddedCheckoutProvider
              key={link.token}
              stripe={stripePromise}
              options={{
                fetchClientSecret: startChargeSession,
                onComplete: () => {
                  void confirmPayment(link.token).then((res) => {
                    setCharging(false)
                    if (res.paid) {
                      notifyDone(
                        `Payment completed — ${formatUsd(link.amount_cents)}`,
                        `${link.name} is paid and their portal accounts are ready`,
                      )
                    } else {
                      notifyError('Payment could not be verified')
                    }
                    router.refresh()
                  })
                },
              }}
            >
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
