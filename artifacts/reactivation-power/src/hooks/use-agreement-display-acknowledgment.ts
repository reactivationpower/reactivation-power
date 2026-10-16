import { useEffect } from 'react'
import { acknowledgeAgreementDisplay } from '@/app/actions/agreements'

/** Both public signing flows acknowledge actual document display, not a loader
 * or presumed viewer identity. Server-side scope suppresses staff previews. */
export function useAgreementDisplayAcknowledgment(token: string, version: number, disabled: boolean) {
  useEffect(() => {
    if (disabled) return
    let pending = false
    let disposed = false
    let acknowledged = false
    const acknowledge = async (event: Event) => {
      if (!event.isTrusted || document.hidden || pending || acknowledged) return
      const article = document.querySelector('[data-agreement-document]')
      if (!article) return
      const rect = article.getBoundingClientRect()
      if (rect.bottom <= 0 || rect.top >= window.innerHeight) return
      pending = true
      try {
        const result = await acknowledgeAgreementDisplay(token, version)
        if (!disposed && result.ok) acknowledged = true
      } catch { /* retry on the next human interaction, never a loader */ }
      finally { pending = false }
    }
    window.addEventListener('pointerdown', acknowledge, { capture: true })
    window.addEventListener('keydown', acknowledge, { capture: true })
    return () => {
      disposed = true
      window.removeEventListener('pointerdown', acknowledge, true)
      window.removeEventListener('keydown', acknowledge, true)
    }
  }, [token, version, disabled])
}
