'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'

import { confirmPayment, startPaymentCheckout } from '@/app/actions/payments'

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY as string,
)

export function PayCheckout({ token }: { token: string }) {
  const router = useRouter()

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
      router.push(`/pay/${token}/thank-you`)
    })
  }, [token, router])

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
