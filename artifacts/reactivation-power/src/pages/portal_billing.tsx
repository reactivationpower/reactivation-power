// @ts-nocheck
import { payMyBalance, recordMyCard, startMyCardUpdate } from '@/app/actions/customer-billing'
import { BillingOverview } from '@/components/billing/billing-overview'
import { CancelAgreement } from '@/components/billing/cancel-agreement'
import { PageError, PageLoading } from '@/components/page-status'
import { usePageData } from '@/hooks/use-page-data'
import { useRouter } from '@/hooks/use-router'

/** Owner's billing page inside the portal. */
export default function PortalBillingPage() {
  const router = useRouter()
  const { data, loading, error } = usePageData<any>('/portal/billing')
  if (loading) return <PageLoading />
  if (error) return <PageError error={error} />
  const { overview, isOwner, stripeMode } = data

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Billing</h1>
        <p className="text-sm text-muted-foreground">Your subscription, cards on file and agreement.</p>
      </div>
      {stripeMode === 'test' ? (
        <div className="rounded-md bg-amber-100 px-4 py-1.5 text-center text-xs font-semibold text-amber-900">
          Stripe test mode — use a test card (e.g. 4242 4242 4242 4242). No real charges.
        </div>
      ) : null}
      {!isOwner ? (
        <p className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground" data-testid="billing-owner-only">
          Billing is managed by the account owner. Ask them to open Portal → Billing.
        </p>
      ) : !overview ? (
        <p className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground" data-testid="billing-none">
          There is no subscription attached to this account.
        </p>
      ) : (
        <BillingOverview
          overview={overview}
          actions={{ pay: () => payMyBalance(), startCard: () => startMyCardUpdate(), recordCard: (input) => recordMyCard(input) }}
          onChanged={() => router.refresh()}
        >
          <CancelAgreement overview={overview} onChanged={() => router.refresh()} />
        </BillingOverview>
      )}
    </div>
  )
}
