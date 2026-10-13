import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
    expect(container.querySelectorAll('label[for]')).toHaveLength(8)
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
