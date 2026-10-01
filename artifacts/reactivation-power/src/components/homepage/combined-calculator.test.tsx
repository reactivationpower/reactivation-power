import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { OpportunityProvider } from '@/components/landing/opportunity-context'
import { CombinedCalculator, calculateCombinedRevenue } from './combined-calculator'
import type { CalculatorScenario } from '@workspace/shared/opportunity'

vi.mock('@/components/landing/lead-form', () => ({
  LeadForm: ({ calculatorScenario }: { calculatorScenario: CalculatorScenario }) =>
    <output data-testid="forwarded-calculator">{[
      calculatorScenario.inactivePatients, calculatorScenario.patientValue,
      calculatorScenario.additionalPatientsPerMonth, calculatorScenario.newPatientValue,
    ].join(',')}</output>,
}))

function mountCalculator() {
  return render(<OpportunityProvider><CombinedCalculator /></OpportunityProvider>)
}

describe('combined revenue calculator', () => {
  it('calculates each part and their sum at the defaults and all four extremes', () => {
    expect(calculateCombinedRevenue(1000, 2000, 5, 2000)).toMatchObject({
      reactivated: 50, reactivationRevenue: 100000, leadPatientsPerYear: 60, leadRevenue: 120000, total: 220000,
    })
    expect(calculateCombinedRevenue(100, 1000, 1, 1000)).toMatchObject({
      reactivationRevenue: 5000, leadRevenue: 12000, total: 17000,
    })
    expect(calculateCombinedRevenue(5000, 10000, 40, 10000)).toMatchObject({
      reactivationRevenue: 2500000, leadRevenue: 4800000, total: 7300000,
    })
  })

  it('keeps both slider rows aligned and updates each independent estimate', () => {
    const { container } = mountCalculator()
    expect(screen.getByText('$220,000')).toBeTruthy()
    const sliders = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="range"]'))
    expect(sliders).toHaveLength(4)
    expect(sliders.map(slider => [slider.min, slider.max, slider.step])).toEqual([
      ['100', '5000', '100'], ['1000', '10000', '100'],
      ['1', '40', '1'], ['1000', '10000', '100'],
    ])
    expect(sliders.every(slider => slider.parentElement?.firstElementChild?.classList.contains('lg:min-h-10'))).toBe(true)
    fireEvent.change(sliders[0], { target: { value: '5000' } })
    fireEvent.change(sliders[1], { target: { value: '10000' } })
    fireEvent.change(sliders[2], { target: { value: '40' } })
    fireEvent.change(sliders[3], { target: { value: '10000' } })
    expect(screen.getByText('$2,500,000 reactivation')).toBeTruthy()
    expect(screen.getByText('$4,800,000 lead follow-up')).toBeTruthy()
    expect(screen.getByText('$7,300,000')).toBeTruthy()
  })

  it('forwards all four chosen values to the real dialog form context', () => {
    mountCalculator()
    fireEvent.change(screen.getByLabelText('How many inactive patient files do you have?'), { target: { value: '2000' } })
    fireEvent.change(screen.getByLabelText("What's a patient worth to you per year?"), { target: { value: '3000' } })
    fireEvent.change(screen.getByLabelText('How many additional new patients could better follow-up bring in each month?'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText("What's a new patient worth over their first year?"), { target: { value: '4000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Talk Through This Opportunity' }))
    expect(screen.getByTestId('forwarded-calculator').textContent).toBe('2000,3000,10,4000')
  })
})