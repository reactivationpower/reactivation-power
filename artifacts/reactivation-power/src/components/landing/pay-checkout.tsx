// @ts-nocheck

import { useCallback } from 'react'
import { useLocation, useParams } from "wouter";
import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from '@stripe/react-stripe-js'
import { stripePromise } from '@/lib/stripe-client'

import { confirmPayment, startPaymentCheckout } from '@/app/actions/payments'


export function PayCheckout({ token }: { token: string }) {
  const [, setLocation] = useLocation();

  const fetchClientSecret = useCallback(
    () =>
      startPaymentCheckout(token).then((secret) => {
        if (!secret) throw new Error('This payment link is no longer active.')
        return secret
      }),
    [token],
  )

  const handleComplete = useCallback(() => {
    // Verify the payment with Stripe server-side, then show the thank-you page
    void confirmPayment(token).then(() => {
      setLocation(`/pay/${token}/thank-you`)
    })
  }, [token, setLocation])

  if (!stripePromise) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive"
      >
        Payment checkout is unavailable because Stripe has not been configured.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <EmbeddedCheckoutProvider
        stripe={stripePromise}
        options={{ fetchClientSecret, onComplete: handleComplete }}
      >
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  )
}
