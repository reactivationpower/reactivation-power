import { validatedBookingFunnel, WEBSITE_CONFIRMATION_PATH } from '@workspace/shared/booking-funnel'

/** Only local, known destinations. The website URL carries no contact details. */
export function bookingDestination(params: {
  funnelSource?: unknown
  confirmationToken?: string
  thankYouHref: string
  slot: string
  timezone: string
}): string {
  if (validatedBookingFunnel(params.funnelSource)) {
    const query = new URLSearchParams()
    if (params.confirmationToken) query.set('booking', params.confirmationToken)
    return `${WEBSITE_CONFIRMATION_PATH}${query.size ? `?${query}` : ''}`
  }
  let query = new URLSearchParams()
  try {
    const url = new URL(params.thankYouHref, 'https://booking.invalid')
    if (url.origin === 'https://booking.invalid' && url.pathname === '/healthcare/thank-you') {
      query = url.searchParams
    }
  } catch {
    // An invalid destination never escapes the known local thank-you page.
  }
  query.set('slot', params.slot)
  query.set('tz', params.timezone)
  return `/healthcare/thank-you?${query}`
}
