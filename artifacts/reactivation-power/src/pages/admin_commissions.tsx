// @ts-nocheck
import { useSearch } from 'wouter'
import { CommissionsReport } from '@/components/admin/commissions-report'
import { usePageData } from '@/hooks/use-page-data'
import { PageError, PageLoading } from '@/components/page-status'

export default function AdminCommissionsPage() {
  const searchParams = new URLSearchParams(useSearch())
  const rep = searchParams.get('rep') ?? undefined
  const from = searchParams.get('from') ?? undefined
  const to = searchParams.get('to') ?? undefined
  const paid = searchParams.get('paid') ?? undefined
  const type = searchParams.get('type') ?? undefined
  const { data, loading, error } = usePageData<any>('/admin/commissions', { rep, from, to, paid, type })
  if (loading) return <PageLoading />
  if (error) return <PageError error={error} />
  const { report } = data

  return (
    <div className="flex h-full flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">Commissions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {report.canManage
            ? 'Every collected payment credited to the rep who sent the link, at their rate at the time of the sale. Override a rate or amount, and mark entries paid out once you have sent the money.'
            : 'Your sales and the commission owed on each, at your rate at the time of the sale. Refunds show as negative adjustments.'}
        </p>
      </header>
      <div className="min-h-0 flex-1">
        <CommissionsReport report={report} />
      </div>
    </div>
  )
}
