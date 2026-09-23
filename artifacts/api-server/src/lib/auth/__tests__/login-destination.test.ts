import { describe, expect, it } from 'vitest'
import { resolveLoginDestination } from '../login-destination'

const both = { reactivation: true as const, leadFollowUp: true }
const reactivationOnly = { reactivation: true as const, leadFollowUp: false }

describe('resolveLoginDestination', () => {
  it('sends a dual-product account to the two-door chooser on a plain login', () => {
    expect(resolveLoginDestination('', both)).toBe('/portal/start')
  })

  it('sends a reactivation-only account straight into the portal', () => {
    expect(resolveLoginDestination('', reactivationOnly)).toBe('/portal')
  })

  it('honours an explicit same-origin deep link for either account', () => {
    expect(resolveLoginDestination('/portal/campaigns/abc', both)).toBe('/portal/campaigns/abc')
    expect(resolveLoginDestination('/portal/dialer', reactivationOnly)).toBe('/portal/dialer')
  })

  it('ignores off-site or protocol-relative return paths', () => {
    expect(resolveLoginDestination('https://evil.example', both)).toBe('/portal/start')
    expect(resolveLoginDestination('//evil.example', reactivationOnly)).toBe('/portal')
  })
})
