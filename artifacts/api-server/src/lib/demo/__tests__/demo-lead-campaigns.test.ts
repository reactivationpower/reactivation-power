import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AESTHETICS_DEMO, CHIRO_DEMO, demoEmail } from '../config'
import { DEMO_LEAD_CAMPAIGNS } from '../lead-campaign'
import { planLeadImport, leadEntryStepKey, LEAD_CONFIRM_STEP_KEY } from '@workspace/shared/lead-followup'
import { officeClock, requestedAtLocalDate } from '@workspace/shared/lead-requested-time'

type Campaign = { id: string; ownerId: string; nicheId: string; name: string; offerPriceCents: number | null; priceLineStyle: string }
type Lead = { id: string; campaignId: string; ownerId: string; submittedAt: string; requestedTime: string | null; requestedAt: string | null; status: string; attemptedAt: Date | null }
const campaigns: Campaign[] = []
const leads: Lead[] = []
const grants = new Map<string, boolean>()
let wipingOwner: string | null = null
const participants = [
  { id: 'spa-owner', email: demoEmail(AESTHETICS_DEMO.owner.email), parent_id: null, is_demo: true },
  { id: 'spa-caller', email: demoEmail(AESTHETICS_DEMO.callers[0].email), parent_id: 'spa-owner', is_demo: true },
  { id: 'chiro-owner', email: demoEmail(CHIRO_DEMO.owner.email), parent_id: null, is_demo: true },
]

vi.mock('@/lib/lead-followup/store', () => ({
  createCampaign: async (ownerId: string, _createdBy: string, input: Campaign) => {
    const row = { ...input, id: `campaign-${campaigns.length + 1}`, ownerId }
    campaigns.push(row)
    return row
  },
  importLeads: async ({ campaign, rows }: { campaign: Campaign; rows: { submittedAt: string; firstName: string; phone: string; requestedTime?: string }[] }) => {
    const plan = planLeadImport(rows, [])
    const insertedIds = plan.toInsert.map((row) => {
      const id = `lead-${leads.length + 1}`
      leads.push({ id, campaignId: campaign.id, ownerId: campaign.ownerId, submittedAt: row.submittedAt!.toISOString(), requestedTime: row.requestedTime, requestedAt: row.requestedAt, status: 'new', attemptedAt: null })
      return id
    })
    return { imported: insertedIds.length, insertedIds }
  },
  setLeadStatus: async (ownerId: string, id: string, status: string, attemptedAt: Date | null) => {
    const lead = leads.find((l) => l.id === id && l.ownerId === ownerId)
    if (!lead) throw new Error('cross-practice status update')
    lead.status = status
    lead.attemptedAt = attemptedAt
  },
  wipeLeadFollowUpForOwners: async (ids: string[]) => {
    for (let i = campaigns.length - 1; i >= 0; i--) {
      if (ids.includes(campaigns[i].ownerId)) campaigns.splice(i, 1)
    }
    for (let i = leads.length - 1; i >= 0; i--) {
      if (ids.includes(leads[i].ownerId)) leads.splice(i, 1)
    }
  },
}))
vi.mock('@/lib/lead-followup/access', () => ({
  setLeadFollowUpAccess: async (id: string, enabled: boolean) => { grants.set(id, enabled) },
}))
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    from: (table: string) => ({
      select: () => {
        if (table !== 'participants') throw new Error(`unexpected select ${table}`)
        const filters: ((row: typeof participants[number]) => boolean)[] = []
        const builder = {
          eq: (col: keyof typeof participants[number], value: unknown) => {
            filters.push((row) => row[col] === value)
            return builder
          },
          maybeSingle: async () => ({ data: participants.find((row) => filters.every((f) => f(row))) ?? null, error: null }),
          then: (resolve: (result: { data: typeof participants; error: null }) => void) =>
            resolve({ data: participants.filter((row) => filters.every((f) => f(row))), error: null }),
        }
        return builder
      },
      delete: () => ({
        in: async (_column: string, ids: string[]) => {
          expect(ids).toContain(wipingOwner)
          expect(ids).not.toContain(wipingOwner === 'spa-owner' ? 'chiro-owner' : 'spa-owner')
          return { data: null, error: null }
        },
      }),
    }),
  }),
}))

const { seedLeadFollowUp, wipeDemoPractice } = await import('../seed')
const nichesFor = (practice: typeof AESTHETICS_DEMO | typeof CHIRO_DEMO) =>
  new Map(practice.niches.map((name) => [name, { name, id: name }]))
const reset = async (practice: typeof AESTHETICS_DEMO | typeof CHIRO_DEMO, ownerId: string) => {
  wipingOwner = ownerId
  await wipeDemoPractice(practice)
  wipingOwner = null
  await seedLeadFollowUp(practice, ownerId, nichesFor(practice))
}

beforeEach(() => {
  campaigns.length = 0
  leads.length = 0
  grants.clear()
  wipingOwner = null
  vi.useRealTimers()
})

