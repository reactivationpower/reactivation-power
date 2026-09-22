// @ts-nocheck
import { useState } from 'react'
import { Ban, Loader2 } from 'lucide-react'

import { cancelMyAgreement } from '@/app/actions/customer-billing'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { notifyDone, notifyError } from '@/lib/notify'
import { formatDay, formatUsd } from './billing-overview'

/**
 * Owner-side cancellation: shows the agreement end date and what is still
 * owed under the agreement term, requires an explicit acknowledgement, then
 * schedules the cancellation for the end of the term.
 */
export function CancelAgreement({ overview, onChanged }: { overview: any; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [ack, setAck] = useState(false)
  const [busy, setBusy] = useState(false)
  const { agreement, obligation } = overview
  if (!agreement || agreement.type !== 'subscription' || agreement.subscription_status === 'canceled' || agreement.cancel_at) return null

  async function confirm() {
    setBusy(true)
    try {
      const res = await cancelMyAgreement({ acknowledged: ack })
      if (!res?.ok) {
        notifyError(res?.error || 'Could not schedule the cancellation.')
        return
      }
      notifyDone('Cancellation scheduled', `Your subscription ends on ${formatDay(res.cancelAt)}. We have let the team know.`)
      setOpen(false)
      onChanged()
    } catch (err) {
      notifyError(err instanceof Error ? err.message : 'Could not schedule the cancellation.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card data-testid="cancel-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Ban className="size-4 text-muted-foreground" />
          Cancel my subscription
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <p className="text-muted-foreground">
          Your {agreement.term_months ?? 12}-month agreement runs until <strong className="text-foreground">{formatDay(agreement.agreement_end)}</strong>. Cancelling stops the
          subscription from renewing after that date; the payments due until then continue as scheduled.
        </p>
        <div>
          <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => { setAck(false); setOpen(true) }} data-testid="button-cancel-agreement">
            <Ban className="size-4" /> Cancel at end of agreement
          </Button>
        </div>
      </CardContent>

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel at the end of your agreement?</DialogTitle>
            <DialogDescription>Please review what is still due under your agreement before confirming.</DialogDescription>
          </DialogHeader>
          <dl className="grid gap-3 rounded-md border border-border bg-muted/30 p-4 text-sm sm:grid-cols-3" data-testid="cancel-summary">
            <div>
              <dt className="text-xs text-muted-foreground">Agreement ends</dt>
              <dd className="font-medium" data-testid="cancel-agreement-end">{formatDay(agreement.agreement_end)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Remaining payments</dt>
              <dd className="font-medium" data-testid="cancel-remaining-count">
                {obligation.payments} × {formatUsd(obligation.monthly_cents)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Still owed</dt>
              <dd className="font-medium" data-testid="cancel-remaining-total">{formatUsd(obligation.total_cents)}</dd>
            </div>
          </dl>
          {obligation.dates.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Charged on {obligation.dates.map((d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })).join(', ')}.
              Your team keeps full portal access until {formatDay(agreement.agreement_end)}.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">No further payments are due. Your team keeps full portal access until {formatDay(agreement.agreement_end)}.</p>
          )}
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={ack} onCheckedChange={(v) => setAck(Boolean(v))} className="mt-0.5" data-testid="checkbox-acknowledge" />
            <span>
              I understand that the remaining {obligation.payments} payment{obligation.payments === 1 ? '' : 's'} ({formatUsd(obligation.total_cents)}) are still due under my
              agreement and will be charged as scheduled.
            </span>
          </label>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Keep my subscription
            </Button>
            <Button variant="destructive" onClick={confirm} disabled={!ack || busy} data-testid="button-confirm-cancel">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Ban className="size-4" />}
              Schedule cancellation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
