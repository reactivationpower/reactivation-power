// Thin client stubs for the server actions in artifacts/api-server/src/actions/lead-followup.ts
import { action, apiUrl } from '@/lib/api'

export const createCampaign = action<any>('lead-followup', 'createCampaign')
export const updateCampaign = action<any>('lead-followup', 'updateCampaign')
export const setCampaignStatus = action<any>('lead-followup', 'setCampaignStatus')
export const importLeads = action<any>('lead-followup', 'importLeads')

export const logLeadCall = action<any>('lead-followup', 'logLeadCall')
export const claimLeadCall = action<any>('lead-followup', 'claimLeadCall')
export const renewLeadCall = action<any>('lead-followup', 'renewLeadCall')
export const releaseLeadCall = action<any>('lead-followup', 'releaseLeadCall')

/** Page unload cannot await a normal action. Use the same authenticated RPC
 * endpoint and JSON args; a failed delivery is covered by the expiring lease.
 */
export function releaseLeadCallOnPageHide(leadId: string, token: string): void {
  const url = apiUrl('/actions/lead-followup/releaseLeadCall')
  const body = JSON.stringify({ args: [leadId, token] })
  if (navigator.sendBeacon?.(url, new Blob([body], { type: 'application/json' }))) return
  void fetch(url, {
    method: 'POST',
    credentials: 'include',
    keepalive: true,
    headers: { 'content-type': 'application/json' },
    body,
  }).catch(() => {
    // Page is closing; no UI remains to report a delivery error. The
    // server's two-minute lease expiry remains the safety net.
  })
}
export const retryParkedLead = action<any>('lead-followup', 'retryParkedLead')
export const regenerateWebhookUrl = action<any>('lead-followup', 'regenerateWebhookUrl')
export const saveWebhookFieldMapping = action<any>('lead-followup', 'saveWebhookFieldMapping')
export const sendTestWebhook = action<any>('lead-followup', 'sendTestWebhook')
export const saveCampaignLeadSource = action<any>('lead-followup', 'saveCampaignLeadSource')
