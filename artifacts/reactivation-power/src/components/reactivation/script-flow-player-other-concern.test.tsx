import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ScriptFlowPlayer } from './script-flow-player'
import type { ScriptFlowChoice, ScriptFlowStep, Sector } from '@/lib/types'
import { CONCERN_FALLBACK, type ConcernOption } from '@workspace/niche-catalog'

// Guards the "Other…" type-in on the questions screen: whatever the caller
// types must fill {{main_concern}} and {{complaint_reference}} on every later
// screen, and clearing the box must drop back to the generic fallbacks.

const HEALTHCARE_FALLBACK = 'what you originally came in for'
const HOME_FALLBACK = 'what we originally came out for'

const steps: ScriptFlowStep[] = [
  {
    id: 's1',
    niche_id: null,
    step_key: 'digging_in',
    title: 'Questions',
    content:
      'Which one would you most like gone? {{main_concern}} — is that the one?',
    sort_order: 1,
    updated_at: '',
  },
  {
    id: 's2',
    niche_id: null,
    step_key: 'recommendation',
    title: 'Recommendation',
    content:
      'Let us take a look at {{main_concern}}.\n\nWe can also revisit {{complaint_reference}} while you are here.',
    sort_order: 2,
    updated_at: '',
  },
]

const choices: ScriptFlowChoice[] = [
  {
    id: 'c1',
    niche_id: null,
    from_step_key: 'digging_in',
    label: 'They named it',
    to_step_key: 'recommendation',
    variant: 'positive',
    sort_order: 1,
  },
]

const concernOptions: ConcernOption[] = [
  { label: 'Headaches', spoken: 'your headaches' },
]

function renderPlayer(sector: Sector | null | undefined = 'healthcare') {
  return render(
    <ScriptFlowPlayer
      steps={steps}
      choices={choices}
      nicheId={null}
      sector={sector}
      extras={{}}
      fontSize={16}
      concernOptions={concernOptions}
    />,
  )
}

function bodyText(container: HTMLElement): string {
  return container.textContent ?? ''
}

function openOtherAndType(value: string): HTMLInputElement {
  fireEvent.click(screen.getByRole('button', { name: 'Other…' }))
  const input = screen.getByPlaceholderText(/type it as you/i) as HTMLInputElement
  fireEvent.change(input, { target: { value } })
  return input
}

describe('ScriptFlowPlayer "Other…" concern', () => {
  it('shows the generic fallback before anything is typed', () => {
    const { container } = renderPlayer()
    expect(bodyText(container)).toContain(CONCERN_FALLBACK)
  })

  it('carries the typed concern into the current and following screens', () => {
    const { container } = renderPlayer()

    openOtherAndType('  the ringing in my ears ')

    // Current screen updates live as the caller types (trimmed).
    let text = bodyText(container)
    expect(text).toContain('the ringing in my ears — is that the one?')
    expect(text).not.toContain(CONCERN_FALLBACK)

    // Navigate onward via a routing button; the concern must survive.
    fireEvent.click(screen.getByRole('button', { name: 'They named it' }))

    text = bodyText(container)
    expect(text).toContain('Let us take a look at the ringing in my ears.')
    expect(text).toContain('revisit the ringing in my ears while you are here.')
    expect(text).not.toContain(CONCERN_FALLBACK)
    expect(text).not.toContain(HEALTHCARE_FALLBACK)
    // The header pill still names the captured concern.
    expect(text).toContain('Other')
  })

  it('falls back to the generic phrases when the box is cleared', () => {
    const { container } = renderPlayer('healthcare')

    const input = openOtherAndType('the dizziness')
    expect(bodyText(container)).toContain('the dizziness')

    fireEvent.change(input, { target: { value: '   ' } })

    fireEvent.click(screen.getByRole('button', { name: 'They named it' }))

    const text = bodyText(container)
    expect(text).not.toContain('the dizziness')
    expect(text).toContain(`Let us take a look at ${CONCERN_FALLBACK}.`)
    expect(text).toContain(`revisit ${HEALTHCARE_FALLBACK} while you are here.`)
  })

  it('uses the home-services complaint fallback after clearing the box', () => {
    const { container } = renderPlayer('home_services')

    const input = openOtherAndType('the noisy furnace')
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'They named it' }))

    const text = bodyText(container)
    expect(text).not.toContain('the noisy furnace')
    expect(text).toContain(`Let us take a look at ${CONCERN_FALLBACK}.`)
    expect(text).toContain(`revisit ${HOME_FALLBACK} while you are here.`)
    expect(text).not.toContain(HEALTHCARE_FALLBACK)
  })

  it('lets a tapped chip replace the typed concern and vice versa', () => {
    const { container } = renderPlayer()

    openOtherAndType('the dizziness')
    fireEvent.click(screen.getByRole('button', { name: 'Headaches' }))
    expect(bodyText(container)).toContain('your headaches — is that the one?')
    expect(bodyText(container)).not.toContain('the dizziness')

    // Re-opening "Other…" restores the previously typed phrase.
    fireEvent.click(screen.getByRole('button', { name: 'Other…' }))
    expect(bodyText(container)).toContain('the dizziness — is that the one?')
    expect(bodyText(container)).not.toContain('your headaches')
  })
})
