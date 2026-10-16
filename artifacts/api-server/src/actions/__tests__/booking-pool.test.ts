import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({
  max: 1, active: 0, peak: 0, exhaustion: 0, failLocal: false,
  submissions: new Map<string, any>(), leads: new Map<string, any>(),
  books: vi.fn(), outcomes: vi.fn(), slots: vi.fn(), events: vi.fn(),
}))
vi.mock('@workspace/db', () => {
  const query = async (sql: string, args: any[] = []) => {
    // Appointment registration now reads settings through the existing
    // transaction. Disabled here; provider/appointment behavior has its own suite.
    if (sql.includes('appointment_message_settings')) return { rows: [{ enabled: false }] }
    if (sql.includes('UNION ALL')) return { rows: [...fixture.submissions.values()].filter(s => s.context.bookingHandoff.hash === args[0]) }
    if (sql.startsWith('SELECT context')) return { rows: [fixture.submissions.get(args[0])] }
    if (sql.startsWith('SELECT * FROM sales_leads')) return { rows: [fixture.leads.get(args[0])] }
    if (sql.startsWith('UPDATE sales_leads SET stage')) {
      if (fixture.failLocal) throw new Error('simulated local failure')
      fixture.leads.get(args[0]).stage = 'Strategy Call Booked'
    }
    if (sql.startsWith('UPDATE sales_jobs')) fixture.leads.get(args[0]).followupsStopped = true
    if (sql.startsWith('UPDATE sales_submissions')) fixture.submissions.get(args[0]).context.bookingHandoff = JSON.parse(args[1])
    return { rows: [] }
  }
  const connect = async () => {
    if (fixture.active >= fixture.max) { fixture.exhaustion++; throw new Error('pool exhausted: nested borrow') }
    fixture.active++
    fixture.peak = Math.max(fixture.active, fixture.peak)
    return { query, release: () => { fixture.active-- } }
  }
  return { pool: { connect, query: async (sql: string, args?: any[]) => {
    const c = await connect()
    try { return await c.query(sql, args) } finally { c.release() }
  } } }
})
vi.mock('@/lib/ghl', () => ({
  ghlConfigured: () => true, bookGhlAppointment: fixture.books, getGhlFreeSlots: fixture.slots,
  getGhlContactName: async () => 'Synthetic', addGhlContactNote: async () => undefined,
  setGhlContactCustomField: async () => undefined,
}))
vi.mock('@/lib/sales-leads/provider', () => ({ appointments: fixture.events, safeSalesUpsert: vi.fn() }))
vi.mock('@/lib/marketing/outcomes', () => ({ bookingOutcome: fixture.outcomes }))
vi.mock('@/lib/appointment-messages/worker', () => ({ runAppointmentMessages: vi.fn() }))
import { bookStrategyCall } from '../booking'
import { pool } from '@workspace/db'
import { newBookingHandoff, checkSavedBooking } from '@/lib/booking-handoff'
const slot = new Date(Date.now() + 86400000).toISOString()
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unexpected external request in isolated booking test')))
  fixture.active = fixture.peak = fixture.exhaustion = 0
  fixture.failLocal = false
  fixture.submissions.clear(); fixture.leads.clear()
  vi.clearAllMocks()
  fixture.books.mockImplementation(async ({ contactId }) => `appointment-${contactId}`)
  fixture.slots.mockResolvedValue({ day: [slot] })
  fixture.outcomes.mockImplementation(async () => {
    // Outcomes can borrow only AFTER the booking connection was released.
    await pool.query('SELECT outcome')
  })
})
afterEach(() => vi.unstubAllGlobals())
function seed(id: string) {
  const token = newBookingHandoff({ interest: 'both' })
  fixture.submissions.set(id, { id, lead_id: id, context: { bookingHandoff: token.context } })
  fixture.leads.set(id, { id, ghl_contact_id: id })
  return { bookingRef: token.ref, slot, timezone: 'America/New_York' }
}
it.each([1, 2])('commits local booking and stops outreach with a %s-client pool', async max => {
  fixture.max = max
  const inputs = Array.from({ length: max }, (_, i) => seed(`synthetic-${i}`))
  const results = await Promise.all(inputs.map(bookStrategyCall))
  expect(results).toEqual(inputs.map(() => expect.objectContaining({ ok: true })))
  expect(fixture.exhaustion).toBe(0)
  expect(fixture.active).toBe(0)
  expect(fixture.books).toHaveBeenCalledTimes(max)
  for (const lead of fixture.leads.values()) expect(lead).toMatchObject({ stage: 'Strategy Call Booked', followupsStopped: true })
  for (const row of fixture.submissions.values()) expect(row.context.bookingHandoff.result.ok).toBe(true)
})
it('keeps a failed local update recoverable without booking again', async () => {
  fixture.max = 1
  const input = seed('synthetic')
  fixture.failLocal = true
  expect((await bookStrategyCall(input)).ok).toBe(false)
  expect(fixture.submissions.get('synthetic').context.bookingHandoff.result).toBeUndefined()
  fixture.failLocal = false
  fixture.events.mockResolvedValue([{ id: 'appointment-synthetic', calendarId: process.env.GHL_CALENDAR_ID, startTime: slot, appointmentStatus: 'confirmed' }])
  expect((await checkSavedBooking(input.bookingRef)).ok).toBe(true)
  expect(fixture.books).toHaveBeenCalledTimes(1)
  expect(fixture.leads.get('synthetic').followupsStopped).toBe(true)
  expect(fixture.exhaustion).toBe(0)
})
