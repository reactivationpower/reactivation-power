// Thin client stubs for the server actions in artifacts/api-server/src/actions/booking.ts
import { action } from '@/lib/api'

export type AvailabilityResult = any
export type BookResult = any

export const getAvailability = action<any>('booking', 'getAvailability')
export const bookStrategyCall = action<any>('booking', 'bookStrategyCall')
