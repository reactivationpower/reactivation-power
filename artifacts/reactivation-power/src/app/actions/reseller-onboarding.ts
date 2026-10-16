import { callAction } from '@/lib/api'
import type { FullWire, Onboarding } from '@/app/actions/affiliate-onboarding'

// Sensitive: keep results in component state only, never React Query or storage.
const act = <T,>(fn: string, ...args: unknown[]) => callAction<T>('reseller-onboarding', fn, args)
export const getMyOnboarding = () => act<Onboarding>('getMyOnboarding')
export const saveMyOnboarding = (input: Parameters<typeof import('@/app/actions/affiliate-onboarding').saveMyOnboarding>[0]) => act<{ ok: true; version: number }>('saveMyOnboarding', input)
export const getAdminOnboarding = (companyId: string) => act<Onboarding>('getAdminOnboarding', companyId)
export const reviewOnboarding = (input: { companyId: string; version: number }) => act<{ ok: boolean }>('reviewOnboarding', input)
export const revealOnboardingWire = (input: { companyId: string; version: number }) => act<FullWire>('revealOnboardingWire', input)
export const downloadOnboardingW9 = (input: { companyId: string; version: number }) => act<{ base64: string; filename: 'signed-w9.pdf' }>('downloadOnboardingW9', input)
