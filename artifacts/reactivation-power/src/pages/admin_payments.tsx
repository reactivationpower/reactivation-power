// @ts-nocheck
import { PaymentsManager } from '@/components/admin/payments-manager'
import { usePageData } from '@/hooks/use-page-data'
import { PageError, PageLoading } from '@/components/page-status'


export default function AdminPaymentsPage() {
  const { data, loading, error } = usePageData<any>('/admin/payments')
  if (loading) return <PageLoading />
  if (error) return <PageError error={error} />
  const { links, stripeMode } = data

  return (
    <div className="flex h-full flex-col gap-6">
      <header>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-foreground">Payments</h1>
          {stripeMode === 'test' ? (
            <span
              className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800"
              title="Payments run against your Stripe Sandbox. Test cards work; nothing real is charged. Set STRIPE_MODE=live to switch."
            >
              Stripe test mode
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Everyone who has been sent a payment link for Reactivation Power
          Access. Open a row for the full account record, or use the row menu
          for quick actions.
        </p>
      </header>
      <div className="min-h-0 flex-1">
        <PaymentsManager initialLinks={links} />
      </div>
    </div>
  )
}
