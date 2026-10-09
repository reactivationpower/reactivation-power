// Thin client stubs for the server actions in artifacts/api-server/src/actions/agreements.ts
import { action } from '@/lib/api'

export type AgreementSummary = any
export type AgreementDetail = any
export type PublicAgreement = any
export type AgreementTermsForm = {
  termMonths: number
  monthlyDollars: number
  setupFeeDollars: number
  noticeDays?: number
  body?: string
}

// Public signing page
export const getAgreementPublic = action<any>('agreements', 'getAgreementPublic')
export const getAgreementVersion = action<any>('agreements', 'getAgreementVersion')
export const recordAgreementInitials = action<any>('agreements', 'recordAgreementInitials')
export const signAgreement = action<any>('agreements', 'signAgreement')
export const getAgreementCheckout = action<any>('agreements', 'getAgreementCheckout')
export const recordAgreementPrimaryCard = action<any>('agreements', 'recordAgreementPrimaryCard')
export const recordAgreementSecondaryCard = action<any>('agreements', 'recordAgreementSecondaryCard')
export const recordAgreementPaymentFailure = action<any>('agreements', 'recordAgreementPaymentFailure')
export const getEnrollmentCheckout = action<any>('agreements', 'getEnrollmentCheckout')
export const recordEnrollmentCard = action<any>('agreements', 'recordEnrollmentCard')
export const replaceEnrollmentCard = action<any>('agreements', 'replaceEnrollmentCard')
export const confirmEnrollment = action<any>('agreements', 'confirmEnrollment')
export const reconcileEnrollment = action<any>('agreements', 'reconcileEnrollment')

// Admin
export const getAgreementSendForm = action<any>('agreements', 'getAgreementSendForm')
export const previewEnrollmentEmail = action<any>('agreements', 'previewEnrollmentEmail')
export const retryAgreementCompletion = action<any>('agreements', 'retryAgreementCompletion')
export const retryEnrollmentDelivery = action<any>('agreements', 'retryEnrollmentDelivery')
export const previewAgreement = action<any>('agreements', 'previewAgreement')
export const sendAgreement = action<any>('agreements', 'sendAgreement')
export const updateAgreement = action<any>('agreements', 'updateAgreement')
export const resendAgreement = action<any>('agreements', 'resendAgreement')
export const listAgreements = action<any>('agreements', 'listAgreements')
export const getAgreementDetail = action<any>('agreements', 'getAgreementDetail')
export const getAgreementForLink = action<any>('agreements', 'getAgreementForLink')
