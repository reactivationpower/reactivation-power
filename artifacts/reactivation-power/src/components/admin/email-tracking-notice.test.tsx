import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { EmailTrackingNotice } from './email-tracking-notice'

afterEach(cleanup)

it('explains missing visibility without implying sending or GoHighLevel exports are broken', () => {
  render(<EmailTrackingNotice configured={false} />)
  const text = screen.getByRole('status').textContent!
  expect(text).toContain('This does not mean sending is broken')
  expect(text).toContain('Send failures are still shown below')
  expect(text).toContain('does not cover marketing campaigns sent from GoHighLevel')
  expect(text).toContain('previewed, copied, downloaded, and imported')
  expect(text).toContain('General system health is separate')
  expect(text).toContain('https://patientpipeline.app/api/webhooks/resend')
  expect(text).toContain('published server')
  expect(text).toContain('owner’s approval')
})

it('does not treat a saved signing secret as verified tracking or inbox delivery', () => {
  render(<EmailTrackingNotice configured />)
  const text = screen.getByRole('status').textContent!
  expect(text).toContain('that alone does not confirm tracking works')
  expect(text).toContain('approved test inbox')
  expect(text).toContain('matching delivery event')
  expect(text).toContain('recipient to confirm receipt')
  expect(text).toContain('does not guarantee inbox placement')
  expect(text).toContain('GoHighLevel')
})

it('does not report missing configuration while it is loading', () => {
  render(<EmailTrackingNotice configured={null} />)
  expect(screen.queryByRole('status')).toBeNull()
})
