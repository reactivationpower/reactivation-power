import { callAction } from '@/lib/api'
const action = <T,>(module: string, fn: string, ...args: unknown[]) => callAction<T>(module, fn, args)

export interface Affiliate {
  id: string; business_name: string; email: string; status: 'pending' | 'approved' | 'inactive' | 'rejected'
  referral_code: string; access_version: number; created_at: string
}
export interface Rule { kind: 'percent' | 'flat'; value: number; saleType?: 'monthly' | 'one_time' }
export interface AffiliateRules { monthly: Rule; one_time: Rule }
export interface Practice {
  id: string; business_name: string; active: boolean; paid: boolean
  estimated_next_commission_cents: number; rules: AffiliateRules
}
export interface Earning {
  id: string; customer_id: string | null; kind: string; cents: number; collected_cents: number
  period: string; occurred_at: string; rule: Rule | null
}
export interface Payout {
  id: string; period: string; amount_cents: number; payment_date: string; reference: string
  notification_status: string; notification_error: string | null
}
export interface Period {
  period: string; gross_cents: number; corrections_cents: number; net_cents: number
  paid_cents: number; remaining_cents: number; state: string
  opening_balance_cents?: number; payable_cents?: number; wireable_cents?: number
}
export interface PayoutWorklistRow {
  affiliate: Pick<Affiliate, 'id' | 'business_name' | 'status'>
  gross_cents: number; corrections_cents: number; net_cents: number
  opening_balance_cents: number; paid_cents: number; remaining_cents: number
  earned_cents: number; total_paid_cents: number; balance_cents: number; wireable_cents: number
  notifications: { pending: number; sending: number; failed: number; uncertain: number }
}
export interface PayoutWorklist {
  period: string; rows: PayoutWorklistRow[]
  totals: { gross_cents: number; corrections_cents: number; paid_cents: number; balance_cents: number; wireable_cents: number }
}
export const getAffiliatePayoutWorklist = (period: string) => action<PayoutWorklist>('affiliates', 'getAffiliatePayoutWorklist', period)
export interface Report {
  affiliate: { id: string; business_name: string; referral_code: string }
  rules: AffiliateRules; practices: Practice[]; entries: Earning[]; payouts: Payout[]; periods: Period[]
  payments: { id: string; customer_id: string; practice_name: string; kind: string; amount_cents: number; occurred_at: string; sale_type: 'monthly' | 'one_time' | 'setup' }[]
  earned_cents: number; paid_cents: number; balance_cents: number
}
export interface Activity {
  id: string; action: string; actor: string; customer_id: string | null
  reason: string | null; occurred_at: string; ip: string | null
  country: string | null; region: string | null; details: Record<string, unknown>
}
export interface Profile extends Report {
  partner: Affiliate; activity: Activity[]; summary: { visits: number; practice_views: number }
}
export const applyAffiliate = (input: { businessName: string; email: string }) => action<{ ok: boolean }>('affiliates', 'applyAffiliate', input)
export const requestAffiliateAccess = (input: { email: string; accessId?: string; next?: 'onboarding' }) => action<{ ok: boolean }>('affiliates', 'requestAffiliateAccess', input)
export const verifyAffiliateAccess = (input: { email: string; token: string }) => action<{ ok: boolean; error?: string }>('affiliates', 'verifyAffiliateAccess', input)
export const affiliateLogout = () => action<{ ok: boolean }>('affiliates', 'affiliateLogout')
export const getAffiliateDashboard = () => action<Report>('affiliates', 'getAffiliateDashboard')
export const logAffiliateNavigation = (input: { view: 'dashboard' | 'payments' | 'payouts' | 'practices'; customerId?: string }) => action<{ ok: boolean }>('affiliates', 'logAffiliateNavigation', input)
export const listAffiliates = () => action<Affiliate[]>('affiliates', 'listAffiliates')
interface AttributionContact {
  id: string; full_name: string | null; email: string | null
  affiliate_id: string | null; affiliate_name: string | null
}
export interface AttributionLead extends AttributionContact {
  practice_name: string; protected_until: string | null
  converted_customer_id: string | null; converted_at: string | null
}
export interface AttributionCustomer extends AttributionContact { business_name: string }
export const getAffiliateAttributionCandidates = (search = '', kind?: 'lead' | 'customer') => action<{
  leads: AttributionLead[]; customers: AttributionCustomer[]
}>('affiliates', 'getAffiliateAttributionCandidates', search, kind)
export const getAffiliateProfile = (id: string, search = '') => action<Profile>('affiliates', 'getAffiliateProfile', id, search)
export const saveAffiliate = (input: { id?: string; businessName: string; email: string; status: Affiliate['status']; rules: AffiliateRules; reason: string }) => action<{ ok: boolean; id: string }>('affiliates', 'saveAffiliate', input)
export const getAffiliateAccessLink = (id: string) => action<{ url: string }>('affiliates', 'getAffiliateAccessLink', id)
export const resendAffiliateAccess = (id: string) => action<{ ok: boolean; error?: string }>('affiliates', 'resendAffiliateAccess', id)
export const revokeAffiliateAccess = (id: string, reason: string) => action<{ ok: boolean }>('affiliates', 'revokeAffiliateAccess', id, reason)
export const assignAffiliate = (input: { affiliateId: string | null; customerId?: string; leadId?: string; reason: string }) => action<{ ok: boolean }>('affiliates', 'assignAffiliate', input)
export const setAffiliateCustomerRules = (input: { affiliateId: string; customerId: string; rules: AffiliateRules; reason: string }) => action<{ ok: boolean }>('affiliates', 'setAffiliateCustomerRules', input)
export const adjustAffiliateLedger = (input: { affiliateId: string; cents: number; reason: string; key: string }) => action<{ ok: boolean }>('affiliates', 'adjustAffiliateLedger', input)
export const calculateAffiliateHistory = (input: { affiliateId: string; customerId: string; from: string; reason: string }) => action<{ ok: boolean; processed: number }>('affiliates', 'calculateAffiliateHistory', input)
export const recordAffiliateWire = (input: { affiliateId: string; period: string; amountCents: number; paymentDate: string; reference: string; key: string }) => action<{ ok: boolean; payoutId: string; emailSent: boolean }>('affiliates', 'recordAffiliateWire', input)
export const retryAffiliatePayoutEmail = (id: string) => action<{ ok: boolean }>('affiliates', 'retryAffiliatePayoutEmail', id)
export const captureAffiliateReferral = (code: string) => action<{ ok: boolean }>('affiliates', 'captureAffiliateReferral', code)
