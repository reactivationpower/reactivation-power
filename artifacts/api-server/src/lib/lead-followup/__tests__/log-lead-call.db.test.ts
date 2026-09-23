import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * logLeadCall against a real Postgres: the lead row is locked while the
 * next state is computed, so concurrent callers are all counted and a stale
 * "no answer" cannot undo a booking; archived campaigns and do-not-call
 * leads are refused under the same lock. Uses the workspace database with a
 * throwaway owner id and cleans up after itself; skipped without a database.
 */

const hasDb = Boolean(process.env.SUPABASE_DB_URL)
const OWNER = 'vt-lead-call-owner'

const { campaignLeadsTable, leadCampaignsTable, db, pool } = await import('@workspace/db')
const store = await import('@/lib/lead-followup/store')

const cleanup = () => db.delete(leadCampaignsTable).where(eq(leadCampaignsTable.ownerId, OWNER))

async function seedLead(phone: string) {
  const campaign = await store.createCampaign(OWNER, OWNER, {
    nicheId: 'vt-niche',
    name: 'Row lock special',
    offerItems: ['Exam'],
    regularPriceCents: 24900,
    offerPriceCents: 4900,
    priceLineStyle: 'normally_now',
    urgencyNote: null,
  })
  const imported = await store.importLeads({
    campaign,
    rows: [{ firstName: 'Lock', lastName: 'Test', phone }],
    source: 'manual',
    createdBy: OWNER,
  })
  const lead = (await store.listLeads(campaign.id))[0]
  expect(imported.imported).toBe(1)
  return { campaign, lead }
}

const base = { callerId: OWNER, notes: null, callBackAt: null, bookedAt: null }

