// Thin client stubs for the server actions in artifacts/api-server/src/actions/lead-followup.ts
import { action } from '@/lib/api'

export const createCampaign = action<any>('lead-followup', 'createCampaign')
export const updateCampaign = action<any>('lead-followup', 'updateCampaign')
export const setCampaignStatus = action<any>('lead-followup', 'setCampaignStatus')
export const importLeads = action<any>('lead-followup', 'importLeads')

export const logLeadCall = action<any>('lead-followup', 'logLeadCall')
export const retryParkedLead = action<any>('lead-followup', 'retryParkedLead')
export const regenerateWebhookUrl = action<any>('lead-followup', 'regenerateWebhookUrl')
export const saveWebhookFieldMapping = action<any>('lead-followup', 'saveWebhookFieldMapping')
export const sendTestWebhook = action<any>('lead-followup', 'sendTestWebhook')
export const saveCampaignLeadSource = action<any>('lead-followup', 'saveCampaignLeadSource')
