// Thin client stubs for the server actions in artifacts/api-server/src/actions/cron.ts
import { action } from '@/lib/api'

export type CronJobStatus = any

export const listCronJobs = action<any>('cron', 'listCronJobs')
export const runCronJobNow = action<any>('cron', 'runCronJobNow')
