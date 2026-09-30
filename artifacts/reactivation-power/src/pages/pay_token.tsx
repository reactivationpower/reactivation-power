// @ts-nocheck
import { useParams } from 'wouter';

import { Link } from "wouter";
import { PayCheckout } from '@/components/landing/pay-checkout'
import { SubscriptionCheckout } from '@/components/landing/subscription-checkout'
import { usePageData } from '@/hooks/use-page-data'
import { PageError, PageLoading } from '@/components/page-status'
import NotFound from '@/pages/not-found'



function formatUsd(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD'})
}

export default function PayPage() {
  const params = useParams();

  const { token } = params
  const { data, loading, error, notFound } = usePageData<any>(`/pay/${token}`)
  if (loading) return <PageLoading />
  if (notFound) return <NotFound />
  if (error) return <PageError error={error} />
  const { link, stripeMode } = data
  const isSubscription = link.type === 'subscription'

  return (
    <main className="min-h-screen bg-background">
      {stripeMode === 'test' ? (
        <div className="bg-amber-100 px-4 py-1.5 text-center text-xs font-semibold text-amber-900">
          Stripe test mode — use a test card (e.g. 4242 4242 4242 4242). No real charges.
        </div>
      ) : null}
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
        <header className="flex flex-col items-center gap-4 text-center">
          <Link href="/">
            <img
              src="/images/patient-pipeline-logo.png"
              alt="Patient Pipeline"
              width={2172}
              height={724}
              className="h-12 w-auto"
            />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-balance text-foreground">
              {isSubscription ? 'Start your subscription' : 'Complete your payment'}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Prepared for {link.name}
              {link.businessName ? ` · ${link.businessName}` : ''}
            </p>
          </div>
          {isSubscription ? (
            <div className="grid w-full gap-2 rounded-lg border border-border bg-card px-4 py-3 text-left sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Due today</p>
                <p className="text-lg font-semibold text-foreground">
                  {link.setupFeeCents > 0 ? formatUsd(link.setupFeeCents) : '$0.00'}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {link.setupFeeCents > 0 ? 'Setup fee' : 'Setup fee waived'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Then monthly</p>
                <p className="text-lg font-semibold text-foreground">{formatUsd(link.monthlyCents)}</p>
                <p className="text-[11px] text-muted-foreground">First charge in 30 days</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Access</p>
                <p className="text-lg font-semibold text-foreground">Today</p>
                <p className="text-[11px] text-muted-foreground">12-month agreement</p>
              </div>
            </div>
          ) : (
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
          )}
        </header>

        {isSubscription ? <SubscriptionCheckout token={token} /> : <PayCheckout token={token} />}

        <p className="text-center text-xs text-muted-foreground">
          Payments are processed securely by Stripe. Your card details never
          touch our servers.
        </p>
      </div>
    </main>
  )
}
