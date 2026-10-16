// Thin client stubs for the 'lead-terms' server actions.
import { action } from '@/lib/api'
import type { CurrentLeadTerms, LeadTermsVersion } from '@workspace/shared/lead-terms'

export interface TermsAdmin {
  current: CurrentLeadTerms
  draft: { content: string; label: string; revision: number }
  history: LeadTermsVersion[]
}
export const getCurrentTerms = action<CurrentLeadTerms>('lead-terms', 'getCurrentTerms') as () => Promise<CurrentLeadTerms>
export const getTermsVersion = action<LeadTermsVersion>('lead-terms', 'getTermsVersion') as (id: string) => Promise<LeadTermsVersion>
export const getTermsAdmin = action<TermsAdmin>('lead-terms', 'getTermsAdmin') as () => Promise<TermsAdmin>
export const saveTermsDraft = action<void>('lead-terms', 'saveTermsDraft') as (i: { content: string; label: string; revision: number }) => Promise<void>
export const publishTerms = action<void>('lead-terms', 'publishTerms') as (i: { revision: number; confirm: true }) => Promise<void>
export const downloadTermsEvidence = action<any>('lead-terms', 'downloadTermsEvidence') as (acceptanceId: string) => Promise<any>
