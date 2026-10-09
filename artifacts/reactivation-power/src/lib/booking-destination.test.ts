import { describe, expect, it } from 'vitest'
import { bookingDestination } from './booking-destination'
const params = { slot: '2026-11-12T01:30:00Z', timezone: 'America/Los_Angeles', thankYouHref: '/healthcare/thank-you?name=Mock&interest=both&cid=private' }
describe('allow-listed booking destinations', () => {
  it('carries only the signed context for the website', () => {
    expect(bookingDestination({ ...params, funnelSource: 'main-website', confirmationToken: 'signed-token' }))
      .toBe('/schedule-a-call/confirmation?booking=signed-token')
  })
  it.each(['https://evil.example/healthcare/thank-you', '//evil.example', '/portal', 'http://[', '/schedule-a-call/confirmation'])(
    'refuses arbitrary destination %s', thankYouHref => {
      const url = bookingDestination({ ...params, thankYouHref })
      expect(url).toMatch(/^\/healthcare\/thank-you\?slot=/)
      expect(url).not.toContain('evil')
    },
  )
  it('cannot claim a booking without signed context even if slot is supplied', () => {
    expect(bookingDestination({ ...params, funnelSource: 'main-website' }))
      .toBe('/schedule-a-call/confirmation')
  })
})
