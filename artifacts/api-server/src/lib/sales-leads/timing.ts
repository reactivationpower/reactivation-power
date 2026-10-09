import { AsyncLocalStorage } from 'node:async_hooks'

export const salesTiming = new AsyncLocalStorage<{ providerMs: number; providerRequests: number; providerStatus?: number }>()
