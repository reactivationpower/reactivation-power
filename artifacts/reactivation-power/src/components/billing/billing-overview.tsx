// @ts-nocheck
import { useState } from 'react'
import { AlertTriangle, Ban, CalendarClock, CheckCircle2, CreditCard, Loader2, Plus, ReceiptText, RefreshCw } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { notifyDone, notifyError } from '@/lib/notify'
import { AddCardForm, type AddCardResult } from './add-card-form'

export function formatUsd(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}
export function formatDay(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { dateStyle: 'long' })
}

const STATUS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  none: { label: 'Not started', variant: 'secondary' },
  setup_paid: { label: 'Setup paid', variant: 'secondary' },
  trialing: { label: 'Active · first month', variant: 'default' },
  active: { label: 'Active', variant: 'default' },
  past_due: { label: 'Past due · access paused', variant: 'destructive' },
  canceled: { label: 'Canceled', variant: 'outline' },
  paid: { label: 'Paid in full', variant: 'default' },
}

export interface BillingActions {
  pay: () => Promise<any>
  startCard: () => Promise<any>
  recordCard: (input: { retirePrevious: boolean }) => Promise<AddCardResult>
}

/**
 * The customer's billing overview: status, next payment and agreement dates,
 * outstanding balance with "pay now", and the cards on file with an inline
 * "add a card" form. Used by both the public token page and /portal/billing.
 */
