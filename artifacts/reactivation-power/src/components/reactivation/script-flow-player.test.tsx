import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ScriptFlowPlayer } from './script-flow-player'
import type { ScriptFlowChoice, ScriptFlowStep, Sector } from '@/lib/types'
import type { ConcernOption } from '@/lib/concern-options'

// Guards the per-sector "Original complaint" wording: home-service calls must
// say "came out for" (the tech went to the house), healthcare keeps "came in
// for", and the optional "especially with" clause still drops for both.

const OPENER = 'How have things been, especially with {{complaint_reference}}?'
const RECOMMEND =
  'I would love to get you back in to take another look at {{complaint_reference}}.'

const steps: ScriptFlowStep[] = [
  {
    id: 's1',
    niche_id: null,
    step_key: 'digging_in',
    title: 'Questions',
    content: `${OPENER}\n\n${RECOMMEND}`,
    sort_order: 1,
    updated_at: '',
  },
]

const choices: ScriptFlowChoice[] = []

const concernOptions: ConcernOption[] = [
  { label: 'Headaches', spoken: 'your headaches' },
]

function renderPlayer(
  sector: Sector | null | undefined,
  extras: Record<string, string> = {},
) {
  return render(
    <ScriptFlowPlayer
      steps={steps}
      choices={choices}
      nicheId={null}
      sector={sector}
      extras={extras}
      fontSize={16}
      concernOptions={concernOptions}
    />,
  )
}

function bodyText(container: HTMLElement): string {
  return container.textContent ?? ''
}

describe('ScriptFlowPlayer original-complaint fallback', () => {
  it('fills "came out for" for home services and drops the especially-with clause', () => {
    const { container } = renderPlayer('home_services')

    // Before any tap: bare token gets the fallback, clause is dropped.
    expect(bodyText(container)).toContain('How have things been?')
    expect(bodyText(container)).toContain(
      'take another look at what we originally came out for.',
    )
    expect(bodyText(container)).not.toContain('came in for')

    fireEvent.click(screen.getByRole('button', { name: 'Original complaint' }))

    const text = bodyText(container)
    expect(text).toContain('“what we originally came out for”')
    expect(text).toContain(
      'take another look at what we originally came out for.',
    )
    expect(text).toContain('How have things been?')
    expect(text).not.toContain('especially with')
    expect(text).not.toContain('came in for')
  })

  it('keeps "came in for" for healthcare and drops the especially-with clause', () => {
    const { container } = renderPlayer('healthcare')

    fireEvent.click(screen.getByRole('button', { name: 'Original complaint' }))

    const text = bodyText(container)
    expect(text).toContain('“what you originally came in for”')
    expect(text).toContain(
      'take another look at what you originally came in for.',
    )
    expect(text).toContain('How have things been?')
    expect(text).not.toContain('especially with')
    expect(text).not.toContain('came out for')
  })

  it('defaults to the healthcare wording when no sector is passed', () => {
    const { container } = renderPlayer(undefined)
    expect(bodyText(container)).toContain('what you originally came in for')
    expect(bodyText(container)).not.toContain('came out for')
  })

  it('keeps the especially-with clause when a real concern is tapped', () => {
    const { container } = renderPlayer('home_services')

    fireEvent.click(screen.getByRole('button', { name: 'Headaches' }))

    const text = bodyText(container)
    expect(text).toContain('How have things been, especially with your headaches?')
    expect(text).toContain('take another look at your headaches.')
  })

  it('speaks a documented condition instead of the fallback', () => {
    const { container } = renderPlayer('home_services', {
      complaint_reference: 'the noisy furnace',
    })

    expect(
      screen.getByRole('button', { name: 'Noisy furnace (original)' }),
    ).toBeTruthy()
    const text = bodyText(container)
    expect(text).toContain(
      'How have things been, especially with the noisy furnace?',
    )
    expect(text).not.toContain('came out for')
  })
})
