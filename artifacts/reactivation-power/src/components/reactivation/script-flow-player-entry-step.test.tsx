import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ScriptFlowPlayer } from './script-flow-player'
import type { ScriptFlowChoice, ScriptFlowStep } from '@workspace/shared/types'

// A lead who picked a day and time on the ad form starts on the confirm
// screen rather than the Open, and Restart returns there. The call screen
// listens to onStepChange to pre-select the confirmed / rescheduled outcome
// when the caller reaches the matching close screen.

const step = (step_key: string, content: string, sort_order: number): ScriptFlowStep => ({
  id: step_key,
  niche_id: null,
  step_key,
  title: step_key,
  content,
  sort_order,
  updated_at: '',
})

const steps: ScriptFlowStep[] = [
  step('open', 'Hi, you reached out about our offer.', 1),
  step('why_not_booked', 'What got in the way?', 2),
  step('confirm_requested', 'You asked for {{requested_time}}. Still good?', 300),
  step('close_confirmed', 'Locked in for {{requested_time}}.', 301),
  step('reschedule', 'Let us find another time.', 302),
  step('close_rescheduled', 'New time locked in.', 303),
  step('confirm_unsure', 'What is giving you pause?', 304),
]

const choice = (from: string, label: string, to: string, sort_order: number): ScriptFlowChoice => ({
  id: `${from}->${to}`,
  niche_id: null,
  from_step_key: from,
  label,
  to_step_key: to,
  variant: 'default',
  sort_order,
})

const choices: ScriptFlowChoice[] = [
  choice('open', 'Talk', 'why_not_booked', 1),
  choice('confirm_requested', 'Confirmed', 'close_confirmed', 1),
  choice('confirm_requested', 'Needs a different time', 'reschedule', 2),
  choice('confirm_requested', 'Not sure', 'confirm_unsure', 3),
  choice('reschedule', 'New time agreed', 'close_rescheduled', 1),
  choice('confirm_unsure', 'Busy', 'why_not_booked', 1),
]

function renderPlayer(initialStepKey: string | null, onStepChange?: (k: string) => void) {
  return render(
    <ScriptFlowPlayer
      steps={steps}
      choices={choices}
      nicheId={null}
      sector="healthcare"
      extras={{ requested_time: 'Tuesday at 2' }}
      fontSize={16}
      flowKind="lead"
      initialStepKey={initialStepKey}
      onStepChange={onStepChange}
    />,
  )
}

describe('lead confirm entry point', () => {
  it('starts on the Open when no entry step is given', () => {
    renderPlayer(null)
    expect(screen.getByText(/you reached out about our offer/i)).toBeTruthy()
    expect(screen.queryByText(/Tuesday at 2/)).toBeNull()
  })

  it('starts on the confirm screen with the requested time filled in, and Restart returns there', () => {
    const seen: string[] = []
    renderPlayer('confirm_requested', (k) => seen.push(k))
    expect(screen.getByText(/You asked for Tuesday at 2/)).toBeTruthy()
    expect(seen).toEqual(['confirm_requested'])

    fireEvent.click(screen.getByRole('button', { name: 'Needs a different time' }))
    expect(screen.getByText(/find another time/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'New time agreed' }))
    expect(seen).toEqual(['confirm_requested', 'reschedule', 'close_rescheduled'])

    fireEvent.click(screen.getByRole('button', { name: /restart/i }))
    expect(screen.getByText(/You asked for Tuesday at 2/)).toBeTruthy()
    expect(seen.at(-1)).toBe('confirm_requested')
  })

  it('hands a not-sure lead into the full script', () => {
    const onStepChange = vi.fn()
    renderPlayer('confirm_requested', onStepChange)
    fireEvent.click(screen.getByRole('button', { name: 'Not sure' }))
    expect(screen.getByText(/giving you pause/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Busy' }))
    expect(screen.getByText(/What got in the way/)).toBeTruthy()
    expect(onStepChange).toHaveBeenLastCalledWith('why_not_booked')
  })

  it('falls back to the Open when the entry step is not in the flow', () => {
    renderPlayer('confirm_requested_missing')
    expect(screen.getByText(/you reached out about our offer/i)).toBeTruthy()
  })
})
