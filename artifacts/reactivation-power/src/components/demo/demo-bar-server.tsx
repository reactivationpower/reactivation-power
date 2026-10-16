// @ts-nocheck
import { DemoBar } from './demo-bar'
import { usePageData } from '@/hooks/use-page-data'
import { PageError } from '@/components/page-status'

/**
 * Renders the demo strip only when the signed-in participant belongs to the
 * demo account.
 *
 * Rendering is READ-ONLY. If the data was seeded on a previous Eastern day
 * (a tab left open overnight) we tell the client bar, which asks for a
 * rebuild through the locked `refreshDemoIfStale` action. A failed lookup is
 * deliberately NOT treated as stale: an API blip that made this component
 * rebuild inline on every page render once produced four overlapping rebuilds.
 */
export function DemoBarServer() {
  const { data, loading, error } = usePageData<any>('/portal/_layout')
  if (loading) return null
  if (error) return <PageError error={error} />
  if (!data?.demo) return null
  return <DemoBar {...data.demo} />
}
