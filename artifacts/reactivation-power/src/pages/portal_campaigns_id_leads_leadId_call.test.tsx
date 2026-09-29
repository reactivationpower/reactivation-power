// @vitest-environment jsdom
import { StrictMode } from 'react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LeadCallPage from './portal_campaigns_id_leads_leadId_call'
import { releaseLeadCallOnPageHide } from '@/app/actions/lead-followup'

const { usePageData, claim, renew, release } = vi.hoisted(() => ({
  usePageData: vi.fn(),
  claim: vi.fn(),
  renew: vi.fn(),
  release: vi.fn(),
}))
vi.mock('@/hooks/use-page-data', () => ({ usePageData }))
vi.mock('@/app/actions/lead-followup', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/app/actions/lead-followup')>(),
  claimLeadCall: claim,
  renewLeadCall: renew,
  releaseLeadCall: release,
}))
vi.mock('@/components/lead-followup/lead-call-screen', () => ({
  LeadCallScreen: ({ leaseToken }: { leaseToken: string }) => <div data-testid="claimed-script">{leaseToken}</div>,
}))

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('call page lease lifecycle', () => {
  it('uses credentialed keepalive when the beacon cannot be queued', () => {
    const oldBeacon = Object.getOwnPropertyDescriptor(navigator, 'sendBeacon')
    Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: vi.fn().mockReturnValue(false) })
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    try {
      releaseLeadCallOnPageHide('lead-fallback', 'token-fallback')
      expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/api\/actions\/lead-followup\/releaseLeadCall$/), expect.objectContaining({
        credentials: 'include', keepalive: true, method: 'POST',
        body: JSON.stringify({ args: ['lead-fallback', 'token-fallback'] }),
      }))
    } finally {
      vi.unstubAllGlobals()
      if (oldBeacon) Object.defineProperty(navigator, 'sendBeacon', oldBeacon)
      else Reflect.deleteProperty(navigator, 'sendBeacon')
    }
  })
  it('sends the authenticated release RPC before a hard navigation, without depending on the cleanup timer', async () => {
    const sendBeacon = vi.fn().mockReturnValue(true)
    const oldBeacon = Object.getOwnPropertyDescriptor(navigator, 'sendBeacon')
    Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: sendBeacon })
    claim.mockResolvedValue({ token: 'lease-123' })
    usePageData.mockReturnValue({ loading: false, data: {
      participant: { first_name: 'Morgan', role: 'staff' },
      campaign: { id: 'campaign-1', name: 'Offer' },
      lead: { id: 'lead-1' },
      flow: { steps: [], choices: [] }, calls: [], nextHref: null, now: new Date().toISOString(),
    } })
    try {
      render(<StrictMode><LeadCallPage /></StrictMode>)
      await waitFor(() => expect(screen.getByTestId('claimed-script').textContent).toBe('lease-123'))
      expect(claim).toHaveBeenCalledTimes(1)
      act(() => { window.dispatchEvent(new Event('pagehide')) })
      expect(sendBeacon).toHaveBeenCalledTimes(1)
      const [url, body] = sendBeacon.mock.calls[0] as [string, Blob]
      expect(url).toMatch(/\/api\/actions\/lead-followup\/releaseLeadCall$/)
      expect(body.type).toBe('application/json')
      const payload = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(reader.error)
        reader.readAsText(body)
      })
      expect(JSON.parse(payload)).toEqual({ args: ['lead-1', 'lease-123'] })
      // Browsers can restore a hidden page from the back/forward cache.
      act(() => { window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })) })
      expect(screen.queryByTestId('claimed-script')).toBeNull()
    } finally {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      cleanup()
      await act(async () => { await vi.advanceTimersByTimeAsync(301) })
      vi.useRealTimers()
      if (oldBeacon) Object.defineProperty(navigator, 'sendBeacon', oldBeacon)
      else Reflect.deleteProperty(navigator, 'sendBeacon')
    }
  })
  it('still releases normally after leaving the SPA call screen', async () => {
    claim.mockResolvedValue({ token: 'lease-456' })
    usePageData.mockReturnValue({ loading: false, data: {
      participant: { first_name: 'Morgan', role: 'staff' },
      campaign: { id: 'campaign-2', name: 'Offer' },
      lead: { id: 'lead-2' },
      flow: { steps: [], choices: [] }, calls: [], nextHref: null, now: new Date().toISOString(),
    } })
    render(<LeadCallPage />)
    await waitFor(() => expect(screen.getByTestId('claimed-script').textContent).toBe('lease-456'))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      cleanup()
      await act(async () => { await vi.advanceTimersByTimeAsync(301) })
      expect(release).toHaveBeenCalledWith('lead-2', 'lease-456')
    } finally { vi.useRealTimers() }
  })
  it('also queues a beacon when an SPA navigation is followed immediately by closing the tab', async () => {
    const sendBeacon = vi.fn().mockReturnValue(true)
    const oldBeacon = Object.getOwnPropertyDescriptor(navigator, 'sendBeacon')
    Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: sendBeacon })
    claim.mockResolvedValue({ token: 'lease-789' })
    usePageData.mockReturnValue({ loading: false, data: {
      participant: { first_name: 'Morgan', role: 'staff' },
      campaign: { id: 'campaign-3', name: 'Offer' },
      lead: { id: 'lead-3' },
      flow: { steps: [], choices: [] }, calls: [], nextHref: null, now: new Date().toISOString(),
    } })
    try {
      render(<LeadCallPage />)
      await waitFor(() => expect(screen.getByTestId('claimed-script').textContent).toBe('lease-789'))
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      cleanup()
      act(() => { window.dispatchEvent(new Event('pagehide')) })
      expect(sendBeacon).toHaveBeenCalledTimes(1)
      expect(sendBeacon.mock.calls[0][0]).toMatch(/\/api\/actions\/lead-followup\/releaseLeadCall$/)
    } finally {
      await act(async () => { await vi.advanceTimersByTimeAsync(301) })
      vi.useRealTimers()
      if (oldBeacon) Object.defineProperty(navigator, 'sendBeacon', oldBeacon)
      else Reflect.deleteProperty(navigator, 'sendBeacon')
    }
  })
})