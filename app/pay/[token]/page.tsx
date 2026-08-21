import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { getPaymentLinkPublic } from '@/app/actions/payments'
import { PayCheckout } from '@/components/landing/pay-checkout'

export const metadata: Metadata = {
  title: 'Complete Your Payment — Reactivation Power',
  description: 'Secure checkout for Reactivation Power Access.',
  robots: { index: false, follow: false },
}

function formatUsd(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  })
}

export default async function PayPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const link = await getPaymentLinkPublic(token)
  if (!link) notFound()
  if (link.status === 'paid') redirect(`/pay/${token}/thank-you`)

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
        <header className="flex flex-col items-center gap-4 text-center">
          <Link href="/">
            <Image
              src="/images/logo.png"
              alt="Reactivation Power"
              width={1177}
              height={480}
              className="h-12 w-auto"
            />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-balance text-foreground">
              Complete your payment
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Prepared for {link.name}
            </p>
          </div>
          <div className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
            <div className="text-left">
              <p className="text-sm font-semibold text-foreground">
                Reactivation Power Access
              </p>
              <p className="text-xs text-muted-foreground">One-time payment</p>
            </div>
            <p className="text-xl font-semibold text-foreground">
              {formatUsd(link.amountCents)}
            </p>
          </div>
        </header>

        <PayCheckout token={token} />

        <p className="text-center text-xs text-muted-foreground">
          Payments are processed securely by Stripe. Your card details never
          touch our servers.
        </p>
      </div>
    </main>
  )
}
