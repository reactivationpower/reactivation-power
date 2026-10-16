import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ClickToPlayVideo, formatDuration } from './click-to-play-video'

const props = { src: '/v.mp4', poster: '/p.jpg', title: 'Intro', durationSeconds: 146 }
beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('ClickToPlayVideo', () => {
  it('formats duration', () => {
    expect(formatDuration(146)).toBe('2:26')
    expect(formatDuration(240)).toBe('4:00')
  })
  it('shows poster first, then native controls with preload none', () => {
    render(<ClickToPlayVideo {...props} />)
    expect(document.querySelector('video')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /play video: intro/i }))
    const v = document.querySelector('video')!
    expect(v.hasAttribute('controls')).toBe(true)
    expect(v.getAttribute('preload')).toBe('none')
    expect(v.autoplay).toBe(false)
  })
  it('shows error with retry', () => {
    render(<ClickToPlayVideo {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /play video/i }))
    const first = document.querySelector('video')!
    fireEvent.error(first)
    expect(screen.getByRole('alert')).toBeTruthy()
    fireEvent.click(screen.getByText('Try again'))
    expect(document.querySelector('video')).not.toBeNull()
    expect(document.querySelector('video')).not.toBe(first)
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalledTimes(2)
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2)
  })
})
