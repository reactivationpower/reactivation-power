// Thin client stubs for the server actions in artifacts/api-server/src/actions/lead-followup.ts
import { action } from '@/lib/api'

export const createCampaign = action<any>('lead-followup', 'createCampaign')
export const updateCampaign = action<any>('lead-followup', 'updateCampaign')
export const setCampaignStatus = action<any>('lead-followup', 'setCampaignStatus')
export const importLeads = action<any>('lead-followup', 'importLeads')
