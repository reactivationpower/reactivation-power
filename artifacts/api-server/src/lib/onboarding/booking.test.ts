import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Onboarding booking: one meeting per enrollment, signed link as the
 * credential, and uncertain provider writes reconciled before rebooking.
 * Drizzle is an in-memory stand-in; GoHighLevel calls are stubs.
 */
const f = vi.hoisted(() => ({
  tables: {} as Record<string, any[]>,
  book: vi.fn(), slots: vi.fn(), list: vi.fn(), get: vi.fn(), note: vi.fn(), upsert: vi.fn(),
}))

vi.mock('drizzle-orm', () => ({
  eq: (col: any, value: unknown) => ({ col, op: 'eq', value }),
  lt: (col: any, value: unknown) => ({ col, op: 'lt', value }),
  isNotNull: (col: any) => ({ col, op: 'notnull' }),
  and: (...c: any[]) => ({ and: c }),
  or: (...c: any[]) => ({ or: c }),
}))
vi.mock('@workspace/db', () => {
  const table = (name: string, cols: string[]) =>
    Object.assign({ __t: name }, Object.fromEntries(cols.map((c) => [c, { c }])))
  const match = (row: any, cond: any): boolean => {
    if (!cond) return true
    if (cond.and) return cond.and.every((x: any) => match(row, x))
    if (cond.or) return cond.or.some((x: any) => match(row, x))
    const v = row[cond.col.c]
    if (cond.op === 'eq') return v === cond.value
    if (cond.op === 'notnull') return v != null
    return v != null && v < cond.value
  }
  const rows = (t: any) => (f.tables[t.__t] ??= [])
  const db = {
    select: () => ({ from: (t: any) => ({ where: async (c: any) => rows(t).filter((r) => match(r, c)).map((r) => ({ ...r, ghl: r.ghlContactId })) }) }),
    insert: (t: any) => ({ values: (v: any) => ({ onConflictDoNothing: async () => {
      if (!rows(t).some((r) => r.linkId === v.linkId)) rows(t).push({ status: 'open', ghlContactId: null, claimedAt: null, slot: null, timezone: null, ...v })
    } }) }),
    update: (t: any) => ({ set: (v: any) => ({ where: (c: any) => {
      const hit = rows(t).filter((r) => match(r, c))
      hit.forEach((r) => Object.assign(r, v))
      const p: any = Promise.resolve(hit)
      p.returning = async () => hit.map((r) => ({ ...r }))
      return p
    } }) }),
  }
  return {
    db,
    paymentLinkTermsTable: table('terms', ['linkId']),
    customersTable: table('customers', ['id']),
    onboardingBookingsTable: table('bookings', ['linkId', 'status', 'claimedAt']),
    salesLeadsTable: table('leads', ['ghlContactId', 'customerId']),
  }
})
vi.mock('@/lib/ghl', () => ({
  bookGhlAppointment: f.book, getGhlFreeSlots: f.slots, listGhlContactAppointments: f.list,
  getGhlAppointment: f.get, addGhlContactNote: f.note,
}))
vi.mock('@/lib/sales-leads/provider', () => ({ safeSalesUpsert: f.upsert }))
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({
    data: { name: 'Dr. Shannon Example', email: 'Owner@Example.invalid', phone: '5555550100' },
  }) }) }) }) }),
}))
vi.mock('@/lib/app-origin', () => ({ appOrigin: () => 'https://patientpipeline.app' }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }))

import { bookOnboarding, onboardingPage, onboardingRef, onboardingUrl, readOnboardingRef } from './booking'

const LINK = 'link-1'
const future = () => new Date(Date.now() + 3 * 24 * 3600_000).toISOString()

beforeEach(() => {
  process.env.SESSION_SECRET = 'test-secret'
  process.env.GHL_API_TOKEN = 't'
  process.env.GHL_LOCATION_ID = 'loc'
  process.env.GHL_ONBOARDING_CALENDAR_ID = 'onb-cal'
  for (const fn of [f.book, f.slots, f.list, f.get, f.note, f.upsert]) fn.mockReset()
  f.note.mockResolvedValue(undefined)
  f.tables = {
    terms: [{ linkId: LINK, customerId: 'c1', completedAt: new Date() }],
    customers: [{ id: 'c1', fullName: 'Shannon Example', businessName: 'Example Wellness', email: 'owner@example.invalid', phone: '' }],
    bookings: [],
    leads: [{ ghlContactId: 'ghl-other', customerId: 'c2' }],
  }
})

