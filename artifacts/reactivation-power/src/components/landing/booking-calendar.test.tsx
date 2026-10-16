import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
const mocks = vi.hoisted(() => ({ book: vi.fn(), navigate: vi.fn() }))
vi.mock('wouter', () => ({ useLocation: () => ['/', mocks.navigate] }))
vi.mock('@/app/actions/booking', () => ({ bookStrategyCall: mocks.book, getAvailability: vi.fn() }))
vi.mock('swr', () => ({
  default: () => {
    const slot = new Date(Date.now() + 86400000).toISOString()
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(slot))
    return { data: { configured: true, slots: { [day]: [slot] } }, isLoading: false }
  },
}))
import { BookingCalendar } from './booking-calendar'

describe('calendar booking outcome navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ timeZone: 'America/New_York' } as Intl.ResolvedDateTimeFormatOptions)
  })
  function pick() {
    // Desktop and mobile panes are both mounted; exercise the desktop one.
    fireEvent.click(screen.getAllByRole('button', { name: /AM|PM/ })[0])
  }
  it.each([['main-website', '/schedule-a-call/confirmation?booking=signed-token'], [undefined, '/healthcare/thank-you?name=Mock&slot=']])(
    'navigates only on successful booking for %s', async (funnelSource, destination) => {
      mocks.book.mockResolvedValue({ ok: true, confirmationToken: 'signed-token' })
      render(<BookingCalendar contactId="mock-contact" thankYouHref="/healthcare/thank-you?name=Mock" funnelSource={funnelSource} />)
      pick()
      expect(mocks.book).not.toHaveBeenCalled()
      expect(mocks.navigate).not.toHaveBeenCalled()
      fireEvent.click(screen.getAllByRole('button', { name: /^Confirm / })[0])
      await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith(expect.stringContaining(destination)))
      expect(mocks.book).toHaveBeenCalledWith(expect.objectContaining({ funnelSource }))
    },
  )
  it.each(['failed', 'network'])('stays on calendar for %s booking', async mode => {
    if (mode === 'network') mocks.book.mockRejectedValue(new Error('offline'))
    else mocks.book.mockResolvedValue({ ok: false, error: 'Slot unavailable' })
    render(<BookingCalendar contactId="mock-contact" thankYouHref="/healthcare/thank-you" funnelSource="main-website" />)
    pick()
    fireEvent.click(screen.getAllByRole('button', { name: /^Confirm / })[0])
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0))
    expect(mocks.navigate).not.toHaveBeenCalled()
    expect(screen.getAllByRole('button', { name: /^Confirm / })[0].hasAttribute('disabled')).toBe(false)
  })
})

describe('calendar window', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ timeZone: 'America/New_York' } as Intl.ResolvedDateTimeFormatOptions)
    // Friday, Oct 16, 2026, 11 AM Eastern
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-16T15:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('shows exactly 4 full Sunday-to-Saturday weeks starting this week', () => {
    const { container } = render(<BookingCalendar contactId="mock-contact" thankYouHref="/healthcare/thank-you" />)
    // Desktop and mobile panes each draw the same grid.
    const rows = [...container.querySelectorAll('div.grid-cols-7')].filter(row => row.querySelector('button'))
    expect(rows).toHaveLength(8)
    for (const pane of [rows.slice(0, 4), rows.slice(4)]) {
      const days = pane.map(row => {
        // No blank filler cells anywhere: every cell is a day.
        expect(row.children).toHaveLength(7)
        return [...row.querySelectorAll('button')]
      })
      expect(days.flat()).toHaveLength(28)
      const labels = days.flat().map(b => b.getAttribute('aria-label') ?? '')
      expect(labels[0]).toMatch(/^Sunday, October 11,/)
      expect(labels[27]).toMatch(/^Saturday, November 7,/)
      days.forEach(week => {
        expect(week[0].getAttribute('aria-label')).toMatch(/^Sunday,/)
        expect(week[6].getAttribute('aria-label')).toMatch(/^Saturday,/)
      })
      expect(labels.some(l => /November 8,/.test(l))).toBe(false)
      // Sun-Thu before today are grayed out and not clickable.
      for (const b of days[0].slice(0, 5)) {
        expect(b.hasAttribute('disabled')).toBe(true)
        expect(b.getAttribute('aria-label')).toMatch(/unavailable$/)
      }
      // Tomorrow has the mocked open time.
      expect(days[0][6].hasAttribute('disabled')).toBe(false)
    }
  })
})
