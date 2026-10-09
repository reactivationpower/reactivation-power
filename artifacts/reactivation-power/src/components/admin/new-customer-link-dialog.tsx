// @ts-nocheck

import { useEffect, useRef, useState } from 'react'
import { Loader2, Plus, X } from 'lucide-react'

import { createPaymentLink, retryCustomerEnrollment, type PaymentLink, type StaffMember } from '@/app/actions/payments'
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
import { Textarea } from '@/components/ui/textarea'
import { notifyDone, notifyError } from '@/lib/notify'

const MAX_STAFF = 5

type OfferType = 'one_time' | 'subscription'

function formatUsd(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export function maskPhone(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 10)
  if (d.length <= 3) return d
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

const emptyCustomer = {
  fullName: '',
  businessName: '',
  businessAddress: '',
  phone: '',
  ownerName: '',
  ownerPhone: '',
  email: '',
}

/**
 * "New customer" dialog: the customer record plus the offer — full price
 * (one-time) or subscription (monthly + setup fee, prefilled to the monthly
 * amount and editable or waivable).
 */
export function NewCustomerLinkDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (link: PaymentLink) => void
}) {
  const [customer, setCustomer] = useState(emptyCustomer)
  const [offerType, setOfferType] = useState<OfferType>('one_time')
  const [amount, setAmount] = useState('')
  const [monthly, setMonthly] = useState('')
  const [setupFee, setSetupFee] = useState('')
  const [chargeSetupFee, setChargeSetupFee] = useState(true)
  const [setupTouched, setSetupTouched] = useState(false)
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const requestId = useRef<string | null>(null)
  const inFlight = useRef(false)
  const [saved, setSaved] = useState<any>(null)

  const set = (key: keyof typeof emptyCustomer) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setCustomer((c) => ({ ...c, [key]: e.target.value }))

  // Setup fee defaults to the monthly amount until the rep edits it
  useEffect(() => {
    if (!setupTouched) setSetupFee(monthly)
  }, [monthly, setupTouched])

  const waived = offerType === 'subscription' && !chargeSetupFee

  function reset() {
    setCustomer(emptyCustomer)
    setOfferType('one_time')
    setAmount('')
    setMonthly('')
    setSetupFee('')
    setChargeSetupFee(true)
    setSetupTouched(false)
    setStaff([])
    setFormError(null)
    setSaved(null)
    requestId.current = null
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (inFlight.current) return
    inFlight.current = true
    setFormError(null)
    setCreating(true)
    requestId.current ??= crypto.randomUUID()
    const offer =
      offerType === 'subscription'
        ? { type: 'subscription', monthlyDollars: Number(monthly), setupFeeDollars: chargeSetupFee ? Number(setupFee) : 0 }
        : { type: 'one_time', amountDollars: Number(amount) }
    try {
    const res = await createPaymentLink({ customer, staff, offer, requestId: requestId.current })
    if (!res.ok || !res.link) {
      setFormError(res.error ?? 'Something went wrong.')
      notifyError('Could not create the link', res.error)
      return
    }
    onCreated(res.link)
    setSaved({ link: res.link, invitation: res.invitation ?? { status: 'pending' } })
    notifyDone(
      'Enrollment record created — no payment collected',
      offerType === 'subscription'
        ? `${res.link.name} — ${formatUsd(res.link.monthly_cents)}/mo · ${
            res.link.setup_fee_cents > 0 ? `${formatUsd(res.link.setup_fee_cents)} setup` : 'setup fee waived'
          }`
        : `${res.link.name} — ${formatUsd(res.link.amount_cents)}`,
    )
    } catch {
      setFormError('Response unavailable. Submit again to recover the same enrollment record safely; do not start another customer.')
    } finally {
      setCreating(false)
      inFlight.current = false
    }
  }

  async function retryEmail() {
    if (inFlight.current || !saved) return
    inFlight.current = true
    setCreating(true)
    try {
      const res = await retryCustomerEnrollment(saved.link.id)
      setSaved((s: any) => ({ ...s, invitation: res.invitation }))
    } catch {
      setSaved((s: any) => ({ ...s, invitation: { status: 'pending', error: 'Response unavailable. Check status again on this saved record.' } }))
    } finally {
      setCreating(false)
      inFlight.current = false
    }
  }

  const staffCanAdd = staff.length < MAX_STAFF

  return (
    <Dialog open={open} onOpenChange={(value) => {
      if (creating) return
      if (!value && saved) reset()
      onOpenChange(value)
    }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New customer</DialogTitle>
          <DialogDescription>
            Create the customer and offer, then automatically email their enrollment agreement. No payment is collected.
          </DialogDescription>
        </DialogHeader>
        {saved ? (
          <div className="space-y-4" data-testid="new-customer-enrollment-result">
            <p className="font-medium">Customer and offer saved — no payment collected.</p>
            <p className="text-sm" role="status">
              {saved.invitation.status === 'provider_accepted'
                ? 'Email provider accepted the enrollment invitation. Inbox delivery is not yet confirmed.'
                : saved.invitation.status === 'failed'
                  ? 'Enrollment email failed. Your saved record is safe; do not create another customer.'
                  : 'Enrollment email is sending or pending. Check again on this saved record.'}
            </p>
            {saved.invitation.error && <p className="text-sm text-destructive">{saved.invitation.error}</p>}
            {saved.invitation.status !== 'provider_accepted' && (
              <Button disabled={creating} onClick={retryEmail} data-testid="retry-enrollment-email">
                {creating && <Loader2 className="size-4 animate-spin" />}
                {saved.invitation.status === 'failed' ? 'Retry enrollment email' : 'Check / retry email'}
              </Button>
            )}
            <p className="text-xs text-muted-foreground">Edit terms, preview the agreement, choose copy recipients, or explicitly resend from the saved offer’s agreement controls. Staff accounts are not email-copy recipients.</p>
            <Button variant="outline" disabled={creating} onClick={() => { reset(); onOpenChange(false) }}>Done</Button>
          </div>
        ) : <form onSubmit={handleCreate} className="flex flex-col gap-6">
          {/* ── Customer ─────────────────────────────────────── */}
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Customer
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cust-name">Full name</Label>
                <Input id="cust-name" value={customer.fullName} onChange={set('fullName')} placeholder="Dr. Jane Smith" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cust-business">Business name</Label>
                <Input id="cust-business" value={customer.businessName} onChange={set('businessName')} placeholder="Smith Family Dental" required />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cust-address">Business address</Label>
              <Textarea
                id="cust-address"
                value={customer.businessAddress}
                onChange={set('businessAddress')}
                placeholder="123 Main St, Suite 200, Austin, TX 78701"
                rows={2}
                required
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cust-email">Email</Label>
                <Input id="cust-email" type="email" value={customer.email} onChange={set('email')} placeholder="jane@practice.com" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cust-phone">Business phone</Label>
                <Input
                  id="cust-phone"
                  type="tel"
                  value={customer.phone}
                  onChange={(e) => setCustomer((c) => ({ ...c, phone: maskPhone(e.target.value) }))}
                  placeholder="(555) 555-1234"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cust-owner">Owner name</Label>
                <Input id="cust-owner" value={customer.ownerName} onChange={set('ownerName')} placeholder="Jane Smith" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cust-owner-phone">Owner phone</Label>
                <Input
                  id="cust-owner-phone"
                  type="tel"
                  value={customer.ownerPhone}
                  onChange={(e) => setCustomer((c) => ({ ...c, ownerPhone: maskPhone(e.target.value) }))}
                  placeholder="(555) 555-9876"
                  required
                />
              </div>
            </div>
          </fieldset>

          {/* ── Offer ────────────────────────────────────────── */}
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Offer
            </legend>
            <div role="radiogroup" aria-label="Offer type" className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ['one_time', 'Full price', 'One payment, access for life.'],
                  ['subscription', 'Subscription', 'Initial payment at enrollment; monthly billing starts one calendar month later.'],
                ] as [OfferType, string, string][]
              ).map(([value, label, hint]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={offerType === value}
                  onClick={() => setOfferType(value)}
                  className={`flex flex-col items-start rounded-md border px-3 py-2.5 text-left transition-colors ${
                    offerType === value
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border hover:bg-accent'
                  }`}
                >
                  <span className="text-sm font-medium text-foreground">{label}</span>
                  <span className="text-xs text-muted-foreground">{hint}</span>
                </button>
              ))}
            </div>

            {offerType === 'one_time' ? (
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
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pay-monthly">Monthly amount (USD)</Label>
                  <Input
                    id="pay-monthly"
                    type="number"
                    min="0.5"
                    step="0.01"
                    value={monthly}
                    onChange={(e) => setMonthly(e.target.value)}
                    placeholder="497.00"
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="charge-setup" className="flex items-center gap-2 text-sm font-medium">
                    <input id="charge-setup" type="checkbox" checked={chargeSetupFee} onChange={(e) => setChargeSetupFee(e.target.checked)} />
                    Charge an initial setup payment
                  </label>
                  <Label htmlFor="pay-setup">Setup payment (USD)</Label>
                  <Input
                    id="pay-setup"
                    type="number"
                    min="0.5"
                    step="0.01"
                    value={waived ? '0' : setupFee}
                    onChange={(e) => {
                      setSetupTouched(true)
                      setSetupFee(e.target.value)
                    }}
                    disabled={waived}
                    placeholder="497.00"
                    required={!waived}
                  />
                  <p className="text-xs text-muted-foreground">
                    {waived
                      ? 'Waived — $0.00. The full-payment purchase price is not affected.'
                      : 'The initial payment covers the first month. Defaults to the monthly amount.'}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  The customer adds two different cards. The 12 monthly payments begin one calendar month after enrollment.
                  Creating this profile does not charge the customer.
                </p>
              </div>
            )}
          </fieldset>

          {/* ── Staff ────────────────────────────────────────── */}
          <fieldset className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Staff members
              </legend>
              <span className="text-xs text-muted-foreground">
                {staff.length}/{MAX_STAFF}
              </span>
            </div>
            {staff.map((s, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="grid flex-1 gap-2 sm:grid-cols-2">
                  <Input
                    value={s.name}
                    onChange={(e) =>
                      setStaff((prev) => prev.map((p, j) => (j === i ? { ...p, name: e.target.value } : p)))
                    }
                    placeholder={`Staff ${i + 1} name`}
                    aria-label={`Staff ${i + 1} name`}
                  />
                  <Input
                    type="email"
                    value={s.email}
                    onChange={(e) =>
                      setStaff((prev) => prev.map((p, j) => (j === i ? { ...p, email: e.target.value } : p)))
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
                  onClick={() => setStaff((prev) => prev.filter((_, j) => j !== i))}
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
                onClick={() => setStaff((prev) => [...prev, { name: '', email: '' }])}
              >
                <Plus className="size-3.5" />
                Add staff member
              </Button>
            )}
          </fieldset>

          {formError && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{formError}</p>
          )}

          <Button type="submit" disabled={creating}>
            {creating ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Saving and requesting enrollment email…
              </>
            ) : offerType === 'subscription' ? (
              'Create subscription & email agreement'
            ) : (
              'Create full-payment offer & email agreement'
            )}
          </Button>
        </form>}
      </DialogContent>
    </Dialog>
  )
}
