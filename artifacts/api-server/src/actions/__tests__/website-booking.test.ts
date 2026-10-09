import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/booking-handoff', () => ({
  withLegacyBooking: async (id: string, _slot: string, _tz: string, carried: any, book: any) => book(id, carried),
}))
vi.mock('@/lib/sales-leads/store', () => ({ transaction: async () => undefined }))
vi.mock('@workspace/db', () => ({ pool: { query: async () => ({ rows: [] }) } }))
const ghl = vi.hoisted(() => ({
  book: vi.fn(), note: vi.fn(), field: vi.fn(), name: vi.fn(),
}))
vi.mock('@/lib/ghl', () => ({
  ghlConfigured: () => true,
  bookGhlAppointment: ghl.book,
  addGhlContactNote: ghl.note,
  setGhlContactCustomField: ghl.field,
  getGhlContactName: ghl.name,
  getGhlFreeSlots: vi.fn(),
}))
import { bookStrategyCall } from '../booking'
import { createBookingConfirmation, readBookingConfirmation } from '../../lib/booking-confirmation'
import { bookingThankYouHref, validatedBookingFunnel } from '@workspace/shared/booking-funnel'

const slot = '2026-11-12T01:30:00Z'
const params = { contactId: 'mock-contact', slot, timezone: 'America/Los_Angeles', productInterest: 'both' }

describe('website-only booking confirmation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-09T12:00:00Z'))
    vi.stubEnv('SESSION_SECRET', 'booking-test-secret')
    vi.clearAllMocks()
    ghl.book.mockResolvedValue('mock-appointment')
    ghl.note.mockResolvedValue(undefined)
    ghl.field.mockResolvedValue(undefined)
    ghl.name.mockResolvedValue('Mock Person')
  })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

  it('issues reloadable, timezone-aware confirmation only after appointment success', async () => {
    const result = await bookStrategyCall({ ...params, funnelSource: 'main-website' })
    expect(result.ok).toBe(true)
    const context = readBookingConfirmation(result.confirmationToken)
    expect(context).toEqual({
      confirmed: true, bookedFor: 'Wednesday, November 11, 2026 at 5:30 PM',
      timezoneLabel: 'Pacific Time (PT)',
    })
    expect(readBookingConfirmation(result.confirmationToken)).toEqual(context)
    const url = bookingThankYouHref('main-website', 'cid=mock-contact&name=Mock')
    expect(url).toBe('/schedule-a-call/confirmation')
    expect(url).not.toContain('cid=')
    expect(url).not.toContain('name=')
    const payload = JSON.parse(Buffer.from(result.confirmationToken!.split('.')[0], 'base64url').toString())
    expect(Object.keys(payload).sort()).toEqual(['expires', 'slot', 'source', 'timezone'])
  })

  it.each([undefined, 'strategy-call', 'https://evil.example'])('keeps legacy destination for %s', async funnelSource => {
    const result = await bookStrategyCall({ ...params, funnelSource })
    expect(result).toEqual({ ok: true, appointmentId: 'mock-appointment' })
    const url = bookingThankYouHref(funnelSource, 'name=Mock&interest=both')
    expect(url).toBe('/healthcare/thank-you?name=Mock&interest=both')
  })

  it('does not issue a confirmation for a failed booking', async () => {
    ghl.book.mockRejectedValue(new Error('Slot taken'))
    const result = await bookStrategyCall({ ...params, funnelSource: 'main-website' })
    expect(result.ok).toBe(false)
    expect(result.confirmationToken).toBeUndefined()
  })

  it('keeps booked success if a CRM annotation fails', async () => {
    ghl.note.mockRejectedValue(new Error('Note unavailable'))
    ghl.field.mockRejectedValue(new Error('Field unavailable'))
    const result = await bookStrategyCall({ ...params, funnelSource: 'main-website' })
    expect(readBookingConfirmation(result.confirmationToken).confirmed).toBe(true)
  })

  it('rejects missing, fabricated, altered and expired context', () => {
    const token = createBookingConfirmation(slot, params.timezone)
    for (const invalid of [undefined, '', 'confirmed', token + 'x', token.split('.')[0] + '.invalid']) {
      expect(readBookingConfirmation(invalid)).toEqual({ confirmed: false, bookedFor: null, timezoneLabel: null })
    }
    vi.setSystemTime(new Date('2026-11-14T00:00:00Z'))
    expect(readBookingConfirmation(token).confirmed).toBe(false)
  })

  it.each(['Not/AZone', ''])('does not fabricate timezone from invalid context %s', timezone => {
    expect(readBookingConfirmation(createBookingConfirmation(slot, timezone)).confirmed).toBe(false)
  })

  it('only allows an explicit marker', () => {
    expect(validatedBookingFunnel('schedule-a-call')).toBeUndefined()
  })
})
