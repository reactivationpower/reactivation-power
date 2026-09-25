import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const hasDb = Boolean(process.env.SUPABASE_DB_URL)
const OWNER = `vt-connection-${randomUUID()}`
const { leadCampaignsTable, db, pool } = await import('@workspace/db')
const store = await import('@/lib/lead-followup/store')
const cleanup = () => db.delete(leadCampaignsTable).where(eq(leadCampaignsTable.ownerId, OWNER))

describe.skipIf(!hasDb)('campaign connection summary (Postgres)', () => {
  beforeAll(cleanup)
  afterAll(async () => {
    await cleanup()
    await pool.end()
  })

  it('separates internal tests from external receipts across more than 20 events', async () => {
    const campaign = await store.createCampaign(OWNER, OWNER, {
      nicheId: 'vt-niche',
      name: 'Connection summary test',
      offerItems: [],
      regularPriceCents: null,
      offerPriceCents: null,
      priceLineStyle: 'no_price',
      urgencyNote: null,
    })
    expect(campaign.leadSourceSetup).toBe('unsure')
    expect(await store.updateCampaignLeadSource('another-owner', campaign.id, 'ghl')).toBeNull()
    expect((await store.getCampaign(OWNER, campaign.id))?.leadSourceSetup).toBe('unsure')
    expect((await store.updateCampaignLeadSource(OWNER, campaign.id, 'facebook'))?.leadSourceSetup).toBe('facebook')
    const record = (source: string, outcome: 'created' | 'updated' | 'rejected') =>
      store.recordWebhookEvent({ campaign, source, outcome, contentType: 'application/json', payload: {} })
    expect(await store.getCampaignConnectionSummary(campaign.id)).toEqual({
      lastExternalReceivedAt: null, lastInternalTestAt: null,
    })
    const external = await record('webhook', 'created')
    for (let i = 0; i < 22; i++) await record('test', 'updated')
    const internal = await record('test', 'created')
    await record('gohighlevel', 'rejected')
    await record('test', 'rejected')

    expect(await store.listWebhookEvents(campaign.id)).toHaveLength(20)
    expect((await store.listWebhookEvents(campaign.id)).some((event) => event.id === external.id)).toBe(false)
    expect(await store.getCampaignConnectionSummary(campaign.id)).toEqual({
      lastExternalReceivedAt: external.receivedAt.toISOString(),
      lastInternalTestAt: internal.receivedAt.toISOString(),
    })
    const latestExternal = await record('gohighlevel', 'updated')
    expect((await store.getCampaignConnectionSummary(campaign.id)).lastExternalReceivedAt)
      .toBe(latestExternal.receivedAt.toISOString())
  })
})