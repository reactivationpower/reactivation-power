// @ts-nocheck

import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'wouter'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { AlertCircle, Check, CreditCard, Loader2, ShieldCheck } from 'lucide-react'

import {
  getSubscriptionCheckoutState,
  recordPrimaryCard,
  recordSecondaryCard,
  type SubscriptionCheckoutState,
} from '@/app/actions/subscriptions'
import { Button } from '@/components/ui/button'
import { stripePromise } from '@/lib/stripe-client'

function formatUsd(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

const APPEARANCE = {
  theme: 'stripe',
  variables: {
    colorPrimary: '#1d3d47',
    borderRadius: '8px',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
  },
} as const

/**
 * Two-step card collection for a subscription link:
 *   1. primary card (pays the setup fee, or is saved when the fee is waived)
 *   2. backup card (must be a different card — Stripe fingerprints are compared server-side)
 * The server owns every amount and Stripe object; this component only
 * confirms the intent it is handed and reports back with the token.
 */
export function SubscriptionCheckout({ token }: { token: string }) {
  const [, setLocation] = useLocation()
  const [state, setState] = useState<SubscriptionCheckoutState | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const next = await getSubscriptionCheckoutState(token)
      if (!next) {
        setLoadError('This payment link is no longer active.')
        return
      }
      if (next.stage === 'done') {
        setLocation(`/pay/${token}/thank-you`)
        return
      }
      if (next.error) setNotice(next.error)
      setState(next)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not start checkout.')
    }
  }, [token, setLocation])

  useEffect(() => {
    void load()
  }, [load])

  if (loadError) {
    return (
      <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
        {loadError}
      </div>
    )
  }
  if (!state || !state.clientSecret) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-border bg-card p-10 text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Preparing secure checkout…
      </div>
    )
  }

  const isPrimary = state.stage === 'primary'

  return (
    <div className="flex flex-col gap-4">
      <StepHeader stage={state.stage} primaryCard={state.primaryCard} />

      {notice ? (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{notice}</span>
        </div>
      ) : null}

      <div className="rounded-lg border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {isPrimary ? 'Primary card' : 'Backup card'}
            </p>
            <p className="text-xs text-muted-foreground">
              {isPrimary
                ? state.setupFeeCents > 0
                  ? `Charged ${formatUsd(state.setupFeeCents)} today, then ${formatUsd(state.monthlyCents)}/month starting in 30 days.`
                  : `Saved today — nothing is charged now. ${formatUsd(state.monthlyCents)}/month starts in 30 days.`
                : 'Only used if your primary card cannot be charged. Must be a different card.'}
            </p>
          </div>
          <CreditCard className="size-5 text-muted-foreground" aria-hidden="true" />
        </div>
        <Elements
          key={state.clientSecret}
          stripe={stripePromise}
          options={{ clientSecret: state.clientSecret, appearance: APPEARANCE }}
        >
          <CardStep
            token={token}
            state={state}
            onNotice={setNotice}
            onAdvance={(keepNotice = false) => {
              if (!keepNotice) setNotice(null)
              setState(null)
              void load()
            }}
            onDone={() => setLocation(`/pay/${token}/thank-you`)}
          />
        </Elements>
      </div>
    </div>
  )
}

function StepHeader({
  stage,
  primaryCard,
}: {
  stage: 'primary' | 'secondary'
  primaryCard: { brand: string; last4: string } | null
}) {
  const steps = [
    { label: 'Primary card', done: stage === 'secondary', active: stage === 'primary' },
    { label: 'Backup card', done: false, active: stage === 'secondary' },
  ]
  return (
    <ol className="flex items-center gap-3 text-sm">
      {steps.map((s, i) => (
        <li key={s.label} className="flex items-center gap-2">
          <span
            className={`flex size-6 items-center justify-center rounded-full text-xs font-semibold ${
              s.done
                ? 'bg-success text-white'
                : s.active
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
            }`}
          >
            {s.done ? <Check className="size-3.5" /> : i + 1}
          </span>
          <span className={s.active || s.done ? 'font-medium text-foreground' : 'text-muted-foreground'}>
            {s.label}
            {s.done && primaryCard ? (
              <span className="ml-1 text-xs text-muted-foreground">
                ({primaryCard.brand} •••• {primaryCard.last4})
              </span>
            ) : null}
          </span>
          {i < steps.length - 1 ? <span className="mx-1 h-px w-8 bg-border" /> : null}
        </li>
      ))}
    </ol>
  )
}

function CardStep({
  token,
  state,
  onNotice,
  onAdvance,
  onDone,
}: {
  token: string
  state: SubscriptionCheckoutState
  onNotice: (msg: string | null) => void
  onAdvance: (keepNotice?: boolean) => void
  onDone: () => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  const isPrimary = state.stage === 'primary'
  const returnUrl = `${window.location.origin}/pay/${token}`

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    setError(null)
    onNotice(null)
    setSubmitting(true)
    try {
      const confirm =
        state.intentType === 'payment'
          ? await stripe.confirmPayment({
              elements,
              redirect: 'if_required',
              confirmParams: { return_url: returnUrl },
            })
          : await stripe.confirmSetup({
              elements,
              redirect: 'if_required',
              confirmParams: { return_url: returnUrl },
            })
      if (confirm.error) {
        setError(confirm.error.message ?? 'Your card could not be processed.')
        return
      }

      const res = isPrimary ? await recordPrimaryCard(token) : await recordSecondaryCard(token)
      if (!res.ok) {
        if (res.duplicate) {
          // Server discarded the duplicate; fetch a fresh SetupIntent and show why
          onNotice(res.error)
          onAdvance(true)
          return
        }
        setError(res.error ?? 'Something went wrong. Please try again.')
        return
      }
      if (res.stage === 'done') onDone()
      else onAdvance()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const cta = isPrimary
    ? state.setupFeeCents > 0
      ? `Pay ${formatUsd(state.setupFeeCents)} and continue`
      : 'Save card and continue'
    : 'Add backup card and start subscription'

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <PaymentElement
        options={{ layout: 'tabs', terms: { card: 'never' } }}
        onReady={() => setReady(true)}
      />
      {error ? (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={!stripe || !elements || !ready || submitting} className="w-full">
        {submitting ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {isPrimary ? 'Processing…' : 'Saving card…'}
          </>
        ) : (
          cta
        )}
      </Button>
      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5" aria-hidden="true" />
        Cards are stored by Stripe. Your backup card is only charged if the primary fails.
      </p>
    </form>
  )
}
