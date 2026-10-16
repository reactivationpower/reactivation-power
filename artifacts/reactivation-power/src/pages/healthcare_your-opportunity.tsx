// @ts-nocheck
import { useSearch } from 'wouter'
import { usePageData } from '@/hooks/use-page-data'
import { PageError, PageLoading } from '@/components/page-status'

export default function YourOpportunityRedirect() {
  const searchParams = new URLSearchParams(useSearch())
  const query = Object.fromEntries(searchParams.entries())
  const { loading, error } = usePageData<any>(
    '/healthcare/your-opportunity',
    query,
  )
  if (loading) return <PageLoading />
  if (error) return <PageError error={error} />
  return null
}
