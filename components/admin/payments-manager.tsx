'use client'

import { useCallback, useState } from 'react'
import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import QRCode from 'qrcode'
import {
  Check,
  Copy,
  CreditCard,
  ExternalLink,
  Loader2,
  Plus,
  QrCode,
  Trash2,
  X,
} from 'lucide-react'

import {
  confirmPayment,
  createPaymentLink,
  deletePaymentLink,
  startPaymentCheckout,
  type PaymentLink,
  type StaffMember,
} from '@/app/actions/payments'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY as string,
)

const MAX_STAFF = 5

function formatUsd(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  })
}

function payUrl(token: string): string {
  return `${window.location.origin}/pay/${token}`
}

export function PaymentsManager({
  initialLinks,
}: {
  initialLinks: PaymentLink[]
}) {
  const [links, setLinks] = useState(initialLinks)

  // Create form state
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [amount, setAmount] = useState('')
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Per-link UI state
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  const [qrFor, setQrFor] = useState<PaymentLink | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [chargeFor, setChargeFor] = useState<PaymentLink | null>(null)

  const maskPhone = (raw: string) => {
    const d = raw.replace(/\D/g, '').slice(0, 10)
    if (d.length <= 3) return d
    if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    setCreating(true)
    const res = await createPaymentLink({
      name,
      email,
      phone,
      staff,
      amountDollars: Number(amount),
    })
    setCreating(false)
    if (!res.ok) {
      setFormError(res.error ?? 'Something went wrong.')
      return
    }
    // Refresh from server state via a light reload of the list
    window.location.reload()
  }

  async function handleCopy(link: PaymentLink) {
    await navigator.clipboard.writeText(payUrl(link.token))
    setCopiedToken(link.token)
    setTimeout(() => setCopiedToken(null), 2000)
  }

  async function handleQr(link: PaymentLink) {
    const dataUrl = await QRCode.toDataURL(payUrl(link.token), {
      width: 320,
      margin: 2,
      color: { dark: '#1d3d47', light: '#ffffff' },
    })
    setQrDataUrl(dataUrl)
    setQrFor(link)
  }

  async function handleDelete(link: PaymentLink) {
    if (!window.confirm(`Delete the pending link for ${link.name}?`)) return
    const res = await deletePaymentLink(link.id)
    if (res.ok) setLinks((prev) => prev.filter((l) => l.id !== link.id))
  }

  const startChargeSession = useCallback(() => {
    if (!chargeFor) return Promise.resolve(null as unknown as string)
    return startPaymentCheckout(chargeFor.token).then((secret) => {
      if (!secret) throw new Error('Could not start checkout')
      return secret
    })
  }, [chargeFor])

  const staffCanAdd = staff.length < MAX_STAFF

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      {/* ── Create form ─────────────────────────────────────── */}
      <form
        onSubmit={handleCreate}
        className="flex h-fit flex-col gap-4 rounded-lg border border-border bg-card p-5"
      >
        <div>
          <h2 className="text-base font-semibold text-foreground">
            New payment link
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Product: Reactivation Power Access
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pay-name">Customer name</Label>
          <Input
            id="pay-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Dr. Jane Smith"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pay-email">Email</Label>
          <Input
            id="pay-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@practice.com"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pay-phone">Phone</Label>
          <Input
            id="pay-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(maskPhone(e.target.value))}
            placeholder="(555) 555-1234"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pay-amount">Amount (USD)</Label>
          <Input
            id="pay-amount"
            type="number"
            min="0.5"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="4997.00"
            required
          />
        </div>

        {/* Staff members */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label>Staff members</Label>
            <span className="text-xs text-muted-foreground">
              {staff.length}/{MAX_STAFF}
            </span>
          </div>
          {staff.map((s, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="grid flex-1 gap-2">
                <Input
                  value={s.name}
                  onChange={(e) =>
                    setStaff((prev) =>
                      prev.map((p, j) =>
                        j === i ? { ...p, name: e.target.value } : p,
                      ),
                    )
                  }
                  placeholder={`Staff ${i + 1} name`}
                  aria-label={`Staff ${i + 1} name`}
                />
                <Input
                  type="email"
                  value={s.email}
                  onChange={(e) =>
                    setStaff((prev) =>
                      prev.map((p, j) =>
                        j === i ? { ...p, email: e.target.value } : p,
                      ),
                    )
                  }
                  placeholder={`Staff ${i + 1} email`}
                  aria-label={`Staff ${i + 1} email`}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove staff ${i + 1}`}
                onClick={() =>
                  setStaff((prev) => prev.filter((_, j) => j !== i))
                }
              >
                <X className="size-4" />
              </Button>
            </div>
          ))}
          {staffCanAdd && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit bg-transparent"
              onClick={() =>
                setStaff((prev) => [...prev, { name: '', email: '' }])
              }
            >
              <Plus className="size-3.5" />
              Add staff member
            </Button>
          )}
        </div>

        {formError && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {formError}
          </p>
        )}

        <Button type="submit" disabled={creating}>
          {creating ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Creating…
            </>
          ) : (
            'Create payment link'
          )}
        </Button>
      </form>

      {/* ── Links list ──────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        {links.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            No payment links yet — create your first one on the left.
          </div>
        )}
        {links.map((link) => (
          <div
            key={link.id}
            className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-foreground">{link.name}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {link.email}
                  {link.phone ? ` · ${link.phone}` : ''}
                </p>
                {link.staff.length > 0 && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Staff:{' '}
                    {link.staff
                      .map((s) => s.name || s.email)
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold text-foreground">
                  {formatUsd(link.amount_cents)}
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    link.status === 'paid'
                      ? 'bg-success/15 text-success'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {link.status === 'paid' ? 'Paid' : 'Pending'}
                </span>
              </div>
            </div>

            {link.status === 'pending' && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-transparent"
                  onClick={() => handleCopy(link)}
                >
                  {copiedToken === link.token ? (
                    <>
                      <Check className="size-3.5 text-success" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="size-3.5" />
                      Copy link
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-transparent"
                  onClick={() =>
                    window.open(payUrl(link.token), '_blank', 'noopener')
                  }
                >
                  <ExternalLink className="size-3.5" />
                  Open link
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-transparent"
                  onClick={() => handleQr(link)}
                >
                  <QrCode className="size-3.5" />
                  QR code
                </Button>
                <Button size="sm" onClick={() => setChargeFor(link)}>
                  <CreditCard className="size-3.5" />
                  Charge card now
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => handleDelete(link)}
                >
                  <Trash2 className="size-3.5" />
                  Delete
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Created {new Date(link.created_at).toLocaleDateString('en-US')}
              {link.paid_at
                ? ` · Paid ${new Date(link.paid_at).toLocaleDateString('en-US')}`
                : ''}
            </p>
          </div>
        ))}
      </div>

      {/* ── QR dialog ───────────────────────────────────────── */}
      <Dialog
        open={qrFor !== null}
        onOpenChange={(open) => {
          if (!open) {
            setQrFor(null)
            setQrDataUrl(null)
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Scan to pay</DialogTitle>
            <DialogDescription>
              {qrFor
                ? `${qrFor.name} — ${formatUsd(qrFor.amount_cents)} for Reactivation Power Access`
                : ''}
            </DialogDescription>
          </DialogHeader>
          {qrDataUrl && (
            <div className="flex justify-center rounded-lg bg-white p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrDataUrl || '/placeholder.svg'}
                alt={`QR code for the payment link${qrFor ? ` for ${qrFor.name}` : ''}`}
                width={320}
                height={320}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Charge-now dialog (embedded Stripe Checkout) ────── */}
      <Dialog
        open={chargeFor !== null}
        onOpenChange={(open) => {
          if (!open) setChargeFor(null)
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Charge card</DialogTitle>
            <DialogDescription>
              {chargeFor
                ? `${chargeFor.name} — ${formatUsd(chargeFor.amount_cents)} for Reactivation Power Access`
                : ''}
            </DialogDescription>
          </DialogHeader>
          {chargeFor && (
            <EmbeddedCheckoutProvider
              key={chargeFor.token}
              stripe={stripePromise}
              options={{
                fetchClientSecret: startChargeSession,
                onComplete: () => {
                  // Verify with Stripe, mark paid, then refresh the list
                  void confirmPayment(chargeFor.token).then(() =>
                    window.location.reload(),
                  )
                },
              }}
            >
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
