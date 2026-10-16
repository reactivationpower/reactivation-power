// @ts-nocheck
import { useState } from 'react'
import {
  AlertTriangle,
  Ban,
  CalendarClock,
  CreditCard,
  Loader2,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Undo2,
} from 'lucide-react'

import {
  cancelSubscription,
  changeBillingDate,
  refundPayment,
  resumeSubscription,
  retryCustomerPayment,
} from '@/app/actions/billing'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRouter } from '@/hooks/use-router'
import { notifyDone, notifyError } from '@/lib/notify'

function formatUsd(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}
function formatWhen(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
}
function formatDay(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { dateStyle: 'medium' })
}

const STATUS_LABEL: Record<string, string> = {
  none: 'Not started',
  setup_paid: 'Setup paid',
  trialing: 'Active · first month',
  active: 'Active',
  past_due: 'Past due · access paused',
  canceled: 'Canceled',
  paid: 'Paid in full',
}

export function BillingStatusBadge({ status }: { status: string }) {
  const variant =
    status === 'past_due' ? 'destructive' : status === 'canceled' ? 'outline' : status === 'active' || status === 'trialing' || status === 'paid' ? 'default' : 'secondary'
  return (
    <Badge variant={variant} data-testid="billing-status">
      {STATUS_LABEL[status] ?? status}
    </Badge>
  )
}

function HistoryStatus({ entry }: { entry: any }) {
  if (entry.status === 'succeeded') return <Badge variant="default">Paid</Badge>
  if (entry.status === 'failed') return <Badge variant="destructive">Failed</Badge>
  if (entry.status === 'refunded') return <Badge variant="secondary">Refunded</Badge>
  return <Badge variant="outline">Note</Badge>
}

/**
 * Billing card on the payment detail page: current status, past-due banner,
 * admin actions (refund / cancel / change date / retry) and the ledger.
 */
