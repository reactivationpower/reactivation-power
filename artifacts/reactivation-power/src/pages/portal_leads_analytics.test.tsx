// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import LeadAnalyticsPage from './portal_leads_analytics'
import { PortalNav } from '@/components/portal/portal-nav'

const usePageData = vi.hoisted(() => vi.fn())
vi.mock('@/hooks/use-page-data', () => ({ usePageData }))
vi.mock('wouter', async (original) => ({ ...await original<typeof import('wouter')>(), useLocation: () => ['/portal/leads/analytics', vi.fn()] }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

it('shows analytics navigation only for the owner and keeps Leads available', () => {
  usePageData.mockReturnValue({ data: { products: { leadFollowUp: true }, participant: { role: 'staff' } } })
  const { rerender } = render(<PortalNav />)
  expect(screen.queryByRole('link', { name: 'Analytics' })).toBeNull()
  expect(screen.getByRole('link', { name: 'Calls Now' }).getAttribute('href')).toBe('/portal/leads?view=calls')
  expect(screen.getByRole('link', { name: 'Leads' }).getAttribute('href')).toBe('/portal/leads?view=all')
  usePageData.mockReturnValue({ data: { products: { leadFollowUp: true }, participant: { role: 'owner' } } })
  rerender(<PortalNav />)
  expect(screen.getByRole('link', { name: 'Analytics' }).getAttribute('aria-current')).toBe('page')
  expect(screen.getByRole('link', { name: 'Leads' }).getAttribute('aria-current')).toBeNull()
})

it('renders zero-activity caller and shared caller management entry', () => {
  usePageData.mockReturnValue({ data: { minimumConversations: 3, callers: [{
    id: 'c', name: 'Test Caller', active: true, isOwner: false, qualified: false,
    calls: 0, conversations: 0, booked: 0, confirmed: 0, rescheduled: 0, answerRate: 0, closeRate: 0, voicemails: 0, doNotCall: 0,
  }] }, loading: false, error: null })
  render(<LeadAnalyticsPage />)
  expect(screen.getByText('Test Caller')).toBeTruthy()
  expect(screen.getByText(/No lead calls logged yet/)).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Manage callers' }).getAttribute('href')).toBe('/portal/settings')
})