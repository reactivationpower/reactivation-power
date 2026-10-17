// Thin client stubs for the server actions in artifacts/api-server/src/actions/onboarding.ts
import { action } from '@/lib/api'

export const getOnboardingAvailability = action<any>('onboarding', 'getOnboardingAvailability')
export const bookOnboardingCall = action<any>('onboarding', 'bookOnboardingCall')
