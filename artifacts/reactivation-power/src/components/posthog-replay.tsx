import { useEffect } from 'react'
import { useLocation } from 'wouter'
import { enterPublicPage, leavePublicPage } from '@/lib/posthog-replay'
import { isPublicPagePath } from '@/lib/posthog-public-pages'

/**
 * Starts PostHog after a public page has rendered (effects run after the DOM
 * is updated) and keeps it off everywhere else. Switching off before a private
 * page renders is done by the route guard installed in main.tsx.
 */
export function PostHogReplay() {
  const [location] = useLocation()
  useEffect(() => {
    if (isPublicPagePath(location)) enterPublicPage()
    else leavePublicPage()
  }, [location])
  return null
}
