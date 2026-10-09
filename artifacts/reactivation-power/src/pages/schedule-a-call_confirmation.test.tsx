import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
const mock = vi.hoisted(() => ({ data: { confirmed: false, bookedFor: null, timezoneLabel: null } as { confirmed: boolean; bookedFor: string | null; timezoneLabel: string | null }, loader: vi.fn() }))
vi.mock('wouter', () => ({ useSearch: () => 'booking=signed-context' }))
vi.mock('@/hooks/use-page-data', () => ({ usePageData: (...args: unknown[]) => { mock.loader(...args); return { data: mock.data, loading: false, error: null } } }))
import Page from './schedule-a-call_confirmation'
import { WALKTHROUGH_VIDEO } from '@/components/video/video-assets'

describe('website booking confirmation page', () => {
  beforeEach(() => {
    mock.data = { confirmed: false, bookedFor: null, timezoneLabel: null }
    vi.clearAllMocks()
  })
  it('never asserts a booking or fabricates appointment details without valid context', () => {
    render(<Page />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('We couldn’t verify this booking.')
    expect(screen.queryByTestId('text-booked-for')).toBeNull()
    expect(mock.loader).toHaveBeenCalledWith('/schedule-a-call/confirmation', { booking: 'signed-context' })
  })
  it('renders confirmed appointment and the actual user-initiated four-minute video with fallback', () => {
    mock.data = { confirmed: true, bookedFor: 'Wednesday, November 11, 2026 at 5:30 PM', timezoneLabel: 'Pacific Time (PT)' }
    render(<Page />)
    expect(screen.getByTestId('text-timezone').textContent).toBe('Pacific Time (PT)')
    expect(screen.getByTestId('text-booked-for').textContent).toContain('5:30 PM')
    expect(document.querySelector('video')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Play video: Patient Pipeline full walkthrough \(4:00\)/ }))
    const video = document.querySelector('video')!
    expect(video.getAttribute('src')).toBe(WALKTHROUGH_VIDEO.src)
    expect(video.controls).toBe(true)
    expect(video.autoplay).toBe(false)
    fireEvent.error(video)
    expect(screen.getByRole('alert').textContent).toContain('could not be loaded')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(document.querySelector('video')?.getAttribute('src')).toBe(WALKTHROUGH_VIDEO.src)
    expect(screen.queryByRole('link')).toBeNull()
  })
})
