import { beforeEach, expect, it, vi } from 'vitest'
import { LEAD_TERMS_WORDING, type CurrentLeadTerms } from '@workspace/shared/lead-terms'
const m = vi.hoisted(() => ({
  current: vi.fn(), insert: vi.fn(), remove: vi.fn(async () => ({})), intake: vi.fn(), redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`) }),
}))
vi.mock('@/lib/lead-terms/store', async original => ({ ...await original<any>(), currentTerms: m.current,
  termsRequestEvidence: () => ({ ip: '192.0.2.25', userAgent: 'Trusted request browser' }) }))
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => ({ from: () => ({
  insert: m.insert, delete: () => ({ eq: m.remove }),
}) }) }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('next/navigation', () => ({ redirect: m.redirect }))
vi.mock('@/lib/sales-leads/store', () => ({ intake: m.intake, transaction: vi.fn() }))
vi.mock('@/lib/affiliates/attribution', () => ({ referralFromRequest: async () => null, resolveQualifiedReferral: async () => ({ affiliateId: null }) }))
vi.mock('@/lib/marketing/outcomes', () => ({ requestVisitorId: async () => null, leadOutcome: async () => undefined }))
vi.mock('@/lib/sales-leads/dispatch', () => ({ nudgeSalesSync: vi.fn() }))
import { submitHealthcareLead } from '../leads'
import { TermsAcceptanceError } from '@/lib/lead-terms/store'

const active: CurrentLeadTerms = { active: true, version: { id: 'terms-fixture', label: 'Isolated fixture', content: 'Fixture document',
  content_hash: 'a'.repeat(64), checkbox_wording: LEAD_TERMS_WORDING, published_at: '2026-10-13T00:00:00.000Z' } }
function form() {
  const fd = new FormData()
  for (const [key, value] of Object.entries({
    firstName: 'Submitted', lastName: 'Person', email: 'submitted@example.invalid', phone: '2125550100', zip: '10001',
    yearsInPractice: '4-7 years', inactivePatients: '1000', practiceName: 'Office', consent: 'on',
    termsVersion: 'terms-fixture', termsAccepted: 'on', marketingSubmissionId: 'c1a35fd7-cc0e-4d20-bd53-b9080522f50e',
    actualSourcePath: '/strategy-call/schedule', userAgent: 'spoofed', termsIp: 'spoofed',
  })) fd.set(key, value)
  fd.append('services', 'Chiropractic')
  return fd
}
beforeEach(() => {
  vi.clearAllMocks()
  m.current.mockResolvedValue(active)
  m.intake.mockResolvedValue({ id: 'saved-lead', bookingRef: 'persisted-reference' })
  m.insert.mockReturnValue({ select: () => ({ single: async () => ({ data: { id: 'invocation-legacy-row' } }) }) })
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })))
})
it('does not write the earlier legacy lead when acceptance is missing or its version is invalid', async () => {
  for (const edit of [(f: FormData) => f.delete('termsAccepted'), (f: FormData) => f.set('termsVersion', 'tampered')]) {
    const fd = form(); edit(fd)
    const result = await submitHealthcareLead({}, fd)
    expect(result.fieldErrors?.termsAccepted).toBeTruthy()
    expect(result.terms).toEqual(active)
    expect(result.values?.firstName).toBe('Submitted')
    expect(result.values?.consent).toBe('on')
    expect(result.services).toEqual(['Chiropractic'])
  }
  expect(m.insert).not.toHaveBeenCalled()
  expect(m.intake).not.toHaveBeenCalled()
  expect(m.redirect).not.toHaveBeenCalled()
})
it('fails closed if terms retrieval fails, rather than pretending the feature is inactive', async () => {
  m.current.mockRejectedValue(new Error('database unavailable'))
  const result = await submitHealthcareLead({}, form())
  expect(result.error).toContain('could not be loaded')
  expect(result.values?.firstName).toBe('Submitted')
  expect(m.insert).not.toHaveBeenCalled()
  expect(m.redirect).not.toHaveBeenCalled()
})
it('does not couple terms acceptance to SMS permission', async () => {
  const fd = form(); fd.delete('consent')
  const result = await submitHealthcareLead({}, fd)
  expect(result.fieldErrors?.consent).toBeTruthy()
  expect(m.intake).not.toHaveBeenCalled()
})
it('retains entries and resets the current terms after publication wins between legacy write and intake', async () => {
  const next: CurrentLeadTerms = { active: true, version: { ...active.version!, id: 'updated-fixture' } }
  m.intake.mockRejectedValue(new TermsAcceptanceError(next, 'The Terms of Service changed. Please review the current terms and check again.'))
  const result = await submitHealthcareLead({}, form())
  expect(result.terms).toEqual(next)
  expect(result.fieldErrors?.termsAccepted).toContain('changed')
  expect(result.values?.phone).toBe('2125550100')
  expect(result.services).toEqual(['Chiropractic'])
  expect(m.remove).toHaveBeenCalledWith('id', 'invocation-legacy-row')
  expect(m.redirect).not.toHaveBeenCalled()
})
it('returns no handoff when evidence/intake rolls back; cleans only the invocation legacy row', async () => {
  m.intake.mockRejectedValue(new Error('evidence failure'))
  const result = await submitHealthcareLead({}, form())
  expect(result.error).toContain('could not save')
  expect(m.remove).toHaveBeenCalledWith('id', 'invocation-legacy-row')
  expect(m.redirect).not.toHaveBeenCalled()
})
it('passes independent canonical terms evidence, trusted request metadata and a stable retry key to intake', async () => {
  await expect(submitHealthcareLead({}, form())).rejects.toThrow('REDIRECT:/healthcare/book-a-call?bookingRef=persisted-reference')
  const saved = m.intake.mock.calls[0][0]
  expect(saved.marketingTerms).toEqual({ version: 'terms-fixture', checked: true, ip: '192.0.2.25', userAgent: 'Trusted request browser',
    identity: { firstName: 'Submitted', lastName: 'Person', email: 'submitted@example.invalid', phone: '2125550100', practiceName: 'Office' } })
  expect(saved.dedupeKey).toBe('marketing:c1a35fd7-cc0e-4d20-bd53-b9080522f50e:terms-fixture')
  expect(saved.consentEvidence.disclosureVersion).toBe('patient-pipeline-sms-v1')
  expect(saved.consentEvidence.disclosure).not.toBe(LEAD_TERMS_WORDING)
})
it('keeps inactive forms working without inventing acceptance', async () => {
  m.current.mockResolvedValue({ active: false, version: null })
  const fd = form(); fd.delete('termsAccepted'); fd.delete('termsVersion')
  await expect(submitHealthcareLead({}, fd)).rejects.toThrow('REDIRECT:')
  expect(m.intake.mock.calls[0][0].marketingTerms.checked).toBe(false)
})
