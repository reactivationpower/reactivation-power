import { describe, expect, it } from 'vitest'
import { INTRO_VIDEO, publicVideoSrc } from './video-assets'

describe('public video sources', () => {
  it('streams through the bounded API route by default (Replit)', () => {
    expect(INTRO_VIDEO.src).toContain('/api/public-media/patient-pipeline-introduction.mp4')
  })
  it('uses the static /videos/ files on Vercel builds', () => {
    const src = publicVideoSrc('patient-pipeline-walkthrough.mp4', true)
    expect(src).toMatch(/\/videos\/patient-pipeline-walkthrough\.mp4$/)
    expect(src).not.toContain('/api/')
  })
})
