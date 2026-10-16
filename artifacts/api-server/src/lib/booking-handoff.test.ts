import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ query: vi.fn(), sync: vi.fn(), events: vi.fn(), slots: vi.fn(), release: vi.fn() }))
vi.mock('@workspace/db', () => ({ pool: { query: mocks.query, connect: async () => ({ query: mocks.query, release: mocks.release }) } }))
vi.mock('./sales-leads/provider', () => ({ safeSalesUpsert: mocks.sync, appointments: mocks.events }))
vi.mock('./ghl', () => ({ getGhlFreeSlots: mocks.slots }))
vi.mock('./marketing/outcomes', () => ({ bookingOutcome: vi.fn() }))
vi.mock('./appointment-messages/store', () => ({ registerAppointment: vi.fn() }))
vi.mock('./appointment-messages/worker', () => ({ runAppointmentMessages: vi.fn() }))
vi.mock('./sales-leads/store', () => ({ stop: vi.fn(), activity: vi.fn() }))
vi.mock('./sales-leads/dispatch', () => ({ nudgeSalesSync: vi.fn() }))
import { newBookingHandoff, readBookingHandoff, withBookingHandoff, checkSavedBooking } from './booking-handoff'

describe('durable saved-inquiry booking', () => {
  let token: ReturnType<typeof newBookingHandoff>, saved: any, lead: any
  const slot = '2027-01-01T15:00:00Z', tz = 'America/New_York'
  beforeEach(() => {
    vi.clearAllMocks()
    token = newBookingHandoff({ name: 'Synthetic', interest: 'both', services: 'Test', inactive: '100', newMonthly: '10' })
    saved = { id: 'submission', lead_id: 'lead', context: { bookingHandoff: token.context }, review: false }
    lead = { id: 'lead', ghl_contact_id:'provider-contact', first_name: 'Synthetic', last_name: 'Test', email: 'test@example.invalid', phone: '+15555550123' }
    mocks.query.mockImplementation(async (sql: string, args: any[]) => {
      if (sql.includes('UNION ALL')) return { rows: args[0] === token.context.hash ? [saved] : [] }
      if (sql.startsWith('SELECT context')) return { rows: [saved] }
      if (sql.startsWith('SELECT * FROM sales_leads')) return { rows: [lead] }
      if (sql.startsWith('UPDATE sales_leads')) lead.ghl_contact_id = args[1]
      if (sql.startsWith('UPDATE sales_submissions')) saved.context.bookingHandoff = JSON.parse(args[1])
      return { rows: [] }
    })
    mocks.sync.mockResolvedValue('provider-contact')
    mocks.slots.mockResolvedValue({ '2027-01-01': [slot] })
    mocks.events.mockResolvedValue([])
  })
  it('uses a short opaque reference and preserves server context through reloads', async () => {
    expect(token.ref).toHaveLength(32)
    expect(token.ref).not.toContain('Synthetic')
    expect(await readBookingHandoff(token.ref)).toEqual(await readBookingHandoff(token.ref))
    const book = vi.fn().mockResolvedValue({ ok: true })
    await withBookingHandoff(token.ref, slot, tz, book)
    await withBookingHandoff(token.ref, slot, tz, book)
    expect(book).toHaveBeenCalledTimes(1)
    expect(book).toHaveBeenCalledWith('provider-contact', token.context.carried)
    expect(mocks.sync).not.toHaveBeenCalled()
  })
  it('reuses completed synchronization', async () => {
    lead.ghl_contact_id = 'existing'
    expect((await withBookingHandoff(token.ref, slot, tz, vi.fn().mockResolvedValue({ ok: true }))).ok).toBe(true)
    expect(mocks.sync).not.toHaveBeenCalled()
  })
  it('waits for the durable worker rather than creating a separate contact on Confirm', async () => {
    lead.ghl_contact_id = null
    const book = vi.fn().mockResolvedValue({ ok: true })
    expect((await withBookingHandoff(token.ref, slot, tz, book)).ok).toBe(false)
    expect((await withBookingHandoff(token.ref, slot, tz, book)).ok).toBe(false)
    expect(mocks.sync).not.toHaveBeenCalled()
    expect(book).not.toHaveBeenCalled()
    lead.ghl_contact_id = 'provider-contact'
    expect((await withBookingHandoff(token.ref, slot, tz, book)).ok).toBe(true)
    expect(book).toHaveBeenCalledTimes(1)
  })
  it('books in one Confirm when the background contact sync finishes moments later', async () => {
    lead.ghl_contact_id = null
    const base = mocks.query.getMockImplementation()!
    let polls = 0
    mocks.query.mockImplementation(async (sql: string, args: any[]) => {
      if (sql.startsWith('SELECT l.ghl_contact_id IS NOT NULL')) {
        polls++
        // The worker saves the contact ID on the second check.
        if (polls === 2) lead.ghl_contact_id = 'provider-contact'
        return { rows: [{ ready: !!lead.ghl_contact_id, active: true }] }
      }
      return base(sql, args)
    })
    const book = vi.fn().mockResolvedValue({ ok: true })
    const result = await withBookingHandoff(token.ref, slot, tz, book)
    expect(result.ok).toBe(true)
    expect(book).toHaveBeenCalledTimes(1)
    expect(book).toHaveBeenCalledWith('provider-contact', token.context.carried)
    expect(mocks.sync).not.toHaveBeenCalled()
    // The lead lock is released before waiting, so the worker can save the contact.
    const sqls = mocks.query.mock.calls.map(call => String(call[0]))
    const firstPoll = sqls.findIndex(sql => sql.startsWith('SELECT l.ghl_contact_id IS NOT NULL'))
    expect(sqls.slice(0, firstPoll).filter(sql => sql.includes('pg_advisory_unlock'))).toHaveLength(1)
  })
  it('stops waiting and asks for a retry when the contact sync is no longer running', async () => {
    lead.ghl_contact_id = null
    const base = mocks.query.getMockImplementation()!
    mocks.query.mockImplementation(async (sql: string, args: any[]) => {
      if (sql.startsWith('SELECT l.ghl_contact_id IS NOT NULL')) return { rows: [{ ready: false, active: false }] }
      return base(sql, args)
    })
    const book = vi.fn().mockResolvedValue({ ok: true })
    const result = await withBookingHandoff(token.ref, slot, tz, book)
    expect(result).toEqual({ ok: false, error: expect.stringContaining('Contact synchronization is still pending') })
    expect(book).not.toHaveBeenCalled()
  })
  it('blocks local and provider identity conflicts', async () => {
    const book = vi.fn()
    saved.review = true
    expect((await withBookingHandoff(token.ref, slot, tz, book)).error).toContain('verify')
    saved.review = false
    lead.ghl_contact_id = null
    expect((await withBookingHandoff(token.ref, slot, tz, book)).error).toContain('pending')
    expect(book).not.toHaveBeenCalled()
  })
  it('rejects missing, invalid and expired references without provider writes', async () => {
    expect(await readBookingHandoff('')).toBeNull()
    expect(await readBookingHandoff('record-id')).toBeNull()
    expect(await readBookingHandoff('x'.repeat(32))).toBeNull()
    saved.context.bookingHandoff.expires = 1
    expect(await readBookingHandoff(token.ref)).toBeNull()
    expect(mocks.sync).not.toHaveBeenCalled()
  })
  it('rejects unavailable slots before reserving an attempt', async () => {
    mocks.slots.mockResolvedValue({})
    const book = vi.fn()
    expect((await withBookingHandoff(token.ref, slot, tz, book)).error).toContain('no longer available')
    expect(book).not.toHaveBeenCalled()
  })
  it('never repeats an uncertain provider write; reconciles exact confirmed events', async () => {
    const book = vi.fn().mockResolvedValue({ ok: false })
    await withBookingHandoff(token.ref, slot, tz, book)
    expect((await withBookingHandoff(token.ref, slot, tz, book)).ok).toBe(false)
    mocks.events.mockResolvedValue([{ id: 'appointment', calendarId: process.env.GHL_CALENDAR_ID, startTime: slot, appointmentStatus: 'confirmed' }])
    expect((await withBookingHandoff(token.ref, slot, tz, book)).ok).toBe(true)
    expect(book).toHaveBeenCalledTimes(1)
  })
  it('allows another slot after a definite provider rejection', async () => {
    const book = vi.fn().mockResolvedValueOnce({ ok: false, retrySafe: true }).mockResolvedValue({ ok: true })
    await withBookingHandoff(token.ref, slot, tz, book)
    expect((await withBookingHandoff(token.ref, slot, tz, book)).ok).toBe(true)
    expect(book).toHaveBeenCalledTimes(2)
  })
  it.each([true, false])('recovers a reload without availability after lost response, completed=%s', async completed => {
    const book = vi.fn().mockResolvedValue({ ok: completed })
    await withBookingHandoff(token.ref, slot, tz, book)
    mocks.slots.mockRejectedValue(new Error('availability offline'))
    mocks.events.mockResolvedValue([{ id: 'event', calendarId: process.env.GHL_CALENDAR_ID, startTime: slot, appointmentStatus: 'confirmed' }])
    expect(await checkSavedBooking(token.ref)).toMatchObject({ ok: true, bookedSlot: slot, bookedTimezone: tz })
    expect(book).toHaveBeenCalledTimes(1)
    expect(mocks.slots).toHaveBeenCalledTimes(1)
  })
})
