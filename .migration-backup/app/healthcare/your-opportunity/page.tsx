import { permanentRedirect } from 'next/navigation'

/**
 * The calculator used to live here as a step between the lead form and the
 * calendar. It now lives on the thank-you page after booking, so anyone
 * holding an old link (or refreshing mid-funnel) is sent on to the calendar
 * with their details intact.
 */
export default async function YourOpportunityRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') qs.set(key, value)
  }
  const query = qs.toString()
  permanentRedirect(`/healthcare/book-a-call${query ? `?${query}` : ''}`)
}