export function BillingOverview({
  overview,
  actions,
  onChanged,
  children,
}: {
  overview: any
  actions: BillingActions
  onChanged: () => void
  children?: React.ReactNode
}) {
  const [paying, setPaying] = useState(false)
  const [adding, setAdding] = useState(false)
  const { customer, agreement, balance, cards, obligation, access_blocked } = overview
  const status = STATUS[customer.billing_status] ?? { label: customer.billing_status, variant: 'secondary' }
  const activeCards = cards.filter((c) => c.active)
  const inactiveCards = cards.filter((c) => !c.active)
  const primary = activeCards.find((c) => c.rank === 'primary') ?? null
  const scheduledCancel = Boolean(agreement?.cancel_at) && agreement?.subscription_status !== 'canceled'
  const subscriptionOver = agreement?.subscription_status === 'canceled'

  async function payNow() {
    setPaying(true)
    try {
      const res = await actions.pay()
      if (!res?.ok) {
        notifyError(res?.error || 'Payment could not be processed.')
        return
      }
      const c = res.collected
      if (c.ok) {
        notifyDone(c.paidCents > 0 ? `Paid ${formatUsd(c.paidCents)}` : 'Nothing outstanding', 'Your account is in good standing and portal access is on.')
      } else {
        notifyError('Payment did not go through', c.message || `${formatUsd(c.remainingCents)} is still outstanding. Try adding a different card.`)
      }
      onChanged()
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Payment could not be processed.')
    } finally {
      setPaying(false)
    }
  }

  function cardSaved(res: AddCardResult) {
    setAdding(false)
    const c = res.collected
    if (c && c.paidCents > 0 && c.ok) {
      notifyDone(`Card saved and ${formatUsd(c.paidCents)} paid`, 'Your new card is primary and portal access is restored.')
    } else if (c && !c.ok) {
      notifyError('Card saved, but the balance is still unpaid', c.message || 'The new card was declined for the open invoice.')
    } else {
      notifyDone('Card saved', `${res.card?.brand} •••• ${res.card?.last4} is now your primary card.`)
    }
    onChanged()
  }

  return (
    <div className="flex flex-col gap-5" data-testid="billing-overview">
      {access_blocked && customer.billing_status === 'past_due' ? (
        <div role="alert" data-testid="billing-blocked-banner" className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div>
            <p className="font-semibold text-destructive">Portal access is paused</p>
            <p className="text-muted-foreground">
              {customer.billing_issue || 'Your most recent payment did not go through.'} Pay the balance below or add a card that works — access for you and your team comes back the moment a payment succeeds.
            </p>
          </div>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ReceiptText className="size-4 text-muted-foreground" />
              Subscription
            </CardTitle>
            <Badge variant={status.variant} data-testid="billing-status">{status.label}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {agreement ? (
            <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <Fact label="Monthly" value={agreement.monthly_cents ? `${formatUsd(agreement.monthly_cents)}/mo` : '—'} />
              <Fact label={scheduledCancel || subscriptionOver ? 'Payments' : 'Next payment'} value={subscriptionOver ? 'No further payments' : agreement.next_payment_at ? formatDay(agreement.next_payment_at) : '—'} testId="next-payment" />
              <Fact label="Agreement started" value={formatDay(agreement.agreement_start)} />
              <Fact label="Agreement ends" value={formatDay(agreement.agreement_end)} testId="agreement-end" />
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">No subscription is attached to this account yet.</p>
          )}
          {scheduledCancel ? (
            <p className="mt-4 flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm" data-testid="cancel-scheduled">
              <Ban className="size-4 text-muted-foreground" />
              Cancellation scheduled — your subscription ends on {formatDay(agreement.cancel_at)}.
              {obligation.payments > 0 ? ` ${obligation.payments} payment${obligation.payments === 1 ? '' : 's'} of ${formatUsd(obligation.monthly_cents)} remain before then.` : ''}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card data-testid="balance-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="size-4 text-muted-foreground" />
            Outstanding balance
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {balance.stripe_error ? (
            <p className="text-sm text-destructive" role="alert">{balance.stripe_error}</p>
          ) : balance.total_cents > 0 ? (
            <>
              <p className="text-2xl font-semibold tabular-nums" data-testid="balance-total">{formatUsd(balance.total_cents)}</p>
              <ul className="divide-y divide-border rounded-md border border-border text-sm">
                {balance.invoices.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span>
                      {inv.description}
                      <span className="block text-xs text-muted-foreground">Due {formatDay(inv.dueAt)}</span>
                    </span>
                    <span className="tabular-nums font-medium">{formatUsd(inv.amountDueCents)}</span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={payNow} disabled={paying || activeCards.length === 0} data-testid="button-pay-now">
                  {paying ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                  Pay {formatUsd(balance.total_cents)} now
                </Button>
                <span className="text-xs text-muted-foreground">
                  {activeCards.length === 0 ? 'Add a card first.' : 'Charges your primary card, then your backup card if needed.'}
                </span>
              </div>
            </>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="balance-clear">
              <CheckCircle2 className="size-4 text-success" /> Nothing is owed right now.
            </p>
          )}
        </CardContent>
      </Card>

      <Card data-testid="cards-card">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="size-4 text-muted-foreground" />
              Cards on file
            </CardTitle>
            {!adding ? (
              <Button size="sm" variant="outline" onClick={() => setAdding(true)} data-testid="button-add-card">
                <Plus className="size-4" /> Add a new card
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {activeCards.length === 0 ? (
            <p className="text-sm text-muted-foreground">No card on file.</p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {activeCards.map((c) => (
                <CardRow key={c.id} card={c} />
              ))}
            </ul>
          )}
          {inactiveCards.length > 0 ? (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">Previous cards ({inactiveCards.length}) — kept on file, not charged</summary>
              <ul className="mt-2 divide-y divide-border rounded-md border border-border">
                {inactiveCards.map((c) => (
                  <CardRow key={c.id} card={c} />
                ))}
              </ul>
            </details>
          ) : null}
          {adding ? (
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="mb-3 text-sm font-medium">New card</p>
              <AddCardForm
                start={actions.startCard}
                record={actions.recordCard}
                currentPrimary={primary ? { brand: primary.brand, last4: primary.last4 } : null}
                onSaved={cardSaved}
                onCancel={() => setAdding(false)}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {children}
    </div>
  )
}

function Fact({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground" data-testid={testId}>{value}</dd>
    </div>
  )
}

function CardRow({ card }) {
  return (
    <li className="flex items-center justify-between gap-4 px-4 py-2.5" data-testid={`card-${card.last4}`}>
      <span className="flex items-center gap-2 text-sm font-medium capitalize">
        <CreditCard className="size-4 text-muted-foreground" />
        {card.brand} •••• {card.last4}
        {card.exp_month && card.exp_year ? (
          <span className="text-xs font-normal text-muted-foreground">
            exp {String(card.exp_month).padStart(2, '0')}/{String(card.exp_year).slice(-2)}
          </span>
        ) : null}
      </span>
      {card.active ? (
        <Badge variant={card.rank === 'primary' ? 'default' : 'secondary'}>{card.rank === 'primary' ? 'Primary' : 'Backup'}</Badge>
      ) : (
        <Badge variant="outline">Inactive</Badge>
      )}
    </li>
  )
}
