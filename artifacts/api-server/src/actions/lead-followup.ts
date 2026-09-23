import { revalidatePath } from 'next/cache'
import {
  CAMPAIGN_STATUSES,
  MAX_LEAD_IMPORT_ROWS,
  isLeadDisposition,
  leadCallBlockReason,
  leadDispositionFieldError,
  validateCampaignInput,
  type CampaignDraft,
  type CampaignStatus,
  type LeadDisposition,
  type LeadImportRow,
} from '@workspace/shared/lead-followup'
import {
  buildTestPayload,
  sanitizeFieldMapping,
  type WebhookFieldMapping,
} from '@workspace/shared/lead-webhooks'
import { getOwnerNiches } from '@/lib/data/reactivation'
import { leadWebhookUrl } from '@/lib/lead-followup/webhook-url'
import { TEST_HEADER } from '@/routes/webhooks-leads'
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

/**
 * Log one call against a lead and move it along the lead cadence. The
 * caller must belong to the campaign's account; the result carries the
 * updated lead so the call screen can show where it landed.
 */
export async function logLeadCall(input: {
  leadId: string
  disposition: LeadDisposition
  notes?: string | null
  callBackAt?: string | null
  bookedAt?: string | null
}) {
  const guard = await leadFollowUpContextOrError()
  if (!guard.ok) return { error: guard.error }
  const { participant, ownerId } = guard.ctx

  if (!isLeadDisposition(input?.disposition)) return { error: 'Unknown call outcome.' }
  const lead = await store.getLead(ownerId, String(input.leadId ?? ''))
  if (!lead) return { error: 'Lead not found.' }

  const parseWhen = (v: string | null | undefined, label: string) => {
    if (!v) return { ok: true as const, value: null }
    const d = new Date(v)
    if (Number.isNaN(d.getTime())) return { ok: false as const, error: `Pick a valid ${label}.` }
    return { ok: true as const, value: d }
  }
  const callBack = parseWhen(input.callBackAt, 'callback time')
  if (!callBack.ok) return { error: callBack.error }
  const booked = parseWhen(input.bookedAt, 'appointment time')
  if (!booked.ok) return { error: booked.error }
  const callBackAt = input.disposition === 'callback_later' ? callBack.value : null
  const bookedAt = input.disposition === 'booked' ? booked.value : null
  const fieldError = leadDispositionFieldError({ disposition: input.disposition, callBackAt, bookedAt })
  if (fieldError) return { error: fieldError }
  const campaign = await store.getCampaign(ownerId, lead.campaignId)
  const blocked = leadCallBlockReason(campaign ?? { status: 'archived' }, lead)
  if (blocked) return { error: blocked }

  const notes = typeof input.notes === 'string' ? input.notes.trim().slice(0, 4000) || null : null
  let result: Awaited<ReturnType<typeof store.logLeadCall>>
  try {
    result = await store.logLeadCall({
      lead,
      callerId: participant.id,
      disposition: input.disposition,
      notes,
      callBackAt,
      bookedAt,
    })
  } catch (err) {
    // Eligibility is re-checked under the row lock; a race with an archive or
    // a do-not-call logged a moment earlier surfaces here.
    if (err instanceof store.LeadCallBlockedError) return { error: err.message }
    throw err
  }
  revalidatePath(`/portal/campaigns/${lead.campaignId}`)
  revalidatePath(`/portal/campaigns/${lead.campaignId}/leads/${lead.id}`)
  revalidatePath('/portal/start')
  return { call: result.call, lead: result.lead }
}

// ---------- lead sources (webhook intake) ----------

/** New secret URL for a campaign; the previous one stops working at once. */
export async function regenerateWebhookUrl(campaignId: string) {
  const guard = await leadFollowUpContextOrError()
  if (!guard.ok) return { error: guard.error }
  const { ownerId } = guard.ctx
  const campaign = await store.regenerateWebhookToken(ownerId, String(campaignId ?? ''))
  if (!campaign) return { error: 'Campaign not found.' }
  revalidatePath(`/portal/campaigns/${campaign.id}`)
  return { webhookUrl: leadWebhookUrl(campaign.webhookToken) }
}

/** Owner overrides for which incoming field lands where. Blank = automatic. */
export async function saveWebhookFieldMapping(campaignId: string, mapping: unknown) {
  const guard = await leadFollowUpContextOrError()
  if (!guard.ok) return { error: guard.error }
  const { ownerId } = guard.ctx
  const clean = sanitizeFieldMapping(mapping)
  const campaign = await store.updateFieldMapping(ownerId, String(campaignId ?? ''), clean)
  if (!campaign) return { error: 'Campaign not found.' }
  revalidatePath(`/portal/campaigns/${campaign.id}`)
  return { fieldMapping: clean }
}

/**
 * Post a sample payload to the campaign's own public URL, exactly the way a
 * form tool would, so the owner sees a real entry in "Last 20 received"
 * before wiring anything up.
 */
export async function sendTestWebhook(campaignId: string) {
  const guard = await leadFollowUpContextOrError()
  if (!guard.ok) return { error: guard.error }
  const { ownerId } = guard.ctx
  const campaign = await store.getCampaign(ownerId, String(campaignId ?? ''))
  if (!campaign) return { error: 'Campaign not found.' }

  const url = leadWebhookUrl(campaign.webhookToken)
  const payload = buildTestPayload((campaign.fieldMapping ?? {}) as WebhookFieldMapping)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [TEST_HEADER]: '1' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    })
    const body = (await res.json().catch(() => ({}))) as { error?: string; outcome?: string }
    if (!res.ok) {
      return { error: `The URL answered ${res.status}: ${body.error ?? 'no details'}`, status: res.status }
    }
    return { ok: true, status: res.status, outcome: body.outcome ?? null }
  } catch (err) {
    return { error: `Could not reach ${url}: ${err instanceof Error ? err.message : String(err)}` }
  }
}
