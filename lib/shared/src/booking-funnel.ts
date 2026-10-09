/** Explicit opt-in: scheduleMode and product interest are shared by other funnels. */
export const WEBSITE_BOOKING_FUNNEL = 'main-website'
export const WEBSITE_CONFIRMATION_PATH = '/schedule-a-call/confirmation'

export function validatedBookingFunnel(value: unknown): typeof WEBSITE_BOOKING_FUNNEL | undefined {
  return value === WEBSITE_BOOKING_FUNNEL ? WEBSITE_BOOKING_FUNNEL : undefined
}

export function bookingThankYouHref(funnelSource: unknown, carriedQuery: string): string {
  return validatedBookingFunnel(funnelSource)
    ? WEBSITE_CONFIRMATION_PATH
    : `/healthcare/thank-you?${carriedQuery}`
}
