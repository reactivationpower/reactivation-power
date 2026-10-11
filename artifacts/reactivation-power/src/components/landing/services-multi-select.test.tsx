import { expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { ServicesMultiSelect } from './services-multi-select'

function section(title: string) {
  return screen.getByText(title).parentElement as HTMLElement
}

function submittedServices(container: HTMLElement) {
  return [
    ...container.querySelectorAll<HTMLInputElement>('input[name="services"]'),
  ].map((input) => input.value)
}

it('shows weight loss boxes in the chiro and med spa sections', () => {
  render(<ServicesMultiSelect />)
  const chiro = within(section('Chiropractic, Acupuncture & Wellness'))
  expect(chiro.getByRole('checkbox', { name: 'ChiroThin' })).toBeTruthy()
  expect(
    chiro.getByRole('checkbox', { name: 'Other In-Office Weight Loss Programs' }),
  ).toBeTruthy()
  const medspa = within(section('Med Spa & Aesthetics'))
  expect(medspa.getByRole('checkbox', { name: 'GLP-1 Patients' })).toBeTruthy()
  expect(
    medspa.getByRole('checkbox', { name: 'Non-GLP-1 Weight Loss' }),
  ).toBeTruthy()
})

it('links a chiro ChiroThin box to the Weight Loss one and submits it once', () => {
  const onChange = vi.fn()
  const { container } = render(
    <ServicesMultiSelect onSelectionChange={onChange} />,
  )
  const chiroBox = within(
    section('Chiropractic, Acupuncture & Wellness'),
  ).getByRole('checkbox', { name: 'ChiroThin' })
  const weightBox = within(section('Weight Loss')).getByRole('checkbox', {
    name: 'ChiroThin',
  })

  fireEvent.click(chiroBox)
  expect(chiroBox.getAttribute('aria-checked')).toBe('true')
  expect(weightBox.getAttribute('aria-checked')).toBe('true')
  expect(submittedServices(container)).toEqual(['ChiroThin'])
  expect(screen.getByText('1 selected')).toBeTruthy()
  expect(onChange).toHaveBeenLastCalledWith(['ChiroThin'])

  fireEvent.click(weightBox)
  expect(chiroBox.getAttribute('aria-checked')).toBe('false')
  expect(submittedServices(container)).toEqual([])
})

it('counts the shared non-ChiroThin weight loss service once across three boxes', () => {
  const { container } = render(<ServicesMultiSelect />)
  fireEvent.click(
    within(section('Med Spa & Aesthetics')).getByRole('checkbox', {
      name: 'Non-GLP-1 Weight Loss',
    }),
  )
  expect(
    within(section('Chiropractic, Acupuncture & Wellness'))
      .getByRole('checkbox', { name: 'Other In-Office Weight Loss Programs' })
      .getAttribute('aria-checked'),
  ).toBe('true')
  expect(
    within(section('Weight Loss'))
      .getByRole('checkbox', { name: 'In-Office Weight Loss Programs' })
      .getAttribute('aria-checked'),
  ).toBe('true')
  expect(submittedServices(container)).toEqual(['Weight Loss (Not ChiroThin)'])
  expect(screen.getByText('1 selected')).toBeTruthy()
})

it('drops duplicate default selections', () => {
  const { container } = render(
    <ServicesMultiSelect defaultSelected={['GLP Patients', 'GLP Patients']} />,
  )
  expect(submittedServices(container)).toEqual(['GLP Patients'])
})