describe('onboarding link', () => {
  it('round-trips the signed reference and rejects tampering', () => {
    const ref = onboardingRef(LINK)
    expect(readOnboardingRef(ref)).toBe(LINK)
    expect(readOnboardingRef(`other-link.${ref.split('.')[1]}`)).toBeNull()
    expect(readOnboardingRef(`${LINK}.x`)).toBeNull()
    expect(onboardingUrl(LINK)).toMatch(/^https:\/\/patientpipeline\.app\/onboarding\?ref=/)
  })

  it('shows the page only for a completed enrollment with a valid link', async () => {
    expect((await onboardingPage('nope')).valid).toBe(false)
    const page = await onboardingPage(onboardingRef(LINK))
    expect(page).toMatchObject({ valid: true, configured: true, firstName: 'Shannon', businessName: 'Example Wellness', booked: null })
  })
})

describe('booking an onboarding meeting', () => {
  it('books once on the onboarding calendar, never touching contacts linked to other leads', async () => {
    f.upsert.mockResolvedValue('ghl-new')
    f.book.mockResolvedValue('appt-1')
    const slot = future()
    const res = await bookOnboarding({ ref: onboardingRef(LINK), slot, timezone: 'America/Chicago' })
    expect(res).toEqual({ ok: true, bookedSlot: slot, bookedTimezone: 'America/Chicago' })
    expect(f.upsert.mock.calls[0][0]).toMatchObject({ email: 'owner@example.invalid', companyName: 'Example Wellness' })
    expect(f.upsert.mock.calls[0][1]).toEqual(['ghl-other'])
    expect(f.book.mock.calls[0][0]).toMatchObject({ contactId: 'ghl-new', calendarId: 'onb-cal', startTime: slot })
    // A second attempt reports the existing booking instead of booking again.
    const again = await bookOnboarding({ ref: onboardingRef(LINK), slot: future(), timezone: 'America/New_York' })
    expect(again.ok).toBe(true)
    expect(again.bookedSlot).toBe(slot)
    expect(f.book).toHaveBeenCalledTimes(1)
    expect((await onboardingPage(onboardingRef(LINK))).booked).toMatchObject({ slot, timezone: 'America/Chicago' })
  })

  it('uses the contact already linked to this customer', async () => {
    f.tables.leads.push({ ghlContactId: 'ghl-own', customerId: 'c1' })
    f.book.mockResolvedValue('appt-1')
    await bookOnboarding({ ref: onboardingRef(LINK), slot: future(), timezone: 'America/New_York' })
    expect(f.upsert).not.toHaveBeenCalled()
    expect(f.book.mock.calls[0][0].contactId).toBe('ghl-own')
  })

  it('lets the customer pick again after a definite rejection', async () => {
    f.upsert.mockResolvedValue('ghl-new')
    f.book.mockRejectedValueOnce(Object.assign(new Error('slot taken'), { bookingRejected: true })).mockResolvedValueOnce('appt-2')
    const first = await bookOnboarding({ ref: onboardingRef(LINK), slot: future(), timezone: 'America/New_York' })
    expect(first).toMatchObject({ ok: false, error: 'That time is no longer available. Pick another.' })
    expect((await bookOnboarding({ ref: onboardingRef(LINK), slot: future(), timezone: 'America/New_York' })).ok).toBe(true)
  })

  it('does not rebook after an uncertain write until the provider is checked', async () => {
    f.upsert.mockResolvedValue('ghl-new')
    f.book.mockRejectedValueOnce(new Error('timeout'))
    f.list.mockResolvedValue([])
    const slot = future()
    expect((await bookOnboarding({ ref: onboardingRef(LINK), slot, timezone: 'America/New_York' })).ok).toBe(false)
    const blocked = await bookOnboarding({ ref: onboardingRef(LINK), slot: future(), timezone: 'America/New_York' })
    expect(blocked.error).toMatch(/still confirming/)
    expect(f.book).toHaveBeenCalledTimes(1)
    // The provider did save it: reconciliation marks it booked.
    f.list.mockResolvedValue([{ id: 'appt-9', calendarId: 'onb-cal', deleted: false, appointmentStatus: 'confirmed', dateAdded: new Date().toISOString(), startTime: 'x' }])
    f.get.mockResolvedValue({ id: 'appt-9', startTime: slot })
    const page = await onboardingPage(onboardingRef(LINK))
    expect(page.booked).toMatchObject({ slot })
    expect(f.book).toHaveBeenCalledTimes(1)
  })

  it('refuses invalid links and past times, and reports an unopened calendar', async () => {
    expect((await bookOnboarding({ ref: 'bad', slot: future(), timezone: 'America/New_York' })).ok).toBe(false)
    expect((await bookOnboarding({ ref: onboardingRef(LINK), slot: new Date(Date.now() - 1000).toISOString(), timezone: 'America/New_York' })).error)
      .toMatch(/no longer available/)
    delete process.env.GHL_ONBOARDING_CALENDAR_ID
    expect((await bookOnboarding({ ref: onboardingRef(LINK), slot: future(), timezone: 'America/New_York' })).error).toMatch(/not open yet/)
    expect(f.book).not.toHaveBeenCalled()
  })
})
