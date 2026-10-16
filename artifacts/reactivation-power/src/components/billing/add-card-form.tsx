// @ts-nocheck
import { useEffect, useState } from 'react'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { AlertCircle, CreditCard, Loader2, ShieldCheck } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { stripePromise } from '@/lib/stripe-client'

const APPEARANCE = {
  theme: 'stripe',
  variables: {
    colorPrimary: '#1d3d47',
    borderRadius: '8px',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
  },
} as const

export interface AddCardResult {
  ok: boolean
  error?: string
  duplicate?: boolean
  card?: { brand: string; last4: string }
  collected?: { ok: boolean; paidCents: number; remainingCents: number; message: string | null } | null
}

/**
 * Stripe Elements form that saves a new card as the primary card.
 * `start` returns a SetupIntent client secret; `record` tells the server to
 * verify it and store the card. The previous primary becomes the backup
 * unless the customer ticks "stop using my current card".
 */
export function AddCardForm({
  start,
  record,
  currentPrimary,
  onSaved,
  onCancel,
}: {
  start: () => Promise<{ ok: boolean; clientSecret?: string; error?: string }>
  record: (input: { retirePrevious: boolean }) => Promise<AddCardResult>
  currentPrimary: { brand: string; last4: string } | null
  onSaved: (result: AddCardResult) => void
  onCancel?: () => void
}) {
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setClientSecret(null)
    start()
      .then((res) => {
        if (cancelled) return
        if (!res.ok || !res.clientSecret) setLoadError(res.error || 'Could not start the card form.')
        else setClientSecret(res.clientSecret)
      })
      .catch((err) => !cancelled && setLoadError(err instanceof Error ? err.message : 'Could not start the card form.'))
    return () => {
      cancelled = true
    }
  }, [attempt]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loadError) {
    return (
      <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        {loadError}
      </div>
    )
  }
  if (!clientSecret) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-border bg-card p-8 text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Preparing secure card form…
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3" data-testid="add-card-form">
      {notice ? (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{notice}</span>
        </div>
      ) : null}
      <Elements key={clientSecret} stripe={stripePromise} options={{ clientSecret, appearance: APPEARANCE }}>
        <CardFields
          record={record}
          currentPrimary={currentPrimary}
          onCancel={onCancel}
          onDuplicate={(msg) => {
            setNotice(msg)
            setAttempt((n) => n + 1)
          }}
          onSaved={onSaved}
        />
      </Elements>
    </div>
  )
}

function CardFields({ record, currentPrimary, onSaved, onCancel, onDuplicate }) {
  const stripe = useStripe()
  const elements = useElements()
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retirePrevious, setRetirePrevious] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    setBusy(true)
    setError(null)
    try {
      const confirm = await stripe.confirmSetup({
        elements,
        redirect: 'if_required',
        confirmParams: { return_url: window.location.href },
      })
      if (confirm.error) {
        setError(confirm.error.message ?? 'Your card could not be saved.')
        return
      }
      const res = await record({ retirePrevious })
      if (!res.ok) {
        if (res.duplicate) onDuplicate(res.error)
        else setError(res.error || 'Your card could not be saved.')
        return
      }
      onSaved(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Your card could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <PaymentElement onReady={() => setReady(true)} options={{ layout: 'tabs' }} />
      {currentPrimary ? (
        <label className="flex items-start gap-2 text-sm text-foreground">
          <Checkbox
            checked={retirePrevious}
            onCheckedChange={(v) => setRetirePrevious(Boolean(v))}
            className="mt-0.5"
            data-testid="checkbox-retire-previous"
          />
          <span>
            Stop using my current card ({currentPrimary.brand} •••• {currentPrimary.last4}).
            <span className="block text-xs text-muted-foreground">
              Leave unchecked to keep it on file as your backup card. Cards are never deleted from your account.
            </span>
          </span>
        </label>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={!stripe || !ready || busy} data-testid="button-save-card">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}
          Save as my primary card
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        ) : null}
        <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5" /> Secured by Stripe
        </span>
      </div>
    </form>
  )
}
