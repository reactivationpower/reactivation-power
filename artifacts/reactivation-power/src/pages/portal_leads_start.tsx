import { usePageData } from '@/hooks/use-page-data'
import { PageError, PageLoading } from '@/components/page-status'
import { WelcomeHome } from '@/components/portal/welcome-home'

export default function LeadWelcomePage() {
  const { data, loading, error } = usePageData<{ isOwner: boolean }>('/portal/leads/start')
  if (loading) return <PageLoading />
  if (error) return <PageError error={error} />
  return <WelcomeHome product="lead" isOwner={data!.isOwner} />
}