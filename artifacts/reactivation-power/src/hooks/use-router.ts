import { useMemo } from 'react'
import { useLocation } from 'wouter'

const REFRESH_EVENT = 'page-data:refresh'

/**
 * Ask every mounted usePageData() hook to re-fetch its loader. This is the
 * SPA equivalent of Next's router.refresh() after a server action.
 */
export function refreshPageData(): void {
  window.dispatchEvent(new Event(REFRESH_EVENT))
}

export function subscribeToPageRefresh(listener: () => void): () => void {
  window.addEventListener(REFRESH_EVENT, listener)
  return () => window.removeEventListener(REFRESH_EVENT, listener)
}

/** Drop-in for next/navigation's useRouter, backed by wouter. */
export function useRouter() {
  const [, navigate] = useLocation()
  return useMemo(
    () => ({
      push: (href: string) => navigate(href),
      replace: (href: string) => navigate(href, { replace: true }),
      refresh: () => refreshPageData(),
      back: () => window.history.back(),
    }),
    [navigate],
  )
}
