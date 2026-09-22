// Thin client stubs for the server actions in artifacts/api-server/src/actions/customer-billing.ts
import { action } from '@/lib/api'

// Public, token-based (emailed link; works while access is paused)
export const requestBillingLink = action<any>('customer-billing', 'requestBillingLink')
export const getBillingByToken = action<any>('customer-billing', 'getBillingByToken')
export const startCardUpdateByToken = action<any>('customer-billing', 'startCardUpdateByToken')
export const recordCardByToken = action<any>('customer-billing', 'recordCardByToken')
export const payBalanceByToken = action<any>('customer-billing', 'payBalanceByToken')

// Signed-in owner
export const getMyBilling = action<any>('customer-billing', 'getMyBilling')
export const startMyCardUpdate = action<any>('customer-billing', 'startMyCardUpdate')
export const recordMyCard = action<any>('customer-billing', 'recordMyCard')
export const payMyBalance = action<any>('customer-billing', 'payMyBalance')
export const cancelMyAgreement = action<any>('customer-billing', 'cancelMyAgreement')

// Admin
export const sendCardUpdateLink = action<any>('customer-billing', 'sendCardUpdateLink')
