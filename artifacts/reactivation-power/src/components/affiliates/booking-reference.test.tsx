import { afterEach, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { ReferralCapture } from './referral-capture'
const capture = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('@/app/actions/affiliates', () => ({ captureAffiliateReferral: capture }))
afterEach(() => { window.history.replaceState(null, '', '/'); vi.clearAllMocks() })
it('leaves the saved booking reference intact while capturing a separate affiliate code', async () => {
  const token = 'a'.repeat(32)
  window.history.replaceState(null, '', `/healthcare/book-a-call?bookingRef=${token}&ref=affiliate`)
  const first = render(<ReferralCapture />)
  await waitFor(() => expect(new URLSearchParams(window.location.search).has('ref')).toBe(false))
  expect(new URLSearchParams(window.location.search).get('bookingRef')).toBe(token)
  expect(capture).toHaveBeenCalledWith('affiliate')
  first.unmount()
  render(<ReferralCapture />)
  expect(new URLSearchParams(window.location.search).get('bookingRef')).toBe(token)
  expect(capture).toHaveBeenCalledTimes(1)
})
