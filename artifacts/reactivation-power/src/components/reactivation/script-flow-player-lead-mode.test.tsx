import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { LEAD_FIRST_CHIP, ScriptFlowPlayer } from './script-flow-player'
import type { ScriptFlowChoice, ScriptFlowStep } from '@workspace/shared/types'
import type { ConcernOption } from '@workspace/niche-catalog'

// Lead scripts talk to people who have never visited, so the questions
// screen must not offer the reactivation "Original complaint" chip or speak
// "what you originally came in for". The first chip is anchored on the form
// they submitted instead. This wording lives in UI code, outside the flow
// lint, so it is pinned here.

const steps: ScriptFlowStep[] = [
  {
    id: 's1',
    niche_id: null,
    step_key: 'digging_in',
    title: 'Questions',
    content: 'Which one would you most like gone?',
    sort_order: 1,
    updated_at: '',
  },
  {
    id: 's2',
    niche_id: null,
    step_key: 'recommendation',
    title: 'Recommendation',
    content: 'Let us take a look at {{main_concern}}.',
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

const concernOptions: ConcernOption[] = [{ label: 'Headaches', spoken: 'your headaches' }]

function renderPlayer(flowKind: 'lead' | 'reactivation') {
  return render(
    <ScriptFlowPlayer
      steps={steps}
      choices={choices}
      nicheId={null}
      sector="healthcare"
      extras={{}}
      fontSize={16}
      concernOptions={concernOptions}
      flowKind={flowKind}
    />,
  )
}

describe('ScriptFlowPlayer lead mode', () => {
  it('replaces the Original complaint chip with the form-submission chip', () => {
    const { container } = renderPlayer('lead')
    expect(screen.queryByRole('button', { name: 'Original complaint' })).toBeNull()
    expect(container.textContent).not.toMatch(/originally came/i)
    fireEvent.click(screen.getByRole('button', { name: LEAD_FIRST_CHIP.label }))
    fireEvent.click(screen.getByRole('button', { name: 'They named it' }))
    expect(container.textContent).toContain(`Let us take a look at ${LEAD_FIRST_CHIP.spoken}.`)
    expect(container.textContent).not.toMatch(/originally came/i)
  })

  it('keeps the reactivation chip for reactivation flows', () => {
    renderPlayer('reactivation')
    expect(screen.getByRole('button', { name: 'Original complaint' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: LEAD_FIRST_CHIP.label })).toBeNull()
  })
})
