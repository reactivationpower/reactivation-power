import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { CombinedOpportunity } from './combined-opportunity'

function finishCalculating() {
  act(() => { vi.advanceTimersByTime(900) })
  act(() => { vi.advanceTimersByTime(900) })
  act(() => { vi.advanceTimersByTime(1100) })
}

describe('booking thank-you combined calculator', () => {
  afterEach(() => { vi.useRealTimers() })

  it('starts reactivation from the form numbers and lead follow-up from homepage defaults', () => {
    vi.useFakeTimers()
    render(<CombinedOpportunity inactiveCount={1500} patientValue={3000} servicesLabel="dental" />)
    expect(screen.getByRole('status', { name: 'Calculating' })).toBeTruthy()
    finishCalculating()
    // 1,500 × 5% = 75 patients × $3,000; 5/mo × 12 × $2,000.
    expect(screen.getByText('$225,000')).toBeTruthy()
    expect(screen.getByText('$120,000')).toBeTruthy()
    expect((screen.getByLabelText('How many inactive patient files do you have?') as HTMLInputElement).value).toBe('1500')
    expect((screen.getByLabelText('How many more new patients per month?') as HTMLInputElement).value).toBe('5')
  })

  it('uses a homepage calculator scenario for both sides and updates when a slider moves', () => {
    vi.useFakeTimers()
    render(<CombinedOpportunity inactiveCount={2000} patientValue={2000} leadsPerMonth={10} leadValue={4000} />)
    finishCalculating()
    expect(screen.getByText('$480,000')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('How many more new patients per month?'), { target: { value: '20' } })
    expect(screen.getByText('$960,000')).toBeTruthy()
    expect(screen.getByText('$960,000 lead follow-up')).toBeTruthy()
  })
})