describe('Lead Follow-Up demo campaigns', () => {
  it('seeds all three aesthetics offers, with three submissions each spanning nearly three days', async () => {
    const now = new Date('2026-09-25T17:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(now)
    await seedLeadFollowUp(AESTHETICS_DEMO, 'spa-owner', nichesFor(AESTHETICS_DEMO))

    expect(grants.get('spa-owner')).toBe(true)
    expect(campaigns.map((c) => [c.nicheId, c.offerPriceCents, c.priceLineStyle])).toEqual([
      ['Acne / Acne Scarring', 4900, 'offer_only'],
      ['Cellulite Reduction', 3700, 'offer_only'],
      ['Microneedling / RF Microneedling', 4900, 'offer_only'],
    ])
    expect(campaigns.map((c) => c.name)).toEqual(DEMO_LEAD_CAMPAIGNS.aesthetics.map((c) => c.name))
    for (const campaign of campaigns) {
      const group = leads.filter((lead) => lead.campaignId === campaign.id)
      expect(group).toHaveLength(3)
      const ages = group.map((lead) => (now.getTime() - new Date(lead.submittedAt).getTime()) / 60_000)
      expect(Math.min(...ages)).toBeLessThan(180)
      expect(Math.max(...ages)).toBeGreaterThan(48 * 60)
      expect(Math.max(...ages)).toBeLessThan(72 * 60)
      expect(group.map((l) => l.status)).toEqual(['new', 'new', 'reached'])
      const fixture = DEMO_LEAD_CAMPAIGNS.aesthetics.find((c) => c.name === campaign.name)!
      for (const [index, lead] of group.slice(0, 2).entries()) {
        if (!fixture.leads[index].appointmentSlot) {
          expect(lead.requestedTime ?? null).toBe(fixture.leads[index].requestedTime ?? null)
          expect(lead.requestedAt).toBeNull()
          expect(leadEntryStepKey(lead)).not.toBe(LEAD_CONFIRM_STEP_KEY)
          continue
        }
        expect(lead.requestedTime).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d$/)
        expect(lead.requestedAt).toBe(lead.requestedTime)
        expect(leadEntryStepKey(lead)).toBe(LEAD_CONFIRM_STEP_KEY)
        expect(requestedAtLocalDate(lead.requestedAt)!.getTime()).toBeGreaterThan(officeClock(now).getTime())
      }
      expect(group[2].requestedAt).toBeNull()
    }
  })

  it('keeps slots ahead of reset time even when submissions precede an office-day boundary, and refreshes them on reset', async () => {
    vi.useFakeTimers()
    const first = new Date('2026-12-30T05:05:00.000Z') // Dec 30, 12:05 AM at the office
    vi.setSystemTime(first)
    await reset(AESTHETICS_DEMO, 'spa-owner')
    const oldSlots = leads.filter((lead) => lead.ownerId === 'spa-owner').map((lead) => lead.requestedAt)
    expect(oldSlots.filter(Boolean)).toHaveLength(2)
    const oldAged = leads.filter((lead) => lead.ownerId === 'spa-owner' && lead.requestedAt)
    expect(oldAged.some((lead) => officeClock(new Date(lead.submittedAt)).getDate() !== officeClock(first).getDate())).toBe(true)
    for (const lead of oldAged) {
      expect(lead.requestedAt).toBe(lead.requestedTime)
      expect(requestedAtLocalDate(lead.requestedAt)!.getTime()).toBeGreaterThan(officeClock(first).getTime())
      expect(leadEntryStepKey(lead)).toBe(LEAD_CONFIRM_STEP_KEY)
    }

    const next = new Date('2026-12-31T05:05:00.000Z') // Dec 31, 12:05 AM at the office
    vi.setSystemTime(next)
    await reset(AESTHETICS_DEMO, 'spa-owner')
    const newSlots = leads.filter((lead) => lead.ownerId === 'spa-owner').map((lead) => lead.requestedAt)
    expect(newSlots.filter(Boolean)).toHaveLength(2)
    for (let i = 0; i < newSlots.length; i++) {
      if (!newSlots[i]) continue
      const previous = requestedAtLocalDate(oldSlots[i])!
      const refreshed = requestedAtLocalDate(newSlots[i])!
      expect(refreshed.getTime() - previous.getTime()).toBe(86_400_000)
      expect(refreshed.getTime()).toBeGreaterThan(officeClock(next).getTime())
    }
    expect(leads.filter((lead) => lead.ownerId === 'spa-owner' && lead.status === 'booked')).toHaveLength(0)
  })

  it('seeds the original chiro offer plus five new offers, including two separate red light packages', async () => {
    const now = new Date('2026-09-25T17:00:00.000Z')
    vi.useFakeTimers()
    vi.setSystemTime(now)
    await seedLeadFollowUp(CHIRO_DEMO, 'chiro-owner', nichesFor(CHIRO_DEMO))
    expect(grants.get('chiro-owner')).toBe(true)
    expect(campaigns.map((c) => [c.nicheId, c.offerPriceCents])).toEqual([
      ['Chiropractic', 4900],
      ['Acoustic Wave Therapy', 4900],
      ['Decompression', 4900],
      ['Neuropathy', 4900],
      ['Red Light / Body Contouring', 3700],
      ['Red Light / Body Contouring', 16400],
    ])
    expect(campaigns.map((c) => c.name)).toEqual(DEMO_LEAD_CAMPAIGNS.chiro.map((c) => c.name))
    expect(CHIRO_DEMO.niches).toContain('Red Light / Body Contouring')
    const bodyFlow = JSON.parse(readFileSync(resolve(__dirname, '../../../../content/flows/red-light-body-contouring.lead.json'), 'utf8'))
    expect(bodyFlow.niche).toMatchObject({ name: 'Red Light / Body Contouring', sector: 'healthcare', is_active: true })
    expect(bodyFlow.steps.some((step: { step_key: string }) => step.step_key === 'recommendation')).toBe(true)
    expect(leads.filter((l) => l.ownerId === 'chiro-owner')).toHaveLength(21)
    expect(leads.filter((l) => l.campaignId === campaigns[0].id)).toHaveLength(6)
    for (const campaign of campaigns.slice(1)) {
      const group = leads.filter((l) => l.campaignId === campaign.id)
      expect(group).toHaveLength(3)
      const ages = group.map((l) => (now.getTime() - Date.parse(l.submittedAt)) / 60_000)
      expect(Math.min(...ages)).toBeLessThan(180)
      expect(Math.max(...ages)).toBeGreaterThan(48 * 60)
      expect(Math.max(...ages)).toBeLessThan(72 * 60)
      expect(group.map((l) => l.status)).toEqual(['new', 'attempted', 'reached'])
    }
  })

  it('leaves all chiro campaigns untouched during repeated aesthetics resets', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-25T17:00:00.000Z'))
    await seedLeadFollowUp(CHIRO_DEMO, 'chiro-owner', nichesFor(CHIRO_DEMO))
    const chiroCampaigns = campaigns.map((c) => ({ ...c }))
    const chiroLeads = leads.map((l) => ({ ...l }))
    expect(chiroCampaigns).toHaveLength(6)
    expect(chiroLeads).toHaveLength(21)

    await reset(AESTHETICS_DEMO, 'spa-owner')
    const firstAge = new Date(leads.find((l) => l.ownerId === 'spa-owner')!.submittedAt).getTime()
    vi.setSystemTime(new Date('2026-09-26T17:00:00.000Z'))
    await reset(AESTHETICS_DEMO, 'spa-owner')

    expect(campaigns.filter((c) => c.ownerId === 'spa-owner')).toHaveLength(3)
    expect(leads.filter((l) => l.ownerId === 'spa-owner')).toHaveLength(9)
    expect(new Date(leads.find((l) => l.ownerId === 'spa-owner')!.submittedAt).getTime() - firstAge).toBe(86_400_000)
    expect(campaigns.filter((c) => c.ownerId === 'chiro-owner')).toEqual(chiroCampaigns)
    expect(leads.filter((l) => l.ownerId === 'chiro-owner')).toEqual(chiroLeads)
    expect(grants.get('chiro-owner')).toBe(true)
  })

  it('leaves aesthetics untouched during repeated chiro resets and refreshes chiro lead ages', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-25T17:00:00.000Z'))
    await seedLeadFollowUp(AESTHETICS_DEMO, 'spa-owner', nichesFor(AESTHETICS_DEMO))
    const spaCampaigns = campaigns.map((c) => ({ ...c }))
    const spaLeads = leads.map((l) => ({ ...l }))
    await reset(CHIRO_DEMO, 'chiro-owner')
    const firstTime = Date.parse(leads.find((l) => l.ownerId === 'chiro-owner' && l.campaignId === campaigns.find((c) => c.ownerId === 'chiro-owner')!.id)!.submittedAt)
    vi.setSystemTime(new Date('2026-09-26T17:00:00.000Z'))
    await reset(CHIRO_DEMO, 'chiro-owner')
    expect(campaigns.filter((c) => c.ownerId === 'chiro-owner')).toHaveLength(6)
    expect(leads.filter((l) => l.ownerId === 'chiro-owner')).toHaveLength(21)
    const secondTime = Date.parse(leads.find((l) => l.ownerId === 'chiro-owner' && l.campaignId === campaigns.find((c) => c.ownerId === 'chiro-owner')!.id)!.submittedAt)
    expect(secondTime - firstTime).toBe(86_400_000)
    expect(campaigns.filter((c) => c.ownerId === 'spa-owner')).toEqual(spaCampaigns)
    expect(leads.filter((l) => l.ownerId === 'spa-owner')).toEqual(spaLeads)
  })

  it('rejects a missing enabled niche before inserting any campaigns', async () => {
    const niches = nichesFor(AESTHETICS_DEMO)
    niches.delete('Cellulite Reduction')
    await expect(seedLeadFollowUp(AESTHETICS_DEMO, 'spa-owner', niches)).rejects.toThrow('lead campaign niche not enabled: Cellulite Reduction')
    expect(campaigns).toEqual([])
    expect(grants.size).toBe(0)
  })
})