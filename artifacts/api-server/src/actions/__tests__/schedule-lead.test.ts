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
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => ({ from: () => ({ insert }) }) }))
vi.mock('@/lib/ghl', () => ({
  ghlConfigured: () => true,
  upsertGhlContact: upsert,
  addGhlContactNote: note,
}))
import { submitHealthcareLead } from '../leads'

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
    insert.mockResolvedValue({ error: null })
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
    expect(note.mock.calls.some(([, text]) => text.includes(`Interested in: ${label}`))).toBe(true)
    expect(redirect).toHaveBeenCalledWith(expect.stringContaining(`interest=${interest}`))
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
})