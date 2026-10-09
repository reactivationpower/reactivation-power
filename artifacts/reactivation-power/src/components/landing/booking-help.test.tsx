import { expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { BookingHelp } from './booking-help'
const m = vi.hoisted(() => ({ check: vi.fn(), navigate: vi.fn() }))
vi.mock('wouter', () => ({ useLocation: () => ['/', m.navigate] }))
vi.mock('@/app/actions/booking', () => ({ checkSavedBooking: m.check, requestSavedInquiryHelp: vi.fn() }))
it.each(['lost success', 'uncertain response'])('retrieves %s after reload without any selected slot or availability', async () => {
  m.check.mockResolvedValue({ ok: true, confirmationToken: 'signed', bookedSlot: '2026-11-12T16:00:00Z', bookedTimezone: 'America/New_York' })
  render(<BookingHelp bookingRef={'x'.repeat(32)} funnelSource="main-website" thankYouHref="/schedule-a-call/confirmation" />)
  fireEvent.click(screen.getByRole('button', { name: 'Check booking status' }))
  await waitFor(() => expect(m.navigate).toHaveBeenCalledWith('/schedule-a-call/confirmation?booking=signed'))
  expect(m.check).toHaveBeenCalledWith('x'.repeat(32))
})
