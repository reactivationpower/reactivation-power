// Thin client stubs for the server actions in artifacts/api-server/src/actions/leads.ts
import { action } from '@/lib/api'

export interface LeadState {
  error?: string
  fieldErrors?: Record<string, string>
  values?: Record<string, string>
  services?: string[]
}

export const lookupZip = action<any>('leads', 'lookupZip')
export const submitHealthcareLead = action<any>('leads', 'submitHealthcareLead')
