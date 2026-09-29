// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'
import LeadsPage from './portal_leads'

const usePageData = vi.hoisted(() => vi.fn())
vi.mock('@/hooks/use-page-data', () => ({ usePageData }))
beforeEach(() => { window.history.replaceState(null, '', '/portal/leads') })
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('account-wide leads landing', () => {
  it('refreshes the Calls Now list while left open', () => {
    const reload = vi.fn()
    usePageData.mockReturnValue({ loading: false, error: null, reload, data: {
      campaigns: [], rows: [], callsNow: [], comingUp: [],
      total: 0, page: 1, pageSize: 50,
      stats: { received: 0, new: 0, reached: 0, booked: 0 },
      now: '2026-09-24T13:00:00Z',
    } })
    vi.useFakeTimers()
    try {
      render(<LeadsPage />)
      act(() => { vi.advanceTimersByTime(30_000) })
      expect(reload).toHaveBeenCalledTimes(1)
    } finally {
      cleanup()
      vi.useRealTimers()
    }
  })
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
    fireEvent.click(screen.getByRole('link', { name: 'All Leads' }))
    expect(screen.getByRole('link', { name: 'Winter offer' }).getAttribute('href')).toBe('/portal/campaigns/c2')
    expect(screen.getByText('Jo Smith').closest('a')?.getAttribute('href')).toBe('/portal/campaigns/c2/leads/l2')
    expect(screen.getByTestId('button-call-lead-l2').getAttribute('href')).toBe('/portal/campaigns/c2/leads/l2/call')
    expect(screen.getByRole('button', { name: /manage campaigns/i }).getAttribute('href')).toBe('/portal/campaigns')
    fireEvent.change(screen.getByLabelText('Campaign'), { target: { value: 'c1' } })
    expect(usePageData).toHaveBeenLastCalledWith('/portal/leads', expect.objectContaining({ campaign: 'c1' }))
  })
  it('separates ready calls from scheduled follow-ups and the full lead inventory', () => {
    usePageData.mockReturnValue({ loading: false, error: null, data: {
      campaigns: [{ id: 'c1', name: 'Fall offer' }], rows: [], total: 2, page: 1, pageSize: 50,
      stats: { received: 2, new: 1, reached: 0, booked: 0 }, now: '2026-09-24T13:00:00Z',
      callsNow: [{ campaign: { id: 'c1', name: 'Fall offer' }, reason: 'new', lead: {
        id: 'l1', firstName: 'Jane', lastName: 'Doe',
      } }],
      comingUp: [{ campaign: { id: 'c1', name: 'Fall offer' }, reason: 'due', lead: {
        id: 'l2', firstName: 'Alex', lastName: 'Lee', nextDueAt: '2026-09-25T14:00:00Z', unansweredAttempts: 3,
      } }],
    } })
    render(<LeadsPage />)
    expect(screen.getByRole('link', { name: 'Calls Now (1)' })).toBeTruthy()
    expect(screen.getByText('Jane Doe')).toBeTruthy()
    expect(screen.getByText('Alex Lee')).toBeTruthy()
     expect(screen.getByRole('button', { name: 'Call Now' }).getAttribute('href')).toBe('/portal/campaigns/c1/leads/l1/call')
    expect(screen.queryByRole('link', { name: 'Alex Lee' })?.getAttribute('href')).toBe('/portal/campaigns/c1/leads/l2')
     expect(screen.getByRole('heading', { name: 'Calls Upcoming' })).toBeTruthy()
     expect(screen.queryByText(/You reached out/)).toBeNull()
  })
  it('tracks selected view in the URL on direct loads, navigation, and browser back', () => {
    usePageData.mockReturnValue({ loading: false, error: null, reload: vi.fn(), data: {
      campaigns: [], rows: [], callsNow: [], comingUp: [], total: 0, page: 1, pageSize: 50,
      stats: { received: 0, new: 0, reached: 0, booked: 0 }, now: '2026-09-24T13:00:00Z',
    } })
    const { hook, navigate, history } = memoryLocation({ path: '/portal/leads?view=all&campaign=c1', record: true })
    render(<Router hook={hook}><LeadsPage /></Router>)
    expect(screen.getByRole('link', { name: 'All Leads' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('search')).toBeTruthy()
    fireEvent.click(screen.getByRole('link', { name: 'Calls Now (0)' }))
    expect(history?.at(-1)).toBe('/portal/leads?view=calls&campaign=c1')
    expect(screen.getByRole('link', { name: 'Calls Now (0)' }).getAttribute('aria-current')).toBe('page')
    expect(screen.queryByRole('search')).toBeNull()
    act(() => navigate('/portal/leads?view=all&campaign=c1'))
    expect(screen.getByRole('search')).toBeTruthy()
  })
})