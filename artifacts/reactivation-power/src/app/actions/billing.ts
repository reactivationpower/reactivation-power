// Thin client stubs for the server actions in artifacts/api-server/src/actions/billing.ts
import { action } from '@/lib/api'

export const refundPayment = action<any>('billing', 'refundPayment')
export const cancelSubscription = action<any>('billing', 'cancelSubscription')
export const resumeSubscription = action<any>('billing', 'resumeSubscription')
export const changeBillingDate = action<any>('billing', 'changeBillingDate')
export const retryCustomerPayment = action<any>('billing', 'retryCustomerPayment')
