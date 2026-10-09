import { callAction } from '@/lib/api'

// Onboarding data is sensitive: callers keep results in component state only.
// Never route these through React Query, local/session storage or analytics.
const action = <T,>(fn: string, ...args: unknown[]) => callAction<T>('affiliate-onboarding', fn, args)

export interface UsAddress { line1: string; line2: string; city: string; state: string; zip: string; country: 'US' }
export interface OnboardingContact { contactName: string; phone: string; legalName: string; dba: string; address: UsAddress }
export interface BankSummary { bankName: string; accountHolder: string; accountType: string; last4: string }
export interface Invitation { id: string; status: string; created_at: string; delivery_status: string | null }
export interface Onboarding {
  version: number
  contact: OnboardingContact | null
  bank: BankSummary | null
  w9Received: boolean
  submittedAt: string | null
  reviewedAt: string | null
  status: 'incomplete' | 'submitted' | 'reviewed'
  invitations?: Invitation[]
  loginEmail?: string
}
export interface WireInput {
  bankName: string; bankAddress: UsAddress; accountHolder: string; accountType: 'checking' | 'savings'
  routingNumber: string; accountNumber: string; accountConfirmation: string; instructions: string
}
export interface FullWire extends Omit<WireInput, 'accountConfirmation'> { [k: string]: unknown }

export const getMyOnboarding = () => action<Onboarding>('getMyOnboarding')
export const saveMyOnboarding = (input: { version: number; contact: OnboardingContact; wire?: WireInput; w9Base64?: string }) =>
  action<{ ok: true; version: number }>('saveMyOnboarding', input)
export const getAdminOnboarding = (affiliateId: string) => action<Onboarding>('getAdminOnboarding', affiliateId)
export const reviewOnboarding = (input: { affiliateId: string; version: number }) => action<{ ok: boolean }>('reviewOnboarding', input)
export const revealOnboardingWire = (input: { affiliateId: string; version: number }) => action<FullWire>('revealOnboardingWire', input)
export const downloadOnboardingW9 = (input: { affiliateId: string; version: number }) => action<{ base64: string; filename: 'signed-w9.pdf' }>('downloadOnboardingW9', input)
export const resendOnboardingInvitation = (affiliateId: string) => action<{ ok: boolean; error?: string }>('resendOnboardingInvitation', affiliateId)

export const isStaleError = (e: unknown) => /stale|version|changed since|conflict|modified/i.test((e as Error)?.message ?? '')
export const needsFreshVerification = (e: unknown) => /fresh|re-?verif|recent (inbox|sign|verification)|verify your inbox|step.?up/i.test((e as Error)?.message ?? '')

export const emptyAddress = (): UsAddress => ({ line1: '', line2: '', city: '', state: '', zip: '', country: 'US' })