export function BillingPanel({ link, customer, history }: { link: any; customer: any; history: any[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [refundTarget, setRefundTarget] = useState<any | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [dateOpen, setDateOpen] = useState(false)

  const hasSubscription = Boolean(link.stripe_subscription_id)
  const subActive = hasSubscription && link.subscription_status !== 'canceled'
  const scheduledCancel = subActive && Boolean(link.cancel_at)

  async function run(label: string, fn: () => Promise<any>, onOk?: (r: any) => void) {
    setBusy(label)
    try {
      const res = await fn()
      if (!res?.ok) {
        notifyError(res?.error || 'Something went wrong')
        return false
      }
      onOk?.(res)
      router.refresh()
      return true
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Something went wrong')
      return false
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card data-testid="billing-panel">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ReceiptText className="size-4 text-muted-foreground" />
            Billing
          </CardTitle>
          {customer ? <BillingStatusBadge status={customer.billing_status} /> : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {customer?.billing_status === 'past_due' ? (
          <div
            role="alert"
            data-testid="past-due-banner"
            className="flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <div>
                <p className="font-medium text-destructive">Payment failed on both cards — portal access is paused</p>
                <p className="text-muted-foreground">
                  {customer.billing_issue || 'The most recent charge was declined.'}
                  {customer.billing_blocked_at ? ` Since ${formatWhen(customer.billing_blocked_at)}.` : ''} The daily retry
                  keeps trying both cards; access comes back automatically once an invoice is paid.
                </p>
              </div>
            </div>
            <div>
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                data-testid="button-retry-payment"
                onClick={() =>
                  run('retry', () => retryCustomerPayment({ linkId: link.id }), (r) =>
                    r.paid
                      ? notifyDone('Payment collected', 'Portal access has been restored.')
                      : notifyError(r.message || 'Both cards were declined again.'),
                  )
                }
              >
                {busy === 'retry' ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                Retry both cards now
              </Button>
            </div>
          </div>
        ) : null}

        {scheduledCancel ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-4 py-2.5 text-sm">
            <span className="flex items-center gap-2">
              <Ban className="size-4 text-muted-foreground" />
              Cancels at end of term · {formatDay(link.cancel_at)}
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy !== null}
              data-testid="button-resume-subscription"
              onClick={() => run('resume', () => resumeSubscription({ linkId: link.id }), () => notifyDone('Cancellation removed'))}
            >
              {busy === 'resume' ? <Loader2 className="size-4 animate-spin" /> : <Undo2 className="size-4" />}
              Keep subscription
            </Button>
          </div>
        ) : null}

        {subActive ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setDateOpen(true)} disabled={busy !== null} data-testid="button-change-billing-date">
              <CalendarClock className="size-4" />
              Change billing date
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => setCancelOpen(true)}
              disabled={busy !== null}
              data-testid="button-cancel-subscription"
            >
              <Ban className="size-4" />
              Cancel subscription
            </Button>
          </div>
        ) : null}

        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Payment history</h3>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No charges recorded yet.</p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border" data-testid="payment-history">
              {history.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm" data-testid={`history-${h.kind}`}>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{h.description}</span>
                      <HistoryStatus entry={h} />
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatWhen(h.occurred_at)}
                      {h.card_last4 ? (
                        <>
                          {' · '}
                          <CreditCard className="mr-0.5 inline size-3 align-[-2px]" />
                          <span className="capitalize">{h.card_brand}</span> •••• {h.card_last4}
                          {h.card_rank ? ` (${h.card_rank})` : ''}
                        </>
                      ) : null}
                      {h.actor_admin_name ? ` · by ${h.actor_admin_name}` : h.source === 'dunning' ? ' · automatic retry' : h.source === 'cron' ? ' · daily retry' : ''}
                    </span>
                    {h.failure_message ? <span className="text-xs text-destructive">{h.failure_message}</span> : null}
                  </div>
                  <span className={`tabular-nums ${h.status === 'refunded' ? 'text-muted-foreground' : h.status === 'info' ? 'text-muted-foreground' : 'font-medium'}`}>
                    {h.status === 'info' ? '' : h.status === 'refunded' ? `−${formatUsd(h.amount_cents)}` : formatUsd(h.amount_cents)}
                  </span>
                  {h.refundable_cents > 0 ? (
                    <Button size="sm" variant="ghost" onClick={() => setRefundTarget(h)} disabled={busy !== null} data-testid={`button-refund-${h.id}`}>
                      <RotateCcw className="size-3.5" />
                      Refund
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>

      <RefundDialog
        entry={refundTarget}
        busy={busy === 'refund'}
        onClose={() => setRefundTarget(null)}
        onConfirm={async (amountCents, reason) => {
          const ok = await run('refund', () => refundPayment({ historyId: refundTarget.id, amountCents, reason }), (r) =>
            notifyDone('Refund issued', `${formatUsd(r.refundedCents)} is on its way back to the card.`),
          )
          if (ok) setRefundTarget(null)
        }}
      />
      <CancelDialog
        open={cancelOpen}
        busy={busy === 'cancel'}
        termEnd={link.agreement_end}
        onClose={() => setCancelOpen(false)}
        onConfirm={async (when) => {
          const ok = await run('cancel', () => cancelSubscription({ linkId: link.id, when }), () =>
            notifyDone(when === 'now' ? 'Subscription canceled' : 'Cancellation scheduled', when === 'now' ? 'Portal access has been shut off.' : 'Access continues until the end of the term.'),
          )
          if (ok) setCancelOpen(false)
        }}
      />
      <BillingDateDialog
        open={dateOpen}
        busy={busy === 'date'}
        current={link.next_payment_at}
        onClose={() => setDateOpen(false)}
        onConfirm={async (date) => {
          const ok = await run('date', () => changeBillingDate({ linkId: link.id, date }), (r) =>
            notifyDone('Billing date changed', `Next charge on ${formatDay(r.nextPaymentAt)}.`),
          )
          if (ok) setDateOpen(false)
        }}
      />
    </Card>
  )
}

function RefundDialog({ entry, busy, onClose, onConfirm }: { entry: any | null; busy: boolean; onClose: () => void; onConfirm: (amountCents: number | null, reason: string) => void }) {
  const [mode, setMode] = useState<'full' | 'partial'>('full')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const max = entry?.refundable_cents ?? 0
  const partialCents = Math.round(Number(amount) * 100)
  const invalid = mode === 'partial' && (!Number.isFinite(partialCents) || partialCents <= 0 || partialCents > max)
  return (
    <Dialog open={Boolean(entry)} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent data-testid="refund-dialog">
        <DialogHeader>
          <DialogTitle>Refund payment</DialogTitle>
          <DialogDescription>
            {entry ? `${entry.description} · ${formatUsd(entry.amount_cents)} · up to ${formatUsd(max)} refundable.` : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={mode === 'full' ? 'default' : 'outline'} onClick={() => setMode('full')} data-testid="refund-mode-full">
              Full refund ({formatUsd(max)})
            </Button>
            <Button type="button" size="sm" variant={mode === 'partial' ? 'default' : 'outline'} onClick={() => setMode('partial')} data-testid="refund-mode-partial">
              Partial
            </Button>
          </div>
          {mode === 'partial' ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="refund-amount">Amount (USD)</Label>
              <Input id="refund-amount" type="number" min="0.01" step="0.01" max={max / 100} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" data-testid="input-refund-amount" />
            </div>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="refund-reason">Reason (optional, shown in history)</Label>
            <Input id="refund-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. duplicate charge" data-testid="input-refund-reason" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => onConfirm(mode === 'full' ? null : partialCents, reason)} disabled={busy || invalid} data-testid="button-confirm-refund">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
            {mode === 'full' ? 'Refund in full' : `Refund ${Number.isFinite(partialCents) && partialCents > 0 ? formatUsd(partialCents) : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CancelDialog({ open, busy, termEnd, onClose, onConfirm }: { open: boolean; busy: boolean; termEnd: string | null; onClose: () => void; onConfirm: (when: 'term_end' | 'now') => void }) {
  const [when, setWhen] = useState<'term_end' | 'now'>('term_end')
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent data-testid="cancel-dialog">
        <DialogHeader>
          <DialogTitle>Cancel subscription</DialogTitle>
          <DialogDescription>Choose when the subscription ends. This is recorded with your name in the payment history.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setWhen('term_end')}
            data-testid="cancel-option-term-end"
            className={`rounded-md border px-4 py-3 text-left text-sm ${when === 'term_end' ? 'border-primary bg-primary/5' : 'border-border'}`}
          >
            <span className="font-medium">At the end of the term</span>
            <span className="block text-xs text-muted-foreground">
              {termEnd ? `Access and billing continue through ${formatDay(termEnd)}, then stop.` : 'Access continues through the current period, then stops.'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setWhen('now')}
            data-testid="cancel-option-now"
            className={`rounded-md border px-4 py-3 text-left text-sm ${when === 'now' ? 'border-destructive bg-destructive/5' : 'border-border'}`}
          >
            <span className="font-medium text-destructive">Immediately</span>
            <span className="block text-xs text-muted-foreground">Stops billing and shuts off portal access for the owner and staff right now. No refund is issued.</span>
          </button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Keep subscription</Button>
          <Button variant={when === 'now' ? 'destructive' : 'default'} onClick={() => onConfirm(when)} disabled={busy} data-testid="button-confirm-cancel">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Ban className="size-4" />}
            {when === 'now' ? 'Cancel now' : 'Schedule cancellation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function BillingDateDialog({ open, busy, current, onClose, onConfirm }: { open: boolean; busy: boolean; current: string | null; onClose: () => void; onConfirm: (isoDate: string) => void }) {
  const [value, setValue] = useState('')
  const iso = value ? new Date(`${value}T12:00:00`).toISOString() : ''
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent data-testid="billing-date-dialog">
        <DialogHeader>
          <DialogTitle>Change next billing date</DialogTitle>
          <DialogDescription>
            Currently {formatDay(current)}. Nothing is charged until the new date; the monthly cycle then repeats from that day.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="billing-date">New billing date</Label>
          <Input id="billing-date" type="date" value={value} onChange={(e) => setValue(e.target.value)} data-testid="input-billing-date" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => onConfirm(iso)} disabled={busy || !iso} data-testid="button-confirm-billing-date">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <CalendarClock className="size-4" />}
            Move billing date
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
