import { revalidatePath } from 'next/cache'
import {
  CAMPAIGN_STATUSES,
  MAX_LEAD_IMPORT_ROWS,
  validateCampaignInput,
  type CampaignDraft,
  type CampaignStatus,
  type LeadImportRow,
} from '@workspace/shared/lead-followup'
import { getOwnerNiches } from '@/lib/data/reactivation'
import { leadFollowUpContextOrError } from '@/lib/lead-followup/access'
import * as store from '@/lib/lead-followup/store'

/**
 * Lead Follow-Up actions. Every one of them goes through the product guard
 * first; the RPC allow-list only checks for a signed-in, billing-allowed
 * portal session, and the product grant is a second door on top of that.
 */

/**
 * The niche a campaign is filed under must be one of the account's enabled
 * HEALTHCARE niches — that is what picks the lead script later on.
 */
async function resolveCampaignNiche(ownerId: string, nicheId: string) {
  const niches = await getOwnerNiches(ownerId, ['healthcare'])
  return niches.find((n) => n.id === nicheId) ?? null
}

export async function createCampaign(draft: CampaignDraft) {
  const guard = await leadFollowUpContextOrError()
  if (!guard.ok) return { error: guard.error }
  const { participant, ownerId } = guard.ctx

  const checked = validateCampaignInput(draft ?? {})
  if (!checked.ok) return { errors: checked.errors }
  if (!(await resolveCampaignNiche(ownerId, checked.value.nicheId))) {
    return { errors: { nicheId: 'That service is not enabled on this account.' } }
  }

  const campaign = await store.createCampaign(ownerId, participant.id, checked.value)
  revalidatePath('/portal/campaigns')
  return { campaign }
}

export async function updateCampaign(campaignId: string, draft: CampaignDraft) {
  const guard = await leadFollowUpContextOrError()
  if (!guard.ok) return { error: guard.error }
  const { ownerId } = guard.ctx

  const existing = await store.getCampaign(ownerId, String(campaignId ?? ''))
  if (!existing) return { error: 'Campaign not found.' }

  const checked = validateCampaignInput(draft ?? {})
  if (!checked.ok) return { errors: checked.errors }
  if (!(await resolveCampaignNiche(ownerId, checked.value.nicheId))) {
    return { errors: { nicheId: 'That service is not enabled on this account.' } }
  }

  const campaign = await store.updateCampaign(ownerId, existing.id, checked.value)
  revalidatePath(`/portal/campaigns/${existing.id}`)
  return { campaign }
}

/** Pause, resume (back to active) or archive a campaign. */
export async function setCampaignStatus(campaignId: string, status: CampaignStatus) {
  const guard = await leadFollowUpContextOrError()
  if (!guard.ok) return { error: guard.error }
  const { ownerId } = guard.ctx
  if (!(CAMPAIGN_STATUSES as readonly string[]).includes(status)) {
    return { error: 'Unknown campaign status.' }
  }
  const campaign = await store.setCampaignStatus(ownerId, String(campaignId ?? ''), status)
  if (!campaign) return { error: 'Campaign not found.' }
  revalidatePath('/portal/campaigns')
  return { campaign }
}

/**
 * CSV upload into ONE campaign. A phone already in this campaign is skipped;
 * the same person in another campaign is allowed. Archived campaigns do not
 * take new leads.
 */
export async function importLeads(input: { campaignId: string; rows: LeadImportRow[] }) {
  const guard = await leadFollowUpContextOrError()
  if (!guard.ok) return { error: guard.error }
  const { participant, ownerId } = guard.ctx

  const campaign = await store.getCampaign(ownerId, String(input?.campaignId ?? ''))
  if (!campaign) return { error: 'Campaign not found.' }
  if (campaign.status === 'archived') {
    return { error: 'This campaign is archived. Restore it before adding leads.' }
  }

  const rows = Array.isArray(input.rows) ? input.rows.slice(0, MAX_LEAD_IMPORT_ROWS) : []
  if (rows.length === 0) return { error: 'No rows to import' }

  const result = await store.importLeads({
    campaign,
    rows,
    source: 'upload',
    createdBy: participant.id,
  })
  revalidatePath(`/portal/campaigns/${campaign.id}`)
  return result
}
