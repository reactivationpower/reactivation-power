// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import LeadsPage from './portal_leads'

const usePageData = vi.hoisted(() => vi.fn())
vi.mock('@/hooks/use-page-data', () => ({ usePageData }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('account-wide leads landing', () => {
  it('shows campaign origin, lead details, and the existing detail/call routes', () => {
    usePageData.mockReturnValue({ loading: false, error: null, data: {
      campaigns: [{ id: 'c1', name: 'Fall offer' }, { id: 'c2', name: 'Winter offer' }],
      rows: [{
        campaign: { id: 'c2', name: 'Winter offer', status: 'active' },
        lead: { id: 'l2', firstName: 'Jo', lastName: 'Smith', phone: '5551234567', email: 'jo@example.com', source: 'upload', status: 'new', submittedAt: '2026-09-24T12:00:00Z', lastAttemptAt: null, nextDueAt: null, unansweredAttempts: 0 },
      }],
      total: 1, page: 1, pageSize: 50, stats: { received: 2, new: 1, reached: 1, booked: 0 }, now: '2026-09-24T13:00:00Z',
    } })
    render(<LeadsPage />)
    expect(screen.getByRole('heading', { name: 'Leads' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Winter offer' }).getAttribute('href')).toBe('/portal/campaigns/c2')
    expect(screen.getByText('Jo Smith').closest('a')?.getAttribute('href')).toBe('/portal/campaigns/c2/leads/l2')
    expect(screen.getByTestId('button-call-lead-l2').getAttribute('href')).toBe('/portal/campaigns/c2/leads/l2/call')
    expect(screen.getByRole('button', { name: /manage campaigns/i }).getAttribute('href')).toBe('/portal/campaigns')
    fireEvent.change(screen.getByLabelText('Campaign'), { target: { value: 'c1' } })
    expect(usePageData).toHaveBeenLastCalledWith('/portal/leads', expect.objectContaining({ campaign: 'c1' }))
  })
})