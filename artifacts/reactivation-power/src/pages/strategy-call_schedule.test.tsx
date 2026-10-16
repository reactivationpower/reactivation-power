import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import StrategyCallSchedulePage from './strategy-call_schedule'
import { LeadForm } from '@/components/landing/lead-form'

const { submit, lookup } = vi.hoisted(() => ({
  submit: vi.fn(async () => ({})),
  lookup: vi.fn(async () => null),
}))
vi.mock('@/app/actions/leads', () => ({
  submitHealthcareLead: submit,
  lookupZip: lookup,
}))
vi.mock('@/components/marketing/use-page-meta', () => ({ usePageMeta: vi.fn() }))
vi.mock('@/app/actions/lead-terms', () => ({ getCurrentTerms: vi.fn(async () => ({ active: false, version: null })) }))

const fields = [
  ['What can we help with?', 'productInterest', true],
  ['First name', 'firstName', true],
  ['Last name', 'lastName', true],
  ['Email address', 'email', true],
  ['Phone number', 'phone', true],
  ['Zip code', 'zip', true],
  ['Practice name', 'practiceName', false],
  ['How long in practice?', 'yearsInPractice', true],
  ['Inactive patient files', 'inactivePatients', true],
  ['Best time to connect with you', 'bestTime', false],
] as const

function checkLabels(container: HTMLElement) {
  for (const [text, name, required] of fields) {
    const control = screen.getByLabelText(new RegExp(text.replace('?', '\\?'))) as HTMLInputElement | HTMLSelectElement
    expect(control.name).toBe(name)
    expect(control.required).toBe(required)
    expect(control.labels).toHaveLength(1)
    const label = control.labels![0]
    expect(label.htmlFor).toBe(control.id)
    expect(label.classList.contains('text-foreground')).toBe(true)
    expect(label.classList.contains('sr-only')).toBe(false)
    expect(label.parentElement?.firstElementChild).toBe(label)
    expect(label.textContent?.includes('*')).toBe(required)
  }
  expect(screen.getByRole('group', { name: /What services do you offer/ }).tagName).toBe('FIELDSET')
  expect(screen.getByRole('checkbox', { name: /I consent to being contacted/ })).toHaveProperty('required', true)
  expect(container.querySelectorAll('label[for]')).toHaveLength(fields.length)
}

