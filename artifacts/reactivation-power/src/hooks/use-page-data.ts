import { useCallback, useEffect, useState } from 'react'
import { loadPage, NotFoundError } from '@/lib/api'
import { subscribeToPageRefresh } from '@/hooks/use-router'

export interface PageDataState<T> {
  data: T | null
  loading: boolean
  error: Error | null
  notFound: boolean
  /** Re-fetch the loader (call after a mutation so the page reflects it). */
  reload: () => Promise<void>
}

/**
 * Fetch a page loader from GET /api/pages<path>. The loader mirrors what the
 * original server component computed; redirects (login guards) are followed
 * automatically by loadPage.
 *
 * `deps` should list everything that changes the request (route params,
 * search params) so the page re-fetches on navigation.
 */
export function usePageData<T>(
  path: string,
  query?: Record<string, string | undefined>,
): PageDataState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [notFound, setNotFound] = useState(false)
  const queryKey = JSON.stringify(query ?? {})

  const fetchData = useCallback(async () => {
    try {
      const result = await loadPage<T>(path, query)
      setData(result)
      setError(null)
      setNotFound(false)
    } catch (err) {
      if (err instanceof NotFoundError) {
        setNotFound(true)
      } else {
        setError(err instanceof Error ? err : new Error(String(err)))
      }
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, queryKey])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    loadPage<T>(path, query)
      .then((result) => {
        if (cancelled) return
        setData(result)
        setError(null)
        setNotFound(false)
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof NotFoundError) setNotFound(true)
        else setError(err instanceof Error ? err : new Error(String(err)))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, queryKey])

  // router.refresh() from any component re-fetches this page's loader.
  useEffect(() => subscribeToPageRefresh(() => void fetchData()), [fetchData])

  return { data, loading, error, notFound, reload: fetchData }
}
