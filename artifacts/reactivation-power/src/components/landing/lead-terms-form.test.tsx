import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { LeadForm } from './lead-form'
import { LEAD_TERMS_WORDING, type CurrentLeadTerms } from '@workspace/shared/lead-terms'
const m = vi.hoisted(() => ({ current: vi.fn(), submit: vi.fn(async (_previous: any, _data: FormData): Promise<any> => ({})), lookup: vi.fn(async () => null) }))
vi.mock('@/app/actions/lead-terms', () => ({ getCurrentTerms: m.current }))
vi.mock('@/app/actions/leads', () => ({ submitHealthcareLead: m.submit, lookupZip: m.lookup }))
vi.mock('@/lib/marketing-tracker', () => ({ track: vi.fn(), flush: vi.fn(async () => {}) }))
const active: CurrentLeadTerms = { active: true, version: { id: 'version-one', label: 'Isolated fixture', content: 'Fixture document',
  content_hash: 'a'.repeat(64), checkbox_wording: LEAD_TERMS_WORDING, published_at: '2026-10-13T00:00:00Z' } }
beforeEach(() => {
  vi.clearAllMocks()
  HTMLElement.prototype.scrollIntoView = vi.fn()
  m.current.mockResolvedValue(active)
  m.submit.mockResolvedValue({})
})
const consent = () => screen.getByRole('checkbox', { name: /I consent to being contacted/ })
const termsBox = () => screen.getByRole('checkbox', { name: /I agree to the Terms of Service/ }) as HTMLInputElement
function fill(container: HTMLElement, schedule = false) {
  for (const [name, value] of Object.entries({ firstName: 'Submitted', lastName: 'Person', email: 'submitted@example.invalid', phone: '2125550100', zip: '10001', practiceName: 'Office', inactivePatients: '1000' })) {
    fireEvent.change(container.querySelector(`[name="${name}"]`)!, { target: { value } })
  }
  fireEvent.change(screen.getByLabelText(/How long in practice/), { target: { value: '4-7 years' } })
  if (schedule) fireEvent.change(screen.getByLabelText(/What can we help with/), { target: { value: 'both' } })
  fireEvent.click(screen.getByRole('checkbox', { name: 'Chiropractic' }))
  fireEvent.click(consent())
}
it.each([
  ['inline', {}], ['popup shared form', {}], ['schedule', { scheduleMode: true }],
  ['calculator', { calculatorScenario: { inactivePatients: 1000, patientValue: 2000, additionalPatientsPerMonth: 10, newPatientValue: 2000 } }],
])('requires an unchecked terms control separate from SMS in %s', async (_name, props) => {
  const { container } = render(<LeadForm {...props} />)
  await waitFor(() => expect(termsBox().checked).toBe(false))
  expect(termsBox().required).toBe(true)
  expect(screen.getByRole('link', { name: 'View terms' }).getAttribute('href')).toBe('/terms/version-one')
  fill(container, 'scheduleMode' in props)
  fireEvent.submit(container.querySelector('form')!)
  expect(m.submit).not.toHaveBeenCalled()
  expect((consent() as HTMLInputElement).checked).toBe(true)
  fireEvent.click(termsBox())
  fireEvent.submit(container.querySelector('form')!)
  await waitFor(() => expect(m.submit).toHaveBeenCalledTimes(1))
  const data = m.submit.mock.calls[0][1] as FormData
  expect(data.get('termsVersion')).toBe('version-one')
  expect(data.get('termsAccepted')).toBe('on')
  expect(data.get('consent')).toBe('on')
  expect(data.get('marketingSubmissionId')).toMatch(/^[a-f0-9-]{36}$/)
})
it('permits inactive forms without a terms checkbox', async () => {
  m.current.mockResolvedValue({ active: false, version: null })
  const { container } = render(<LeadForm />)
  await waitFor(() => expect(container.querySelector('[name="termsVersion"]')).toHaveProperty('value', ''))
  fill(container)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Get My Free Strategy Call' })).toHaveProperty('disabled', false))
  fireEvent.submit(container.querySelector('form')!)
  await waitFor(() => expect(m.submit).toHaveBeenCalledTimes(1))
  expect(screen.queryByRole('checkbox', { name: /I agree to/ })).toBeNull()
})
it('blocks loading and retrieval errors, then recovers with retry', async () => {
  m.current.mockRejectedValue(new Error('Unavailable'))
  const { container } = render(<LeadForm />)
  fill(container)
  fireEvent.submit(container.querySelector('form')!)
  expect(m.submit).not.toHaveBeenCalled()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy())
  fireEvent.submit(container.querySelector('form')!)
  expect(m.submit).not.toHaveBeenCalled()
  m.current.mockResolvedValue(active)
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await waitFor(() => expect(termsBox()).toBeTruthy())
  expect((screen.getByLabelText(/First name/) as HTMLInputElement).value).toBe('Submitted')
})
it('unchecks on a refreshed version and preserves all nonlegal entries and SMS permission', async () => {
  const { container } = render(<LeadForm scheduleMode />)
  await waitFor(() => expect(termsBox()).toBeTruthy())
  fill(container, true)
  fireEvent.click(termsBox())
  const key = (container.querySelector('[name="marketingSubmissionId"]') as HTMLInputElement).value
  m.current.mockResolvedValue({ active: true, version: { ...active.version!, id: 'version-two' } })
  await act(async () => { fireEvent(window, new Event('focus')) })
  await waitFor(() => expect(termsBox().checked).toBe(false))
  expect((screen.getByLabelText(/First name/) as HTMLInputElement).value).toBe('Submitted')
  expect((screen.getByLabelText(/What can we help with/) as HTMLSelectElement).value).toBe('both')
  expect((consent() as HTMLInputElement).checked).toBe(true)
  expect(container.querySelector('[name="services"]')).toHaveProperty('value', 'Chiropractic')
  expect(container.querySelector('[name="marketingSubmissionId"]')).toHaveProperty('value', key)
})
it('adopts a server stale-version response and retains entered fields while requiring a new check', async () => {
  const next = { active: true, version: { ...active.version!, id: 'version-two' } }
  m.submit.mockImplementationOnce(async (_prev: any, fd: FormData) => ({
    terms: next, fieldErrors: { termsAccepted: 'Terms changed. Review again.' },
    values: Object.fromEntries(fd.entries()), services: fd.getAll('services'),
  }))
  const { container } = render(<LeadForm />)
  await waitFor(() => expect(termsBox()).toBeTruthy())
  fill(container); fireEvent.click(termsBox())
  fireEvent.submit(container.querySelector('form')!)
  await waitFor(() => expect(container.querySelector('[name="termsVersion"]')).toHaveProperty('value', 'version-two'))
  expect(termsBox().checked).toBe(false)
  expect((screen.getByLabelText(/First name/) as HTMLInputElement).value).toBe('Submitted')
  expect((screen.getByLabelText(/How long in practice/) as HTMLSelectElement).value).toBe('4-7 years')
  expect((consent() as HTMLInputElement).checked).toBe(true)
  expect(container.querySelector('[name="services"]')).toHaveProperty('value', 'Chiropractic')
})
