// Thin client stubs for the server actions in artifacts/api-server/src/actions/demo.ts
import { action } from '@/lib/api'

export const enterDemo = action<any>('demo', 'enterDemo')
export const resetDemo = action<any>('demo', 'resetDemo')
export const refreshDemoIfStale = action<any>('demo', 'refreshDemoIfStale')
export const switchDemoView = action<any>('demo', 'switchDemoView')