describe('strategy call schedule form labels', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    HTMLElement.prototype.scrollIntoView = vi.fn()
  })

  it('keeps the benefits on desktop but places the form closer to the heading on mobile', () => {
    const { container } = render(<StrategyCallSchedulePage />)
    const main = container.querySelector('main')!
    const benefits = screen.getByText('Find opportunities in your inactive patient list').closest('ul')!
    const formCard = container.querySelector('form')!.parentElement!
    expect(main.classList.contains('pt-6')).toBe(true)
    expect(main.classList.contains('md:pt-16')).toBe(true)
    expect(benefits.classList.contains('hidden')).toBe(true)
    expect(benefits.classList.contains('md:grid')).toBe(true)
    expect(formCard.classList.contains('mt-6')).toBe(true)
    expect(formCard.classList.contains('md:mt-10')).toBe(true)
  })

  it('renders one persistent, associated label per field on the actual schedule page, before and after entry', async () => {
    const user = userEvent.setup()
    const { container } = render(<StrategyCallSchedulePage />)
    checkLabels(container)
    for (const [name, placeholder] of Object.entries({
      firstName: 'First name',
      lastName: 'Last name',
      email: 'you@example.com',
      practiceName: 'Practice name',
      phone: '(555) 555-1234',
      zip: '12345',
      inactivePatients: 'e.g. 1,000',
    })) {
      expect(container.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.placeholder).toBe(placeholder)
    }
    const values: Record<string, string> = {
      firstName: 'Test', lastName: 'Practice', email: 'test@example.invalid',
      phone: '5555551234', zip: '12345', practiceName: 'Test Clinic',
      inactivePatients: '1000',
    }
    for (const [name, value] of Object.entries(values)) {
      await user.type(container.querySelector<HTMLInputElement>(`input[name="${name}"]`)!, value)
    }
    for (const [name, value] of Object.entries(values)) {
      const control = container.querySelector<HTMLInputElement>(`input[name="${name}"]`)!
      expect(control.value).toBe(name === 'inactivePatients' ? '1,000' : name === 'phone' ? '(555) 555-1234' : value)
      expect(control.labels?.length).toBe(1)
    }
    await user.selectOptions(screen.getByLabelText(/What can we help with/), 'both')
    await user.selectOptions(screen.getByLabelText(/How long in practice/), '4-7 years')
    await user.click(screen.getByRole('checkbox', { name: 'Chiropractic' }))
    await user.click(screen.getByRole('checkbox', { name: /I consent/ }))
    checkLabels(container)
    const data = new FormData(container.querySelector('form')!)
    expect(data.get('phone')).toBe('(555) 555-1234')
    expect(data.get('inactivePatients')).toBe('1,000')
    expect(data.get('firstName')).toBe('Test')
    expect(data.get('productInterest')).toBe('both')
    expect(data.get('yearsInPractice')).toBe('4-7 years')
    expect(data.getAll('services')).toEqual(['Chiropractic'])
    expect(data.get('leadSource')).toBe('schedule-a-call')
    expect(submit).not.toHaveBeenCalled()
  // Several formatted fields are typed character-by-character. Preserve all
  // interaction/assertion coverage while allowing for parallel suite contention.
  }, 15_000)

  it('preserves optional inactive files for Lead Follow-Up and keeps validation local without losing entered values', async () => {
    const user = userEvent.setup()
    const { container } = render(<StrategyCallSchedulePage />)
    await user.selectOptions(screen.getByLabelText(/What can we help with/), 'lead-follow-up')
    const inactive = screen.getByLabelText(/Inactive patient files/) as HTMLInputElement
    expect(inactive.required).toBe(false)
    expect(inactive.labels![0].textContent).not.toContain('*')
    expect(screen.getByText('Optional for lead follow-up.')).toBeTruthy()
    const firstName = screen.getByLabelText(/First name/) as HTMLInputElement
    await user.type(firstName, 'Test')
    fireEvent.submit(container.querySelector('form')!)
    expect(screen.getByText('Last name is required.')).toBeTruthy()
    expect(firstName.value).toBe('Test')
    expect(submit).not.toHaveBeenCalled()
  })

  it('does not add schedule-only fields or duplicate labels to other shared form uses', () => {
    const { container } = render(<LeadForm />)
    expect(screen.queryByLabelText(/What can we help with/)).toBeNull()
    expect(container.querySelectorAll('label[for]')).toHaveLength(9)
    for (const name of ['firstName', 'lastName', 'email', 'practiceName']) {
      expect(container.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.placeholder).toBe('')
    }
  })

  it('passes a valid schedule form to the existing action without contacting a real lead service', async () => {
    const user = userEvent.setup()
    const { container } = render(<StrategyCallSchedulePage />)
    for (const [name, value] of Object.entries({
      firstName: 'Test', lastName: 'Practice', email: 'test@example.invalid',
      phone: '5555551234', zip: '12345',
    })) {
      fireEvent.change(container.querySelector(`input[name="${name}"]`)!, { target: { value } })
    }
    await user.selectOptions(screen.getByLabelText(/What can we help with/), 'lead-follow-up')
    await user.selectOptions(screen.getByLabelText(/How long in practice/), '4-7 years')
    await user.click(screen.getByRole('checkbox', { name: 'Chiropractic' }))
    await user.click(screen.getByRole('checkbox', { name: /I consent/ }))
    await user.click(screen.getByRole('button', { name: 'Get My Free Strategy Call' }))
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
    const submitted = (submit.mock.calls[0] as unknown as [unknown, FormData])[1]
    expect(submitted.get('leadSource')).toBe('schedule-a-call')
    expect(submitted.get('productInterest')).toBe('lead-follow-up')
    expect(submitted.get('inactivePatients')).toBe('')
    expect(submitted.get('consent')).toBe('on')
    expect(submitted.getAll('services')).toEqual(['Chiropractic'])
  })
})

async function fillValidScheduleForm(container: HTMLElement, user: ReturnType<typeof userEvent.setup>) {
  for (const [name, value] of Object.entries({
    firstName: 'Test', lastName: 'Practice', email: 'test@example.invalid',
    phone: '5555551234', zip: '12345',
  })) {
    fireEvent.change(container.querySelector(`input[name="${name}"]`)!, { target: { value } })
  }
  await user.selectOptions(screen.getByLabelText(/What can we help with/), 'lead-follow-up')
  await user.selectOptions(screen.getByLabelText(/How long in practice/), '4-7 years')
  await user.click(screen.getByRole('checkbox', { name: 'Chiropractic' }))
  await user.click(screen.getByRole('checkbox', { name: /I consent/ }))
}

