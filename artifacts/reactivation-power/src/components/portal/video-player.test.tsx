// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { VideoPlayer } from './video-player'

const refresh = vi.hoisted(() => vi.fn())
vi.mock('@/hooks/use-router', () => ({ useRouter: () => ({ refresh }) }))

const props = {
  videoId: 'video-one',
  courseId: 'course-one',
  moduleId: 'module-one',
  videoPathname: 'videos/demo lesson.mp4',
  durationSeconds: 248,
  initialCompleted: false,
  initialPosition: 0,
  nextHref: null,
  courseHref: '/portal/course/test',
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ completed: false }) }))
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  refresh.mockClear()
})

describe('training video playback', () => {
  it('uses inline native playback and the authenticated media route without autoplay', () => {
    const { container } = render(<VideoPlayer {...props} />)
    const video = container.querySelector('video')!
    expect(video.hasAttribute('playsinline')).toBe(true)
    expect(video.hasAttribute('autoplay')).toBe(false)
    expect(video.src).toContain('/api/media?pathname=videos%2Fdemo%20lesson.mp4')
  })

  it('shows a useful error and retries without logging completion or automatically playing', () => {
    const { container } = render(<VideoPlayer {...props} />)
    const video = container.querySelector('video')!
    Object.defineProperty(video, 'error', { configurable: true, value: { code: 2 } })
    fireEvent.error(video)
    expect(screen.getByRole('alert').textContent).toContain('connection was interrupted')
    fireEvent.click(screen.getByRole('button', { name: 'Retry video' }))
    expect(video.load).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('restores an unfinished position but replays a completed lesson from the beginning', () => {
    const first = render(<VideoPlayer {...props} initialPosition={42} />)
    const video = first.container.querySelector('video')!
    fireEvent.loadedMetadata(video)
    expect(video.currentTime).toBe(42)
    first.unmount()
    const second = render(<VideoPlayer {...props} initialPosition={248} initialCompleted />)
    const completedVideo = second.container.querySelector('video')!
    fireEvent.loadedMetadata(completedVideo)
    expect(completedVideo.currentTime).toBe(0)
  })

  it('does not treat a brief pause for buffering as a failure or leave a stall timer on unmount', () => {
    vi.useFakeTimers()
    const { container, unmount } = render(<VideoPlayer {...props} />)
    const video = container.querySelector('video')!
    fireEvent.waiting(video)
    act(() => vi.advanceTimersByTime(16_000))
    expect(screen.queryByRole('alert')).toBeNull()
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('reports prolonged active buffering, and clears the warning when playback recovers', () => {
    vi.useFakeTimers()
    const { container } = render(<VideoPlayer {...props} />)
    const video = container.querySelector('video')!
    Object.defineProperty(video, 'paused', { configurable: true, value: false })
    Object.defineProperty(video, 'readyState', { configurable: true, value: 1 })
    fireEvent.waiting(video)
    act(() => vi.advanceTimersByTime(14_000))
    expect(screen.queryByRole('alert')).toBeNull()
    act(() => vi.advanceTimersByTime(1_000))
    expect(screen.getByRole('alert').textContent).toContain('taking too long')
    fireEvent.playing(video)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})