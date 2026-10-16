import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { MarketingAnalytics } from './analytics-consent'
vi.mock('wouter', () => ({ useLocation: () => ['/'] }))
describe('analytics UI removal and retained privacy gates', () => {
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); vi.restoreAllMocks() })
  it.each(['unknown', 'denied', 'dnt', 'gpc'])('renders no controls and sends no behavioral requests for %s', async choice => {
    if (choice !== 'unknown') localStorage.setItem('pp_marketing_consent', choice === 'denied' ? 'denied' : 'granted')
    Object.defineProperty(navigator, 'doNotTrack', { configurable: true, value: choice === 'dnt' ? '1' : undefined })
    Object.defineProperty(navigator, 'globalPrivacyControl', { configurable: true, value: choice === 'gpc' })
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetcher)
    const { container, unmount } = render(<MarketingAnalytics />)
    await waitFor(() => expect(fetcher).toHaveBeenCalled())
    expect(container.innerHTML).toBe('')
    expect(fetcher.mock.calls.every(([url]) => String(url).endsWith('/registry'))).toBe(true)
    unmount()
  })
})