describe('best time to connect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    HTMLElement.prototype.scrollIntoView = vi.fn()
  })

  it('sits below the services list and above consent, with local-time choices', () => {
    const { container } = render(<StrategyCallSchedulePage />)
    const select = screen.getByLabelText(/Best time to connect with you/) as HTMLSelectElement
    expect([...select.options].map((o) => o.textContent)).toEqual(['Select one', '9–11 AM', '11 AM–1 PM', '1–3 PM', '3–5 PM', 'Anytime'])
    expect(select.value).toBe('')
    expect(select.required).toBe(false)
    const services = screen.getByRole('group', { name: /What services do you offer/ })
    const consent = screen.getByRole('checkbox', { name: /I consent/ })
    expect(services.compareDocumentPosition(select) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(select.compareDocumentPosition(consent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(container.querySelector('select[name="bestTime"]')).toBe(select)
  })

  it('submits the chosen time and keeps it when the server returns errors', async () => {
    const user = userEvent.setup()
    submit.mockImplementationOnce((async (_prev: unknown, data: FormData) => ({
      fieldErrors: { email: 'Enter a valid email address.' },
      values: Object.fromEntries([...data].filter(([, v]) => typeof v === 'string')) as Record<string, string>,
    })) as never)
    const { container } = render(<StrategyCallSchedulePage />)
    await fillValidScheduleForm(container, user)
    await user.selectOptions(screen.getByLabelText(/Best time to connect/), '1–3 PM')
    await user.click(screen.getByRole('button', { name: 'Get My Free Strategy Call' }))
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
    const submitted = (submit.mock.calls[0] as unknown as [unknown, FormData])[1]
    expect(submitted.get('bestTime')).toBe('1–3 PM')
    await screen.findByText('Enter a valid email address.')
    expect((screen.getByLabelText(/Best time to connect/) as HTMLSelectElement).value).toBe('1–3 PM')
  })
})

describe('coming back with the browser Back button after submitting', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    HTMLElement.prototype.scrollIntoView = vi.fn()
    // Run the real client action and redirect handling; the server answers "go to booking".
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      status: 200,
      json: async () => (String(url).includes('/actions/')
        ? { ok: true, result: null, redirect: '/#booking' }
        : { ok: true, result: null }),
    })))
    const actual = await vi.importActual<typeof import('@/app/actions/leads')>('@/app/actions/leads')
    submit.mockImplementation(actual.submitHealthcareLead as never)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    window.location.hash = ''
  })

  it('re-enables the button, keeps entries, and sends a corrected resubmission with a new submission id', async () => {
    const user = userEvent.setup()
    const { container } = render(<StrategyCallSchedulePage />)
    await fillValidScheduleForm(container, user)
    await user.selectOptions(screen.getByLabelText(/Best time to connect/), 'Anytime')
    await user.click(screen.getByRole('button', { name: 'Get My Free Strategy Call' }))
    await screen.findByRole('button', { name: 'Submitting…' })
    await waitFor(() => expect(window.location.hash).toBe('#booking'))
    const firstId = (submit.mock.calls[0] as unknown as [unknown, FormData])[1].get('marketingSubmissionId')
    expect(firstId).toBeTruthy()

    const restore = new Event('pageshow')
    Object.defineProperty(restore, 'persisted', { value: true })
    act(() => { window.dispatchEvent(restore) })

    const button = await screen.findByRole('button', { name: 'Get My Free Strategy Call' })
    expect((button as HTMLButtonElement).disabled).toBe(false)
    const form = container.querySelector('form')!
    const id = form.querySelector<HTMLInputElement>('input[name="marketingSubmissionId"]')!.value
    expect(id).toBeTruthy()
    expect(id).not.toBe(firstId)
    expect(container.querySelector<HTMLInputElement>('input[name="firstName"]')!.value).toBe('Test')
    expect(container.querySelector<HTMLInputElement>('input[name="phone"]')!.value).toBe('(555) 555-1234')
    expect((screen.getByLabelText(/Best time to connect/) as HTMLSelectElement).value).toBe('Anytime')
    expect((screen.getByLabelText(/What can we help with/) as HTMLSelectElement).value).toBe('lead-follow-up')
    expect((screen.getByLabelText(/How long in practice/) as HTMLSelectElement).value).toBe('4-7 years')
    expect((screen.getByRole('checkbox', { name: /I consent/ }) as HTMLInputElement).checked).toBe(true)

    fireEvent.change(container.querySelector('input[name="lastName"]')!, { target: { value: 'Corrected' } })
    await user.click(button)
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2))
    const second = (submit.mock.calls[1] as unknown as [unknown, FormData])[1]
    expect(second.get('marketingSubmissionId')).toBe(id)
    expect(second.get('lastName')).toBe('Corrected')
    await screen.findByRole('button', { name: 'Submitting…' })
  }, 15_000)
})
