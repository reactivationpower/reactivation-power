import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MarketingWalkthrough } from './marketing-walkthrough'

vi.mock('@/lib/marketing-video', () => ({ observeMarketingVideo: vi.fn(() => () => {}) }))
beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
describe('strategy walkthrough recovery', () => {
  it('keeps preview muted, starts sound on click and loads a fresh player on retry', () => {
    render(<MarketingWalkthrough />)
    expect(document.querySelector('video')!.muted).toBe(true)
    fireEvent.click(screen.getByTestId('button-play-walkthrough'))
    const first = screen.getByTestId('video-walkthrough-full') as HTMLVideoElement
    expect(first.muted).toBe(false)
    expect(first.src).toContain('/api/public-media/')
    expect(first.play).toHaveBeenCalled()
    fireEvent.error(first)
    expect(screen.getByRole('alert')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Retry video' }))
    const next = screen.getByTestId('video-walkthrough-full')
    expect(next).not.toBe(first)
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
