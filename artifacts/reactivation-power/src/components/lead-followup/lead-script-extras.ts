import { campaignTokens } from '@workspace/shared/campaign-tokens'
import { providerTokens, spokenProviderName, type ProviderSource } from '@/lib/provider-name'

export interface LeadScriptCampaign {
  name: string
  offerItems: string[]
  regularPriceCents: number | null
  offerPriceCents: number | null
  priceLineStyle: string
  urgencyNote: string | null
}

export interface LeadScriptLead {
  firstName: string
  lastName: string
  submittedAt: string | Date | null
  requestedAt?: string | null
}

/**
 * Every token a LEAD flow can read, in one place so the live call screen and
 * the practice page fill the script identically: the person tokens the
 * reactivation screens use, the provider tokens, and the campaign tokens.
 * `lead` is null on the practice page; the placeholders then read like the
 * reactivation practice screen ("[patient name]").
 */
export function leadScriptExtras(opts: {
  campaign: LeadScriptCampaign
  lead: LeadScriptLead | null
  callerName: string
  practiceName: string | null
  owner: ProviderSource | null
  isProvider: boolean
  now?: Date
}): Record<string, string> {
  const { campaign, lead, callerName, practiceName, owner, isProvider } = opts
  const fullName = lead ? `${lead.firstName} ${lead.lastName}`.trim() : '[lead name]'
  const e: Record<string, string> = {
    contact_first_name: lead ? lead.firstName : '[lead name]',
    contact_full_name: fullName,
    caller_name: callerName,
    your_name: callerName,
    rec_pronoun: isProvider ? 'I' : 'we',
    rec_pronoun_cap: isProvider ? 'I' : 'We',
    rec_obj: isProvider ? 'me' : 'us',
    rec_poss: isProvider ? 'my' : 'our',
  }
  if (practiceName) e.practice_name = practiceName
  // Lead campaigns are healthcare-only, so the provider reads as "Dr. Last".
  Object.assign(e, providerTokens(spokenProviderName(owner, 'healthcare'), isProvider))
  Object.assign(e, campaignTokens(campaign, lead ? { submittedAt: lead.submittedAt, requestedAt: lead.requestedAt ?? null } : null, opts.now))
  return e
}
