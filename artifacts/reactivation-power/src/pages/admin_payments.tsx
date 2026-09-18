// @ts-nocheck
import { PaymentsManager } from '@/components/admin/payments-manager'
import { usePageData } from '@/hooks/use-page-data'
import { PageError, PageLoading } from '@/components/page-status'


export default function AdminPaymentsPage() {
  const { data, loading, error } = usePageData<any>('/admin/payments')
  if (loading) return <PageLoading />
  if (error) return <PageError error={error} />
  const { links } = data

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">Payments</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create custom payment links for Reactivation Power Access. Charge a
          card on our end, or share the link, open it, or show a QR code for
          the buyer to scan.
        </p>
      </header>
      <div className="min-h-0 flex-1">
        <PaymentsManager initialLinks={links} />
      </div>
    </div>
  )
}
