// @ts-nocheck
import { Link, useParams } from 'wouter'

import { payBalanceByToken, recordCardByToken, startCardUpdateByToken } from '@/app/actions/customer-billing'
import { BillingOverview } from '@/components/billing/billing-overview'
import { PageError, PageLoading } from '@/components/page-status'
import { usePageData } from '@/hooks/use-page-data'
import { useRouter } from '@/hooks/use-router'

/** Public billing page behind an emailed token; stays reachable when portal access is paused. */
export default function BillingTokenPage() {
  const { token } = useParams()
  const router = useRouter()
  const { data, loading, error, notFound } = usePageData<any>(`/billing/${token}`)
  if (loading) return <PageLoading />
  if (notFound) return <ExpiredLink />
  if (error) return <PageError error={error} />
  const { overview, purpose, stripeMode } = data

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
            <img src="/images/logo.png" alt="Reactivation Power" width={1177} height={480} className="h-12 w-auto" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{purpose === 'update_card' ? 'Add a new card' : 'Billing'}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {overview.customer.full_name}
              {overview.customer.business_name ? ` · ${overview.customer.business_name}` : ''}
            </p>
          </div>
        </header>
        <BillingOverview
          overview={overview}
          actions={{
            pay: () => payBalanceByToken(token),
            startCard: () => startCardUpdateByToken(token),
            recordCard: (input) => recordCardByToken(token, input),
          }}
          onChanged={() => router.refresh()}
        />
        <p className="text-center text-xs text-muted-foreground">
          To cancel your subscription, sign in and open <Link href="/portal/billing" className="underline">Portal → Billing</Link>.
        </p>
      </div>
    </main>
  )
}

function ExpiredLink() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-20 text-center">
        <h1 className="text-xl font-semibold">This billing link has expired</h1>
        <p className="text-sm text-muted-foreground">Billing links work for 14 days. Request a fresh one and we will email it to you.</p>
        <Link href="/billing" className="text-sm font-medium underline underline-offset-4" data-testid="link-request-new">
          Request a new link
        </Link>
      </div>
    </main>
  )
}
