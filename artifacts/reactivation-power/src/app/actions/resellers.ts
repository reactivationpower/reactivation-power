import { action } from '@/lib/api'
import type { AgreementTermsForm } from '@/app/actions/agreements'

export type Role = 'reseller_manager' | 'reseller_salesperson'
export type Stage = 'New' | 'Contacted' | 'Demo' | 'Offer' | 'Customer' | 'Do Not Contact' | 'Lost'
export interface Prices { lifetime_cents: number; monthly_cents: number; setup_cents: number; version: number }
export interface Company { id: string; business_name: string; email: string; terminated_at: string | null; created_at: string; earned_cents: number | string; paid_cents: number | string; prospect_count: number; sale_count: number; onboarding_status: 'incomplete' | 'submitted' | 'reviewed' }
export interface Member { user_id: string; name: string; email?: string; role: Role; active: boolean; created_at?: string }
export interface Period { period: string; earned_cents: number; paid_cents: number; wireable_cents: number }
export interface Report {
  entries: any[]; payouts: any[]; periods: Period[]; sales: any[]
  earned_cents: number; paid_cents: number; balance_cents: number; collected_cents: number; reversals_cents: number
  onboarding_status?: 'incomplete' | 'submitted' | 'reviewed'
}
export interface Prospect {
  id: string; company_id: string; salesperson_id: string; full_name: string; business_name: string; email: string; phone: string
  business_address: string; consent_evidence: string; stage: Stage; do_not_contact: boolean; next_followup_at: string | null
  revision: number; customer_id: string | null; updated_at: string; created_at: string
}
export interface Activity { id: string; action: string; reason: string | null; actor_id?: string; occurred_at: string; details?: any; metadata?: any; prospect_id?: string }
export type InviteResult = any

const a = <T,>(fn: string) => action<T>('resellers', fn)
export const listCompanies = a<{ companies: Company[]; prices: Prices | null }>('listCompanies')
export const createCompany = a<{ id: string }>('createCompany')
export const savePrices = a<{ ok: true }>('savePrices')
export const inviteMember = a<InviteResult>('inviteMember')
export const resendMemberInvite = a<InviteResult>('resendMemberInvite')
export const setMemberActive = a<{ ok: true }>('setMemberActive')
export const terminateCompany = a<{ ok: true }>('terminateCompany')
export const getCompany = a<{ company: Company; members: Member[]; report: Report; activity: Activity[]; prospects: Prospect[] }>('getCompany')
export const getWorkspace = a<{ actor: { userId: string; name: string | null; role: Role; companyId: string }; company: Company; prospects: Prospect[]; total: number; page: number; members: Member[]; prices: Prices | null; report: Report | null; sales: any[] }>('getWorkspace')
export const getSale = a<{sale:any}>('getSale')
export const createProspect = a<{ id: string }>('createProspect')
export const getProspect = a<{ prospect: Prospect; offers: any[]; activity: Activity[]; actor: { userId: string; role: string }; prices: Prices | null; members: Member[] }>('getProspect')
export const updateProspect = a<{ ok: true }>('updateProspect')
export const logFollowup = a<{ ok: true }>('logFollowup')
export const resolveCustomerConflict = a<{ ok: true }>('resolveCustomerConflict')
export const adjustLedger = a<{ ok: true }>('adjustLedger')
export const createOffer = a<any>('createOffer')
export const retryEnrollment = a<any>('retryEnrollment')
export const getAgreementForm = a<any>('getAgreementForm')
export const previewAgreement = a<any>('previewAgreement')
export const previewEnrollmentEmail = a<any>('previewEnrollmentEmail')
export const sendAgreement = a<any>('sendAgreement')
export const updateAgreement = a<any>('updateAgreement')
export const resendAgreement = a<any>('resendAgreement')
export const recordPayout = a<any>('recordPayout')
export const retryPayoutNotification = a<{ emailSent: boolean }>('retryPayoutNotification')
export type { AgreementTermsForm }
