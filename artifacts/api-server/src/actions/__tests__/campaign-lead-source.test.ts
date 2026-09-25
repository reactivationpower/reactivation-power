import { beforeEach, describe, expect, it, vi } from 'vitest'

const { context, save, revalidate } = vi.hoisted(() => ({
  context: vi.fn(),
  save: vi.fn(),
  revalidate: vi.fn(),
}))

vi.mock('@/lib/lead-followup/access', () => ({ leadFollowUpContextOrError: context }))
vi.mock('@/lib/lead-followup/store', () => ({ updateCampaignLeadSource: save }))
vi.mock('next/cache', () => ({ revalidatePath: revalidate }))

import { saveCampaignLeadSource } from '../lead-followup'

describe('saveCampaignLeadSource', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    context.mockResolvedValue({ ok: true, ctx: { ownerId: 'owner-1', isOwner: true } })
    save.mockResolvedValue({ id: 'campaign-1', leadSourceSetup: 'ghl' })
  })

  it('requires product access and owner role', async () => {
    context.mockResolvedValueOnce({ ok: false, error: 'Not signed in' })
    expect(await saveCampaignLeadSource('campaign-1', 'ghl')).toEqual({ error: 'Not signed in' })
    context.mockResolvedValueOnce({ ok: true, ctx: { ownerId: 'owner-1', isOwner: false } })
    expect(await saveCampaignLeadSource('campaign-1', 'ghl')).toEqual({
      error: 'Only the account owner can change lead source setup.',
    })
    expect(save).not.toHaveBeenCalled()
  })

  it('accepts only known source values and never writes invalid values', async () => {
    for (const invalid of ['', 'webhook', 'GHL', null, { source: 'ghl' }]) {
      expect(await saveCampaignLeadSource('campaign-1', invalid as never)).toEqual({ error: 'Unknown lead source.' })
    }
    expect(save).not.toHaveBeenCalled()
    for (const source of ['ghl', 'facebook', 'website', 'unsure'] as const) {
      await saveCampaignLeadSource('campaign-1', source)
      expect(save).toHaveBeenLastCalledWith('owner-1', 'campaign-1', source)
    }
  })

  it('does not expose another account’s campaign', async () => {
    save.mockResolvedValueOnce(null)
    expect(await saveCampaignLeadSource('other-account-campaign', 'ghl')).toEqual({ error: 'Campaign not found.' })
    expect(save).toHaveBeenCalledWith('owner-1', 'other-account-campaign', 'ghl')
    expect(revalidate).not.toHaveBeenCalled()
  })

  it('returns the saved campaign and revalidates its detail', async () => {
    expect(await saveCampaignLeadSource('campaign-1', 'ghl')).toEqual({
      campaign: { id: 'campaign-1', leadSourceSetup: 'ghl' },
    })
    expect(revalidate).toHaveBeenCalledWith('/portal/campaigns/campaign-1')
  })
})