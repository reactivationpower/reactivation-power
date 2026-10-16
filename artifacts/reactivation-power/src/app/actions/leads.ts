
// Thin client stubs for the server actions in artifacts/api-server/src/actions/leads.ts
import { action } from '@/lib/api'
import type { CurrentLeadTerms } from '@workspace/shared/lead-terms'

export interface LeadState {
  error?: string
  fieldErrors?: Record<string, string>
  values?: Record<string, string>
  services?: string[]
  terms?: CurrentLeadTerms
}

export const lookupZip = action<any>('leads', 'lookupZip')
// After a successful submit the browser goes to the booking page. If the
// visitor comes back with Back, React clears the form's plain inputs when the
// action settles, so settle with their entries to keep them on screen.
const rawSubmit = action<LeadState>('leads', 'submitHealthcareLead', {
  restored: (args) => echo(args[1] as FormData),
})

/** Echo the visitor's entries so a transport failure or Back never wipes the form. */
function echo(data: FormData): Pick<LeadState, 'values' | 'services'> {
  const values: Record<string, string> = {}
  const services: string[] = []
  data.forEach((v, k) => {
    if (typeof v !== 'string') return
    if (k === 'services') services.push(v)
    else values[k] = v
  })
  return { values, services }
}

export async function submitHealthcareLead(prev: LeadState, data: FormData): Promise<LeadState> {
  try {
    return await (rawSubmit as any)(prev, data)
  } catch (e) {
    return { ...echo(data), error: 'We could not submit your request. Your entries are saved; please try again.' }
  }
}
