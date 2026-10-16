import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Router, useLocation } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'
import { StrategyCallButton, StrategyCallProvider } from './strategy-call-modal'

function Destination() {
  const [location] = useLocation()
  return <output data-testid="destination">{location}</output>
}

function mount() {
  const location = memoryLocation({ path: '/strategy-call' })
  render(
    <Router hook={location.hook}>
      <StrategyCallProvider>
        <StrategyCallButton />
        <Destination />
      </StrategyCallProvider>
    </Router>,
  )
  return userEvent.setup()
}

describe('strategy call audience choices', () => {
  it.each([
    ["I'm a provider", '/strategy-call/schedule', 'button-modal-provider', 'bg-accent', 'text-accent-foreground'],
    ["I'm a patient", '/strategy-call/providers-only', 'button-modal-patient', 'bg-card', 'text-accent'],
  ])('routes %s and closes the dialog', async (name, destination, testId, background, foreground) => {
    const user = mount()
    await user.click(screen.getByRole('button', { name: 'Schedule Strategy Call' }))
    expect(screen.getByRole('dialog').getAttribute('aria-labelledby')).toBeTruthy()
    const choice = screen.getByRole('button', { name })
    expect(choice).toBe(screen.getByTestId(testId))
    expect(choice.textContent?.trim()).toBe(name)
    expect(choice.children).toHaveLength(0)
    for (const className of [background, foreground, 'border-accent', 'text-center', 'focus-visible:outline-offset-2']) {
      expect(choice.classList.contains(className)).toBe(true)
    }
    await user.click(choice)
    expect(screen.getByTestId('destination').textContent).toBe(destination)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('keeps keyboard choices and Escape dismissal without navigating', async () => {
    const user = mount()
    await user.click(screen.getByRole('button', { name: 'Schedule Strategy Call' }))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('button-modal-provider')))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByTestId('button-modal-patient'))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByTestId('destination').textContent).toBe('/strategy-call')
  })
})