describe.skipIf(!hasDb)('logLeadCall (Postgres)', () => {
  beforeAll(cleanup)
  afterAll(async () => {
    await cleanup()
    await pool.end()
  })

  it('counts every concurrent unanswered attempt', async () => {
    const { lead } = await seedLead('3035550901')
    await Promise.all([
      store.logLeadCall({ ...base, lead, disposition: 'no_answer' }),
      store.logLeadCall({ ...base, lead, disposition: 'voicemail' }),
      store.logLeadCall({ ...base, lead, disposition: 'no_answer' }),
    ])
    const [row] = await db.select().from(campaignLeadsTable).where(eq(campaignLeadsTable.id, lead.id))
    expect(row.unansweredAttempts).toBe(3)
    expect(row.status).toBe('attempted')
    expect(await store.listLeadCalls(lead.id)).toHaveLength(3)
  })

  it('never lets a stale no-answer clear a booking that landed first', async () => {
    const { lead } = await seedLead('3035550902')
    const appt = new Date('2026-10-01T15:00:00Z')
    await store.logLeadCall({ ...base, lead, disposition: 'booked', bookedAt: appt })
    // The second caller still holds the pre-booking lead object.
    const { lead: after } = await store.logLeadCall({ ...base, lead, disposition: 'no_answer' })
    expect(after.status).toBe('booked')
    expect(after.bookedAt?.toISOString()).toBe(appt.toISOString())
    expect(after.nextDueAt).toBeNull()
  })

  it('refuses a do-not-call lead and an archived campaign', async () => {
    const { campaign, lead } = await seedLead('3035550903')
    await store.logLeadCall({ ...base, lead, disposition: 'do_not_call' })
    await expect(store.logLeadCall({ ...base, lead, disposition: 'spoke_did_not_book' })).rejects.toThrow(/asked not to be called/)
    const [row] = await db.select().from(campaignLeadsTable).where(eq(campaignLeadsTable.id, lead.id))
    expect(row).toMatchObject({ status: 'closed', lastDisposition: 'do_not_call' })
    expect(await store.listLeadCalls(lead.id)).toHaveLength(1)

    const { lead: other } = await seedLead('3035550904')
    await store.setCampaignStatus(OWNER, campaign.id, 'archived')
    // `other` sits in a different campaign; archive that one too.
    await store.setCampaignStatus(OWNER, other.campaignId, 'archived')
    await expect(store.logLeadCall({ ...base, lead: other, disposition: 'no_answer' })).rejects.toThrow(/archived/)
  })

  it('puts a booked lead who asked for a callback on the call-next list when it is due', async () => {
    const { lead } = await seedLead('3035550906')
    const appt = new Date('2026-10-01T15:00:00Z')
    await store.logLeadCall({ ...base, lead, disposition: 'booked', bookedAt: appt })
    const callBackAt = new Date(Date.now() - 60_000)
    const { lead: after } = await store.logLeadCall({ ...base, lead, disposition: 'callback_later', callBackAt })
    expect(after).toMatchObject({ status: 'booked' })
    expect(after.bookedAt?.toISOString()).toBe(appt.toISOString())
    const queue = await store.callNext(OWNER, new Date())
    const hit = queue.find((q) => q.lead.id === lead.id)
    expect(hit?.reason).toBe('due')
    // Not yet due: off the list.
    const later = new Date(Date.now() + 60 * 60_000)
    await store.logLeadCall({ ...base, lead, disposition: 'callback_later', callBackAt: later })
    expect((await store.callNext(OWNER, new Date())).some((q) => q.lead.id === lead.id)).toBe(false)
  })

  it('puts a lead whose requested slot is within two days ahead of everyone, until it is confirmed', async () => {
    const campaign = await store.createCampaign(OWNER, OWNER, {
      nicheId: 'vt-niche',
      name: 'Requested times',
      offerItems: ['Exam'],
      regularPriceCents: null,
      offerPriceCents: null,
      priceLineStyle: 'no_price',
      urgencyNote: null,
    })
    const now = new Date()
    const soon = new Date(now.getTime() + 6 * 3_600_000)
    const far = new Date(now.getTime() + 10 * 86_400_000)
    const isoWall = (d: Date) => d.toISOString().slice(0, 16)
    await store.importLeads({
      campaign,
      source: 'manual',
      createdBy: OWNER,
      rows: [
        { firstName: 'Soon', phone: '3035550911', requestedTime: isoWall(soon) },
        { firstName: 'Far', phone: '3035550912', requestedTime: isoWall(far) },
        { firstName: 'Vague', phone: '3035550913', requestedTime: 'Saturday' },
        { firstName: 'Plain', phone: '3035550914' },
      ],
    })
    const leads = await store.listLeads(campaign.id)
    const byName = Object.fromEntries(leads.map((l) => [l.firstName, l]))
    expect(byName.Soon.requestedAt?.slice(0, 16).replace(' ', 'T')).toBe(isoWall(soon))
    expect(byName.Vague.requestedAt).toBeNull()

    const queue = await store.callNext(OWNER, now)
    const ids = queue.map((q) => q.lead.id)
    expect(queue.find((q) => q.lead.id === byName.Soon.id)?.reason).toBe('requested')
    expect(ids.indexOf(byName.Soon.id)).toBeLessThan(ids.indexOf(byName.Plain.id))
    // A slot more than two days out is an ordinary new lead, listed once.
    expect(queue.find((q) => q.lead.id === byName.Far.id)?.reason).toBe('new')
    expect(ids.filter((id) => id === byName.Soon.id)).toHaveLength(1)

    const { lead: after } = await store.logLeadCall({ ...base, lead: byName.Soon, disposition: 'confirmed', bookedAt: soon })
    expect(after).toMatchObject({ status: 'confirmed', lastDisposition: 'confirmed' })
    expect(after.bookedAt?.toISOString()).toBe(soon.toISOString())
    expect((await store.callNext(OWNER, now)).some((q) => q.lead.id === byName.Soon.id)).toBe(false)
    const calls = await store.listLeadCalls(byName.Soon.id)
    expect(calls[0]).toMatchObject({ disposition: 'confirmed' })
  })

  it('resolves "tomorrow" on the office (Eastern) calendar, not the server\'s UTC one', async () => {
    const campaign = await store.createCampaign(OWNER, OWNER, {
      nicheId: 'vt-niche',
      name: 'Late-night form',
      offerItems: ['Exam'],
      regularPriceCents: null,
      offerPriceCents: null,
      priceLineStyle: 'no_price',
      urgencyNote: null,
    })
    // Monday 21 Sep 2026 11:30 pm Eastern = Tuesday 03:30 UTC.
    const submittedAt = new Date('2026-09-22T03:30:00Z')
    await store.importLeads({
      campaign,
      source: 'webhook',
      createdBy: OWNER,
      submittedAt,
      rows: [{ firstName: 'Night', phone: '3035550921', requestedTime: 'tomorrow at 3pm' }],
    })
    const [lead] = await store.listLeads(campaign.id)
    expect(lead.requestedAt?.slice(0, 16).replace(' ', 'T')).toBe('2026-09-22T15:00')
    // At 9 am Eastern on Tuesday the slot is six hours out: top of the list.
    const queue = await store.callNext(OWNER, new Date('2026-09-22T13:00:00Z'))
    expect(queue.find((q) => q.lead.id === lead.id)?.reason).toBe('requested')
    // Three days later it is just a stale new lead.
    const later = await store.callNext(OWNER, new Date('2026-09-25T13:00:00Z'))
    expect(later.find((q) => q.lead.id === lead.id)?.reason).toBe('new')
  })

  it('refuses booked without an appointment time and a callback without a time', async () => {
    const { lead } = await seedLead('3035550905')
    await expect(store.logLeadCall({ ...base, lead, disposition: 'booked' })).rejects.toThrow(/appointment/)
    await expect(store.logLeadCall({ ...base, lead, disposition: 'callback_later' })).rejects.toThrow(/called back/)
    expect(await store.listLeadCalls(lead.id)).toHaveLength(0)
  })
})
