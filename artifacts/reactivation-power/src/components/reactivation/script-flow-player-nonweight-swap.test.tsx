import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ScriptFlowPlayer } from './script-flow-player'
import type { ScriptFlowChoice, ScriptFlowStep } from '@/lib/types'
import type { ConcernOption } from '@workspace/niche-catalog'

// Guards the ChiroThin concern-aware swap: a chip flagged weightRelated:false
// replaces Making It Real with its non-weight variant and hides the
// weight-only objections on the uncover screen. A concern typed under
// "Other…" carries no weightRelated flag, so it must keep today's
// weight-anchored screen and objection set — silently swapping for Other
// would be as much of a regression as the chip swap breaking.

const WEIGHT_SCREEN = 'Picture the number on the scale coming back down.'
const NONWEIGHT_SCREEN = 'Picture waking up without that dragging you down.'

const WEIGHT_ONLY_OBJECTIONS = [
  'obj_do_it_myself',
  'obj_embarrassed',
  'obj_cost_weight',
]
const NONWEIGHT_ONLY_OBJECTIONS = [
  'obj_nw_thought_behind_me',
  'obj_nw_chiro_didnt_help',
]
const SHARED_OBJECTIONS = ['obj_cost', 'obj_time']

const OBJECTION_LABELS: Record<string, string> = {
  obj_do_it_myself: 'I can do it myself',
  obj_embarrassed: 'Embarrassed to come back',
  obj_cost_weight: 'Cost (weight)',
  obj_nw_thought_behind_me: 'Thought that was behind me',
  obj_nw_chiro_didnt_help: 'Chiro did not help before',
  obj_cost: 'Cost',
  obj_time: 'No time',
}

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
    step_key: 'making_it_real',
    title: 'Making It Real',
    content: WEIGHT_SCREEN,
    sort_order: 2,
    updated_at: '',
  },
  {
    id: 's3',
    niche_id: null,
    step_key: 'making_it_real_nw',
    title: 'Making It Real (non-weight)',
    content: NONWEIGHT_SCREEN,
    sort_order: 3,
    updated_at: '',
  },
  {
    id: 's4',
    niche_id: null,
    step_key: 'uncover',
    title: 'Uncover',
    content: 'What has kept you from coming back in?',
    sort_order: 4,
    updated_at: '',
  },
  ...[
    ...WEIGHT_ONLY_OBJECTIONS,
    ...NONWEIGHT_ONLY_OBJECTIONS,
    ...SHARED_OBJECTIONS,
  ].map((key, i) => ({
    id: `obj-${i}`,
    niche_id: null,
    step_key: key,
    title: OBJECTION_LABELS[key],
    content: `Handling for ${key}.`,
    sort_order: 10 + i,
    updated_at: '',
  })),
]

const choices: ScriptFlowChoice[] = [
  {
    id: 'c1',
    niche_id: null,
    from_step_key: 'digging_in',
    label: 'Next: Making It Real',
    to_step_key: 'making_it_real',
    variant: 'positive',
    sort_order: 1,
  },
  {
    id: 'c2',
    niche_id: null,
    from_step_key: 'making_it_real',
    label: 'Next: Uncover',
    to_step_key: 'uncover',
    variant: 'positive',
    sort_order: 1,
  },
  {
    id: 'c3',
    niche_id: null,
    from_step_key: 'making_it_real_nw',
    label: 'Next: Uncover',
    to_step_key: 'uncover',
    variant: 'positive',
    sort_order: 1,
  },
  ...[
    ...WEIGHT_ONLY_OBJECTIONS,
    ...NONWEIGHT_ONLY_OBJECTIONS,
    ...SHARED_OBJECTIONS,
  ].map((key, i) => ({
    id: `uc-${i}`,
    niche_id: null,
    from_step_key: 'uncover',
    label: OBJECTION_LABELS[key],
    to_step_key: key,
    variant: 'objection' as const,
    sort_order: i + 1,
  })),
]

const concernOptions: ConcernOption[] = [
  { label: 'Belly fat', spoken: 'the belly fat', weightRelated: true },
  { label: 'Sleep problems', spoken: 'your sleep', weightRelated: false },
  { label: 'Headaches', spoken: 'your headaches' },
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
      concernOptions={concernOptions}
    />,
  )
}

function bodyText(container: HTMLElement): string {
  return container.textContent ?? ''
}

function advanceToMakingItReal() {
  fireEvent.click(screen.getByRole('button', { name: 'Next: Making It Real' }))
}

function advanceToUncover() {
  fireEvent.click(screen.getByRole('button', { name: 'Next: Uncover' }))
}

