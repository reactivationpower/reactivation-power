import { beforeEach, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ intake: vi.fn(), sync: vi.fn(), query: vi.fn(), update: vi.fn() }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('@/lib/lead-terms/store', async original => ({ ...await original<any>(), currentTerms: async () => ({ active: false, version: null }) }))
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => ({
  from: () => ({ insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'saved-landing' } }) }) }), update: () => ({ eq: m.update }) }),
}) }))
vi.mock('@/lib/affiliates/attribution', () => ({ referralFromRequest: async () => null, resolveQualifiedReferral: async () => ({ affiliateId: null }) }))
vi.mock('@/lib/marketing/outcomes', () => ({ requestVisitorId: async () => 'opted-in-visitor', leadOutcome: async () => undefined }))
vi.mock('@/lib/sales-leads/store', () => ({ intake: m.intake, transaction: async (fn: any) => fn({ query: m.query }) }))
vi.mock('@/lib/sales-leads/provider', () => ({ safeSalesUpsert: m.sync }))
vi.mock('@/lib/ghl', () => ({ ghlConfigured: () => true, addGhlContactNote: async () => undefined }))
import { submitHealthcareLead } from '../leads'
import { handoffHash } from '@/lib/booking-handoff'
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
  m.intake.mockResolvedValue({ id: 'saved-sales' })
  m.query.mockResolvedValue({ rows: [{}] })
  m.sync.mockResolvedValue('provider-contact')
})
it.each([
  ['main-website', 'synced'], ['strategy-call', 'outage'], ['healthcare', 'review'],
])('preserves %s intake and redirects to the styled calendar after %s', async (source, state) => {
  if (state === 'outage') m.sync.mockRejectedValue(new Error('Provider unavailable'))
  if (state === 'review') m.intake.mockResolvedValue({ id: 'review', review: true })
  const form = new FormData()
  const fields = {
    firstName: 'Synthetic', lastName: 'Practice', email: 'test@example.invalid', phone: '5555551234',
    zip: '12345', yearsInPractice: '4-7 years', inactivePatients: '1000', services: 'Chiropractic',
    consent: 'on', productInterest: 'both', patientValue: '1500', newPatientValue: '2000',
    additionalPatientsPerMonth: '10', calculatorScenario: 'yes', actualSourcePath: '/healthcare',
    utmContext: JSON.stringify({ utm_campaign: 'synthetic' }), deviceTimezone: 'America/New_York',
    ...(source !== 'healthcare' ? { leadSource: 'schedule-a-call', funnelSource: source } : {}),
  }
  for (const [key, value] of Object.entries(fields)) form.set(key, value)
  let redirect: any
  try { await submitHealthcareLead({}, form) } catch (error) { redirect = error }
  expect(redirect.location).toMatch(/^\/healthcare\/book-a-call\?bookingRef=[A-Za-z0-9_-]{32}$/)
  const context = m.intake.mock.calls[0][0].context
  const ref = new URL(redirect.location, 'https://example.invalid').searchParams.get('bookingRef')!
  expect(context.bookingHandoff.hash).toBe(handoffHash(ref))
  expect(context.bookingHandoff.carried).toMatchObject({ interest: 'both', services: 'Chiropractic', inactive: '1000', newMonthly: '10', newValue: '2000' })
  expect(context.bookingHandoff.carried.funnelSource).toBe(source === 'main-website' ? 'main-website' : undefined)
  expect(context.utm).toEqual({ utm_campaign: 'synthetic' })
  expect(context.marketingVisitorId).toBe('opted-in-visitor')
  if (state === 'review') expect(m.sync).not.toHaveBeenCalled()
})
