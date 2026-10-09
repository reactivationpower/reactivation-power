import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readLeadFields, validateLeadFields } from '@workspace/shared/lead-validation'

const { insert, upsert, note, redirect } = vi.hoisted(() => ({
  insert: vi.fn(),
  upsert: vi.fn(),
  note: vi.fn(),
  redirect: vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`) }),
}))

vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('next/navigation', () => ({ redirect }))
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => ({ from: () => ({ insert, update: () => ({ eq: async () => ({ error: null }) }) }) }) }))
vi.mock('@/lib/sales-leads/store', () => ({
  intake: vi.fn(async () => ({ id: 'sales-fixture' })),
  transaction: vi.fn(async (fn: any) => fn({ query: vi.fn(async () => ({ rows: [] })) })),
}))
vi.mock('@/lib/sales-leads/provider', () => ({ safeSalesUpsert: upsert }))
vi.mock('@/lib/affiliates/attribution', () => ({
  referralFromRequest: vi.fn(async () => null),
  resolveQualifiedReferral: vi.fn(async () => ({ leadId: 'qualified-fixture', affiliateId: null })),
}))
vi.mock('@/lib/ghl', () => ({
  ghlConfigured: () => true,
  upsertGhlContact: upsert,
  addGhlContactNote: note,
}))
import { submitHealthcareLead } from '../leads'
import { intake } from '@/lib/sales-leads/store'
vi.mock('@/lib/marketing/outcomes', () => ({
  requestVisitorId: async () => null, leadOutcome: async () => undefined,
}))
const carried = () => vi.mocked(intake).mock.calls[0][0].context.bookingHandoff as { carried: Record<string, string> }

function form(interest?: string, inactive = ''): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries({
    firstName: 'Alex', lastName: 'Smith', email: 'alex@example.com',
    phone: '2125550100', zip: '10001', yearsInPractice: '4-7 years',
    inactivePatients: inactive, consent: 'on', leadSource: 'schedule-a-call',
  })) data.set(key, value)
  data.append('services', 'Chiropractic')
  if (interest !== undefined) data.set('productInterest', interest)
  return data
}

describe('schedule lead validation and submission', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    insert.mockReturnValue({ select: () => ({ single: async () => ({ data: { id: 'lead-fixture' }, error: null }) }) })
    upsert.mockResolvedValue('crm-1')
    note.mockResolvedValue(undefined)
  })

  it.each([
    ['reactivation', '1200', 'Reactivation'],
    ['lead-follow-up', '', 'Lead Follow-Up'],
    ['both', '1200', 'Both'],
  ])('persists and annotates %s interest', async (interest, inactive, label) => {
    const data = form(interest, inactive)
    expect(validateLeadFields(readLeadFields(data))).toEqual({})
    await expect(submitHealthcareLead({}, data)).rejects.toThrow('REDIRECT:')
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      source_path: `/schedule-a-call?interest=${interest}`,
      inactive_patients_estimate: inactive,
    }))
    expect(vi.mocked(intake).mock.calls[0][0].noteBody).toContain(`Interested in: ${label}`)
    expect(note).not.toHaveBeenCalled()
    expect(redirect).toHaveBeenCalledWith(expect.stringMatching(/^\/healthcare\/book-a-call\?bookingRef=[A-Za-z0-9_-]{32}$/))
    expect(carried().carried.interest).toBe(interest)
    if (interest === 'lead-follow-up') {
      expect(redirect.mock.calls[0][0]).not.toContain('inactive=')
      expect(note.mock.calls.some(([, text]) => text.includes('Revenue estimate shown to lead:'))).toBe(false)
    }
  })

  it('requires count for reactivation or both but not lead-only; rejects unknown interests', async () => {
    for (const interest of ['reactivation', 'both']) {
      const data = form(interest)
      expect(validateLeadFields(readLeadFields(data)).inactivePatients).toBeTruthy()
      expect((await submitHealthcareLead({}, data)).fieldErrors?.inactivePatients).toBeTruthy()
    }
    expect(validateLeadFields(readLeadFields(form('lead-follow-up'))).inactivePatients).toBeUndefined()
    expect((await submitHealthcareLead({}, form('unknown', '50'))).fieldErrors?.productInterest).toBeTruthy()
    expect((await submitHealthcareLead({}, form(undefined, '50'))).fieldErrors?.productInterest).toBeTruthy()
    expect(insert).not.toHaveBeenCalled()
  })

  it.each(['NaN', 'Infinity', '1e3', '-1', '0', '1000000', '999999999999999999999'])(
    'rejects invalid supplied count %s even for lead-only', async (count) => {
      const data = form('lead-follow-up', count)
      expect(validateLeadFields(readLeadFields(data)).inactivePatients).toBeTruthy()
      expect((await submitHealthcareLead({}, data)).fieldErrors?.inactivePatients).toBeTruthy()
      expect(insert).not.toHaveBeenCalled()
    },
  )

  it('keeps old healthcare callers without interest valid as reactivation', async () => {
    const data = form(undefined, '50')
    data.delete('leadSource')
    await expect(submitHealthcareLead({}, data)).rejects.toThrow('REDIRECT:')
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      source_path: '/healthcare', inactive_patients_estimate: '50',
    }))
  })

  it('carries the explicit website marker through persistence and calendar navigation', async () => {
    const data = form('both', '50')
    data.set('funnelSource', 'main-website')
    await expect(submitHealthcareLead({}, data)).rejects.toThrow('REDIRECT:')
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      source_path: '/schedule-a-call?interest=both&funnelSource=main-website',
    }))
    expect(carried().carried.funnelSource).toBe('main-website')
    expect(redirect.mock.calls[0][0]).not.toContain('funnelSource=')
  })

  it.each(['strategy-call', 'https://evil.example', '/schedule-a-call/confirmation'])(
    'does not accept an arbitrary funnel marker %s', async (marker) => {
      const data = form('both', '50')
      data.set('funnelSource', marker)
      await expect(submitHealthcareLead({}, data)).rejects.toThrow('REDIRECT:')
      expect(redirect.mock.calls[0][0]).not.toContain('funnelSource')
      expect(carried().carried.funnelSource).toBeUndefined()
    },
  )

  it('does not opt a calculator/contact form in from the marker alone', async () => {
    const data = form('both', '50')
    data.delete('leadSource')
    data.set('funnelSource', 'main-website')
    await expect(submitHealthcareLead({}, data)).rejects.toThrow('REDIRECT:')
    expect(redirect.mock.calls[0][0]).not.toContain('funnelSource')
    expect(carried().carried.funnelSource).toBeUndefined()
  })

  it('saves both components of the combined estimate and carries inputs to booking', async () => {
    const data = form('both', '1,200')
    data.delete('leadSource')
    data.set('calculatorScenario', 'combined')
    data.set('patientValue', '10000')
    data.set('additionalPatientsPerMonth', '4')
    data.set('newPatientValue', '3000')
    data.set('combinedEstimate', '999999999') // never trust client-provided totals
    expect(validateLeadFields(readLeadFields(data))).toEqual({})
    await expect(submitHealthcareLead({}, data)).rejects.toThrow('REDIRECT:')
    const row = insert.mock.calls[0][0]
    const source = new URL(row.source_path, 'https://example.com')
    expect(source.pathname).toBe('/healthcare')
    expect(Object.fromEntries(source.searchParams)).toEqual({
      interest: 'both', inactive: '1200', value: '10000', newMonthly: '4', newValue: '3000',
      reactivationEstimate: '600000', newPatientEstimate: '144000', combinedEstimate: '744000',
    })
    expect(row.inactive_patients_estimate).toBe('1200')
    const text = vi.mocked(intake).mock.calls[0][0].noteBody!
    expect(text).toContain('Reactivation estimate shown to lead: $600,000')
    expect(text).toContain('New patient first-year cohort value estimate: $144,000')
    expect(text).toContain('Combined illustrative opportunity: $744,000')
    expect(carried().carried).toMatchObject({ newMonthly: '4', newValue: '3000' })
    expect(redirect.mock.calls[0][0]).not.toContain('newMonthly=')
  })

  it.each([
    ['patientValue', '10001'], ['patientValue', 'NaN'], ['patientValue', 'Infinity'],
    ['patientValue', '-1000'], ['additionalPatientsPerMonth', '0'],
    ['additionalPatientsPerMonth', '41'], ['additionalPatientsPerMonth', '1e2'],
    ['newPatientValue', '999'], ['newPatientValue', '10001'],
    ['newPatientValue', 'Infinity'], ['inactivePatients', '1000000'],
  ])('rejects invalid combined %s=%s before any writes', async (key, value) => {
    const data = form('both', '1200')
    data.set('calculatorScenario', 'combined')
    data.set('patientValue', '10000')
    data.set('additionalPatientsPerMonth', '4')
    data.set('newPatientValue', '3000')
    data.set(key, value)
    expect((await submitHealthcareLead({}, data)).fieldErrors?.[key]).toBeTruthy()
    expect(insert).not.toHaveBeenCalled()
    expect(upsert).not.toHaveBeenCalled()
  })

  it('does not let a lead-only submission carry a combined reactivation estimate', async () => {
    const data = form('lead-follow-up', '1200')
    data.set('calculatorScenario', 'combined')
    data.set('patientValue', '2000')
    data.set('additionalPatientsPerMonth', '4')
    data.set('newPatientValue', '3000')
    expect((await submitHealthcareLead({}, data)).fieldErrors?.productInterest).toBeTruthy()
    expect(insert).not.toHaveBeenCalled()
  })

  it('accepts the scenario lower bounds and requires all scenario fields', async () => {
    const data = form('both', '1')
    data.set('calculatorScenario', 'combined')
    data.set('patientValue', '1000')
    data.set('additionalPatientsPerMonth', '1')
    data.set('newPatientValue', '1000')
    await expect(submitHealthcareLead({}, data)).rejects.toThrow('REDIRECT:')
    expect(insert.mock.calls[0][0].source_path).toContain('combinedEstimate=13000')

    vi.clearAllMocks()
    data.delete('newPatientValue')
    expect((await submitHealthcareLead({}, data)).fieldErrors?.newPatientValue).toBeTruthy()
    expect(insert).not.toHaveBeenCalled()
  })
})