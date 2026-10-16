import { useEffect, useRef } from 'react'
import { useLocation } from 'wouter'
import { captureAffiliateReferral } from '@/app/actions/affiliates'

/** Captures ?ref=code (on mount and on SPA navigation), awaits the server, then strips only ref. */
export function ReferralCapture() {
  const [location, navigate] = useLocation()
  const inflight = useRef<string | null>(null)
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('ref')?.trim()
    if (!code || inflight.current === code) return
    inflight.current = code
    ;(async () => {
      try { await captureAffiliateReferral(code) } catch { /* keep going; strip anyway to avoid loops */ }
      const u = new URL(window.location.href)
      if (u.searchParams.get('ref')?.trim() === code) {
        u.searchParams.delete('ref')
        window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash)
      }
      inflight.current = null
    })()
  }, [location, navigate])
  return null
}
