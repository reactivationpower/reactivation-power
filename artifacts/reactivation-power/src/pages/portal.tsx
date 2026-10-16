import { usePageData } from '@/hooks/use-page-data'
import { PageError, PageLoading } from '@/components/page-status'
import { WelcomeHome } from '@/components/portal/welcome-home'

export default function PortalHomePage() {
  const { loading, error } = usePageData('/portal')
  if (loading) return <PageLoading />
  if (error) return <PageError error={error} />
  return <WelcomeHome product="reactivation" />
}