function objectionButtonNames(): string[] {
  return screen
    .getAllByRole('button')
    .map((b) => b.textContent?.trim() ?? '')
    .filter((name) => Object.values(OBJECTION_LABELS).includes(name))
}

function labelsFor(keys: string[]): string[] {
  return keys.map((k) => OBJECTION_LABELS[k])
}

describe('ScriptFlowPlayer ChiroThin non-weight swap', () => {
  it('shows the weight screen and weight objections when no chip is tapped', () => {
    const { container } = renderPlayer()
    advanceToMakingItReal()

    expect(bodyText(container)).toContain(WEIGHT_SCREEN)
    expect(bodyText(container)).not.toContain(NONWEIGHT_SCREEN)

    advanceToUncover()
    const names = objectionButtonNames()
    for (const label of labelsFor(WEIGHT_ONLY_OBJECTIONS)) {
      expect(names).toContain(label)
    }
    for (const label of labelsFor(NONWEIGHT_ONLY_OBJECTIONS)) {
      expect(names).not.toContain(label)
    }
    for (const label of labelsFor(SHARED_OBJECTIONS)) {
      expect(names).toContain(label)
    }
  })

  it('swaps to the non-weight screen and hides weight-only objections for a weightRelated:false chip', () => {
    const { container } = renderPlayer()

    fireEvent.click(screen.getByRole('button', { name: 'Sleep problems' }))
    advanceToMakingItReal()

    expect(bodyText(container)).toContain(NONWEIGHT_SCREEN)
    expect(bodyText(container)).not.toContain(WEIGHT_SCREEN)

    advanceToUncover()
    const names = objectionButtonNames()
    for (const label of labelsFor(WEIGHT_ONLY_OBJECTIONS)) {
      expect(names).not.toContain(label)
    }
    for (const label of labelsFor(NONWEIGHT_ONLY_OBJECTIONS)) {
      expect(names).toContain(label)
    }
    for (const label of labelsFor(SHARED_OBJECTIONS)) {
      expect(names).toContain(label)
    }
  })

  it('keeps the weight screen and weight objections for a weightRelated:true chip', () => {
    const { container } = renderPlayer()

    fireEvent.click(screen.getByRole('button', { name: 'Belly fat' }))
    advanceToMakingItReal()

    expect(bodyText(container)).toContain(WEIGHT_SCREEN)
    expect(bodyText(container)).not.toContain(NONWEIGHT_SCREEN)

    advanceToUncover()
    const names = objectionButtonNames()
    for (const label of labelsFor(WEIGHT_ONLY_OBJECTIONS)) {
      expect(names).toContain(label)
    }
    for (const label of labelsFor(NONWEIGHT_ONLY_OBJECTIONS)) {
      expect(names).not.toContain(label)
    }
  })

  it('keeps the weight screen and weight objections for a concern typed under Other…', () => {
    const { container } = renderPlayer()

    fireEvent.click(screen.getByRole('button', { name: 'Other…' }))
    const input = screen.getByPlaceholderText(/type it as you/i)
    fireEvent.change(input, { target: { value: 'the dizziness' } })

    advanceToMakingItReal()

    // The typed concern is live, but it carries no weightRelated flag, so the
    // weight-anchored screen stays.
    expect(bodyText(container)).toContain(WEIGHT_SCREEN)
    expect(bodyText(container)).not.toContain(NONWEIGHT_SCREEN)

    advanceToUncover()
    const names = objectionButtonNames()
    for (const label of labelsFor(WEIGHT_ONLY_OBJECTIONS)) {
      expect(names).toContain(label)
    }
    for (const label of labelsFor(NONWEIGHT_ONLY_OBJECTIONS)) {
      expect(names).not.toContain(label)
    }
    for (const label of labelsFor(SHARED_OBJECTIONS)) {
      expect(names).toContain(label)
    }
  })

  it('drops the swap again when Other… replaces a non-weight chip', () => {
    const { container } = renderPlayer()

    fireEvent.click(screen.getByRole('button', { name: 'Sleep problems' }))
    fireEvent.click(screen.getByRole('button', { name: 'Other…' }))
    const input = screen.getByPlaceholderText(/type it as you/i)
    fireEvent.change(input, { target: { value: 'the dizziness' } })

    advanceToMakingItReal()

    expect(bodyText(container)).toContain(WEIGHT_SCREEN)
    expect(bodyText(container)).not.toContain(NONWEIGHT_SCREEN)

    advanceToUncover()
    const names = objectionButtonNames()
    for (const label of labelsFor(WEIGHT_ONLY_OBJECTIONS)) {
      expect(names).toContain(label)
    }
    for (const label of labelsFor(NONWEIGHT_ONLY_OBJECTIONS)) {
      expect(names).not.toContain(label)
    }
  })
})
