import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ScriptFlowPlayer } from './script-flow-player'
import type { ScriptFlowChoice, ScriptFlowStep } from '@/lib/types'

// Guards parent/guardian wording. A "who's on the phone" screen routes
// through a hidden mode_parent marker step; from then on every {{pt_*}}
// token must resolve to parent wording ("your child" / "their") and the
// header must show the Parent/guardian badge. Back must step over the
// marker in one tap and restore patient wording.

const BADGE = 'Parent/guardian wording'
const QUESTIONS =
  'Is {{pt_you}} still happy with {{pt_your}} smile? {{pt_you_cap}} mentioned {{pt_them}} before.'

function step(
  step_key: string,
  title: string,
  content: string,
  sort_order: number,
): ScriptFlowStep {
  return {
    id: step_key,
    niche_id: null,
    step_key,
    title,
    content,
    sort_order,
    updated_at: '',
  }
}

function choice(
  from_step_key: string,
  label: string,
  to_step_key: string,
  sort_order = 1,
): ScriptFlowChoice {
  return {
    id: `${from_step_key}->${to_step_key}`,
    niche_id: null,
    from_step_key,
    label,
    to_step_key,
    variant: 'default',
    sort_order,
  }
}

const steps: ScriptFlowStep[] = [
  step('who_on_phone', 'Who is on the phone?', 'Am I speaking with the patient or a parent?', 1),
  // Marker step: never displayed, only recorded in the trail.
  step('mode_parent', 'Parent marker', 'SHOULD NEVER RENDER', 2),
  step('digging_in', 'Questions', QUESTIONS, 3),
  step('uncover', 'Uncover', 'Let\u2019s {{pt_get_you_in}} soon.', 4),
]

const choices: ScriptFlowChoice[] = [
  choice('who_on_phone', 'Patient', 'digging_in', 1),
  choice('who_on_phone', 'Parent / guardian', 'mode_parent', 2),
  choice('mode_parent', 'continue', 'digging_in'),
  choice('digging_in', 'Next', 'uncover'),
]

function renderPlayer() {
  return render(
    <ScriptFlowPlayer
      steps={steps}
      choices={choices}
      nicheId={null}
      sector="healthcare"
      extras={{}}
      fontSize={16}
    />,
  )
}

function text(container: HTMLElement): string {
  return container.textContent ?? ''
}

function tap(name: string) {
  fireEvent.click(screen.getByRole('button', { name }))
}

describe('ScriptFlowPlayer parent/guardian mode', () => {
  it('starts in patient wording with no badge', () => {
    const { container } = renderPlayer()
    tap('Patient')

    const body = text(container)
    expect(body).toContain('Is you still happy with your smile? You mentioned you before.')
    expect(body).not.toContain('your child')
    expect(body).not.toContain(BADGE)
  })

  it('routes through the mode_parent marker and renders parent wording plus the badge', () => {
    const { container } = renderPlayer()
    tap('Parent / guardian')

    const body = text(container)
    // Landed on the step past the marker, not on the marker itself.
    expect(screen.getByRole('heading', { name: 'Questions' })).toBeTruthy()
    expect(body).not.toContain('SHOULD NEVER RENDER')

    expect(body).toContain(
      'Is your child still happy with their smile? Your child mentioned them before.',
    )
    expect(body).not.toContain('with your smile')
    expect(body).toContain(BADGE)
  })

  it('keeps parent wording on later steps', () => {
    const { container } = renderPlayer()
    tap('Parent / guardian')
    tap('Next')

    const body = text(container)
    expect(screen.getByRole('heading', { name: 'Uncover' })).toBeTruthy()
    expect(body).toContain('Let\u2019s get your child in soon.')
    expect(body).toContain(BADGE)
  })

  it('Back skips over the marker in one tap and restores patient wording', () => {
    const { container } = renderPlayer()
    tap('Parent / guardian')
    expect(text(container)).toContain(BADGE)

    tap('Back')

    // One Back lands on the who's-on-the-phone screen, never on the marker.
    expect(
      screen.getByRole('heading', { name: 'Who is on the phone?' }),
    ).toBeTruthy()
    expect(text(container)).not.toContain('SHOULD NEVER RENDER')
    expect(text(container)).not.toContain(BADGE)

    // Trail is empty again, so Back is disabled.
    expect(
      (screen.getByRole('button', { name: 'Back' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)

    // Choosing the patient path now renders patient wording.
    tap('Patient')
    const body = text(container)
    expect(body).toContain('Is you still happy with your smile?')
    expect(body).not.toContain('your child')
    expect(body).not.toContain(BADGE)
  })

  it('Back from a later step returns to the questions screen still in parent mode', () => {
    const { container } = renderPlayer()
    tap('Parent / guardian')
    tap('Next')
    tap('Back')

    expect(screen.getByRole('heading', { name: 'Questions' })).toBeTruthy()
    const body = text(container)
    expect(body).toContain('Is your child still happy with their smile?')
    expect(body).toContain(BADGE)
  })

  it('Restart clears parent mode', () => {
    const { container } = renderPlayer()
    tap('Parent / guardian')
    tap('Restart')

    expect(
      screen.getByRole('heading', { name: 'Who is on the phone?' }),
    ).toBeTruthy()
    expect(text(container)).not.toContain(BADGE)
  })
})
