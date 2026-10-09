import { beforeEach, describe, expect, it, vi } from 'vitest'
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
