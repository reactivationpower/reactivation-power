// Thin client stubs for the server actions in artifacts/api-server/src/actions/subscriptions.ts
import { action } from '@/lib/api'

export type SubscriptionCheckoutState = any

export const getSubscriptionCheckoutState = action<any>('subscriptions', 'getSubscriptionCheckoutState')
export const recordPrimaryCard = action<any>('subscriptions', 'recordPrimaryCard')
export const recordSecondaryCard = action<any>('subscriptions', 'recordSecondaryCard')
