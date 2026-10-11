import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import pg from 'pg'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { eq, sql } from 'drizzle-orm'
import * as schema from '@workspace/db/schema'
import { defaultPolicy } from './policy'
import type { Simulation } from './store'

const fixture = vi.hoisted(() => ({ db: null as unknown, reply: null as null | (() => Promise<unknown>) }))
vi.mock('@workspace/db', async () => ({ ...await vi.importActual('@workspace/db'), get db() { return fixture.db } }))
vi.mock('./model', () => ({
  DemoModelError: class extends Error {},
  generateReply: () => fixture.reply ? fixture.reply() : Promise.resolve({ text: 'Your preferences are pending staff confirmation.', preferences: 'Wednesday after 3, pending staff confirmation', handoff: null, id: 'fixture-not-ai', tokens: 0 }),
}))
const available = Boolean(process.env.SUPABASE_DB_URL)
const namespace = `text_test_${randomUUID().replaceAll('-', '')}`
const admin = available ? new pg.Pool({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, max: 1 }) : null
let pool: pg.Pool
let database: NodePgDatabase<typeof schema>
const service = await import('./store')
const live = await import('./live')
const worker = await import('./worker')
const base = (): Simulation => ({
  mode: 'simulation', leadId: 'fictional', campaignId: 'synthetic', patient: 'Melissa Tran', submittedAt: '2026-10-01T00:00:00Z',
  campaign: { name: 'Fixture', offerItems: ['Exam'], priceLineStyle: 'offer_only', offerPriceCents: 4900, regularPriceCents: null },
  practice: 'Fictional', script: {}, policy: { ...defaultPolicy, afterHours: true },
  clock: '2026-10-10T16:00:00Z', recipientTimezone: 'America/Denver', consent: true, stopped: false,
  ownership: 'ai', reason: null, nextOpening: null, messages: [], events: [], revision: 0, pending: null,
  reminderAt: null, reminded: false, preferences: '', processed: [],
})
async function seed(owner: string) {
  await database.insert(schema.patientTextSimulations).values({ id: randomUUID(), ownerId: owner, leadId: 'fictional', phoneKey: owner, state: base() })
}
const cmd = (kind: 'patient' | 'clock' | 'takeover' | 'reset', fields = {}) => ({ kind, eventId: randomUUID(), ...fields })
describe.skipIf(!available)('isolated patient texting simulation transactions; mocked model, no SMS', () => {
  beforeAll(async () => {
    await admin!.query(`CREATE SCHEMA "${namespace}"`)
    for (const name of ['patient_text_simulations', 'patient_text_budget', 'patient_text_policies',
      'patient_text_recipients', 'patient_text_threads', 'patient_text_messages', 'patient_text_intents',
      'patient_text_connections', 'campaign_leads']) {
      await admin!.query(`CREATE TABLE "${namespace}"."${name}" (LIKE public."${name}" INCLUDING ALL)`)
    }
    pool = new pg.Pool({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false }, max: 2 })
    pool.on('connect', client => { client.query(`SET search_path TO "${namespace}"`).catch(() => undefined) })
    database = drizzle(pool, { schema })
    fixture.db = database
  })
  afterAll(async () => {
    await pool?.end()
    await admin?.query(`DROP SCHEMA IF EXISTS "${namespace}" CASCADE`)
    await admin?.end()
  })
  it('rejects other-tenant reads and mutations', async () => {
    await seed('isolation')
    expect(await service.readSimulation('other', 'fictional')).toBeNull()
    await expect(service.changeSimulation('other', 'fictional', cmd('takeover'))).rejects.toThrow()
  })
  it('deduplicates inbound events and preserves one transcript ordering', async () => {
    await seed('dedupe')
    const input = cmd('patient', { text: 'Wednesday after 3 please' })
    await service.changeSimulation('dedupe', 'fictional', input)
    const again = await service.changeSimulation('dedupe', 'fictional', input)
    expect(again?.messages).toHaveLength(2)
    expect(again?.messages.map(m => m.role)).toEqual(['patient','assistant'])
  })
  it('discards in-flight model output after takeover', async () => {
    await seed('race')
    let release!: () => void
    let entered!: () => void
    const started = new Promise<void>(r => { entered = r })
    const latch = new Promise<void>(r => { release = r })
    fixture.reply = async () => { entered(); await latch; return { text: 'Discard this', preferences: '', handoff: null, id: 'fixture', tokens: 0 } }
    const sending = service.changeSimulation('race', 'fictional', cmd('patient', { text: 'Hi' }))
    await started
    await service.changeSimulation('race', 'fictional', cmd('takeover'))
    release(); await sending; fixture.reply = null
    const state = (await service.readSimulation('race', 'fictional'))!.state
    expect(state.ownership).toBe('team'); expect(state.messages).toHaveLength(1)
  })
  it('STOP suppresses later sends and opening never resumes takeover', async () => {
    await seed('stop')
    await service.changeSimulation('stop', 'fictional', cmd('patient', { text: 'STOP' }))
    await service.changeSimulation('stop', 'fictional', cmd('patient', { text: 'Hello?' }))
    const s = await service.changeSimulation('stop', 'fictional', cmd('clock', { clock: '2026-10-12T15:00:00Z' }))
    expect(s?.stopped).toBe(true); expect(s?.ownership).toBe('team')
    expect(s?.messages.every(m => m.role === 'patient')).toBe(true)
  })
  it('accepts STOP during an in-flight model reply and discards late output', async () => {
    await seed('stop-race')
    let release!: () => void
    let entered!: () => void
    const started = new Promise<void>(r => { entered = r })
    const latch = new Promise<void>(r => { release = r })
    fixture.reply = async () => { entered(); await latch; return { text: 'Must not be delivered', preferences: '', handoff: null, id: 'fixture', tokens: 0 } }
    const sending = service.changeSimulation('stop-race', 'fictional', cmd('patient', { text: 'Hello' }))
    await started
    await service.changeSimulation('stop-race', 'fictional', cmd('patient', { text: 'STOP' }))
    release(); await sending; fixture.reply = null
    const s = (await service.readSimulation('stop-race', 'fictional'))!.state
    expect(s.stopped).toBe(true); expect(s.messages.map(m => m.role)).toEqual(['patient','patient'])
  })
  it('office opening does not take an active AI conversation away', async () => {
    await seed('opening')
    const s = await service.changeSimulation('opening', 'fictional', cmd('clock', { clock: '2026-10-12T15:00:00Z' }))
    expect(s?.ownership).toBe('ai')
  })
  it('sends one reminder then hands to staff; reset never resets spend', async () => {
    await seed('reminder')
    await service.changeSimulation('reminder', 'fictional', cmd('patient', { text: 'Tell me about the offer' }))
    await service.changeSimulation('reminder', 'fictional', cmd('clock', { clock: '2026-10-11T16:00:00Z' }))
    const s = await service.changeSimulation('reminder', 'fictional', cmd('clock', { clock: '2026-10-12T16:00:00Z' }))
    expect(s?.ownership).toBe('team')
    expect(s?.messages.filter(m => m.source === 'rule')).toHaveLength(1)
    const before = await service.budgetStatus()
    await service.changeSimulation('reminder', 'fictional', cmd('reset'))
    expect(await service.budgetStatus()).toEqual(before)
    expect((await service.readSimulation('dedupe', 'fictional'))?.state.messages).toHaveLength(2)
  })
  it('atomic budget cannot exceed its authorized ceiling', async () => {
    await database.execute(sql`UPDATE patient_text_budget SET reserved_cents = 100`)
    await seed('budget')
    const s = await service.changeSimulation('budget', 'fictional', cmd('patient', { text: 'Hello' }))
    expect(s?.ownership).toBe('team')
    expect((await service.budgetStatus()).reservedCents).toBe(100)
  })
  it('shares recipients across campaigns and isolates offices', async () => {
    for (const [id, ownerId, campaignId] of [['lead-a','office-a','campaign-a'], ['lead-b','office-a','campaign-b'], ['lead-c','office-b','campaign-c']]) {
      await database.insert(schema.campaignLeadsTable).values({ id, ownerId, campaignId, firstName: 'Fictional',
        phone: '3035550100', phoneKey: '3035550100', source: 'synthetic' })
    }
    const a = await live.openLiveThread('office-a', 'lead-a')
    const b = await live.openLiveThread('office-a', 'lead-b')
    const c = await live.openLiveThread('office-b', 'lead-c')
    expect(a!.thread.id).toBe(b!.thread.id); expect(c!.thread.id).not.toBe(a!.thread.id)
    expect(a!.recipient.consent).toBe(false); expect(a!.recipient.timezone).toBeNull()
    expect(await live.liveThread('office-b','lead-a')).toBeNull()
    await expect(live.takeLiveThread('office-b', 'lead-a', 'other', '', randomUUID())).rejects.toThrow()
  })
  it('deduplicates authenticated synthetic inbound and applies STOP practice-wide', async () => {
    const event = `twilio/${randomUUID()}`
    await live.applyAuthenticatedInbound('office-a', '3035550100', event, 'STOP')
    const duplicate = await live.applyAuthenticatedInbound('office-a', '3035550100', event, 'STOP')
    expect(duplicate).toMatchObject({ duplicate: true })
    const a = await live.liveThread('office-a','lead-b')
    expect(a!.recipient.stopped).toBe(true); expect(a!.messages).toHaveLength(1)
    expect((await live.liveThread('office-b','lead-c'))!.recipient.stopped).toBe(false)
    await expect(live.saveRecipientEligibility('office-a','lead-a', { stopped: false, consent: true,
      evidence: 'Synthetic', timezone: 'America/Denver' })).rejects.toThrow(/cannot be cleared/)
  })
  it('call claim atomically cancels pending text and worker never dispatches', async () => {
    const c = (await live.liveThread('office-b','lead-c'))!
    await database.update(schema.patientTextThreads).set({ ownership: 'ai' }).where(eq(schema.patientTextThreads.id,c.thread.id))
    await database.insert(schema.patientTextIntents).values({ id: 'synthetic-intent', ownerId: 'office-b',
      threadId: c.thread.id, revision: 0, status: 'pending', kind: 'new_lead', dueAt: new Date(0) })
    await database.transaction(async tx => {
      await live.withRecipientLock(tx, 'office-b', '3035550100')
      await live.pauseForCall(tx, 'office-b', '3035550100')
    })
    expect(await worker.reconcileTextIntents()).toMatchObject({ sends: 0, liveEnabled: false })
    const [intent] = await database.select().from(schema.patientTextIntents).where(eq(schema.patientTextIntents.id, 'synthetic-intent'))
    expect(intent.status).toBe('cancelled')
    expect((await live.liveThread('office-b','lead-c'))!.thread.ownership).toBe('team')
  })
})
