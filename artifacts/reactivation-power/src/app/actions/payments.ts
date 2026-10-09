// Thin client stubs for the server actions in artifacts/api-server/src/actions/payments.ts
import { action } from '@/lib/api'

export type StaffMember = any
export type PaymentLink = any
export type ProvisionedAccount = any

export const createPaymentLink = action<any>('payments', 'createPaymentLink')
export const retryCustomerEnrollment = action<any>('payments', 'retryCustomerEnrollment')
export const listPaymentLinks = action<any>('payments', 'listPaymentLinks')
export const getPaymentDetail = action<any>('payments', 'getPaymentDetail')
export const deletePaymentLink = action<any>('payments', 'deletePaymentLink')
export const startPaymentCheckout = action<any>('payments', 'startPaymentCheckout')
export const confirmPayment = action<any>('payments', 'confirmPayment')
export const provisionAccountsNow = action<any>('payments', 'provisionAccountsNow')
export const getPaymentLinkPublic = action<any>('payments', 'getPaymentLinkPublic')
export type CustomerInput = any
export type OfferInput = any
export type CardOnFile = any
export type CustomerRecord = any
