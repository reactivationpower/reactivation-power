// @ts-nocheck
import { usePageData } from '@/hooks/use-page-data'
import { PageError, PageLoading } from '@/components/page-status'

export default function LegacyReactivationRedirect() {
  const { loading, error } = usePageData<any>('/portal/reactivation')
  if (loading) return <PageLoading />
  if (error) return <PageError error={error} />
  return null
}
