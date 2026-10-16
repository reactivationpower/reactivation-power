import { bookOnboarding, onboardingAvailability, type OnboardingBookResult } from '@/lib/onboarding/booking'

/** Public: the emailed `ref` is the credential (signed per enrollment). */
export async function getOnboardingAvailability(ref: string, timezone: string) {
  return onboardingAvailability(ref, timezone)
}

export async function bookOnboardingCall(params: { ref: string; slot: string; timezone: string }): Promise<OnboardingBookResult> {
  return bookOnboarding(params ?? ({} as never))
}
