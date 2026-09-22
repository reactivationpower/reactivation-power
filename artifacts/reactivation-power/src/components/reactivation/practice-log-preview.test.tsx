import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PracticeLogPreview } from './practice-log-preview'
import { ScriptFlowPlayer } from './script-flow-player'
import type { ScriptFlowStep } from '@/lib/types'

// The scheduling coaching note tells the caller to "add your notes and press
// the green Scheduled button below". In practice mode (no contact loaded)
// those controls must still be on screen, switched off, so the note never
// points at something that is not there.

const terminalStep: ScriptFlowStep[] = [
  {
    id: 's1',
    niche_id: null,
    step_key: 'scheduling',
    title: 'Scheduling',
    content:
      'You are all set.\n\n(Add your notes and press the green "Scheduled" button below.)',
    sort_order: 1,
    updated_at: '',
  },
]

describe('PracticeLogPreview', () => {
  it('shows a disabled Scheduled button and a disabled notes box', () => {
    render(<PracticeLogPreview />)

    const scheduled = screen.getByRole('button', { name: 'Scheduled' })
    expect((scheduled as HTMLButtonElement).disabled).toBe(true)
    for (const label of [
      'No Answer',
      'Spoke, Didn\u2019t Schedule',
      'Spoke, Call Back Later',
      'Do Not Call',
    ]) {
      expect((screen.getByRole("button", { name: label }) as HTMLButtonElement).disabled).toBe(true)
    }

    const notes = screen.getByRole('textbox', {
      name: /notes for this call/i,
    })
    expect((notes as HTMLTextAreaElement).disabled).toBe(true)
    expect(screen.getByText(/practice mode: nothing is saved here/i)).toBeTruthy()
  })
})

describe('ScriptFlowPlayer end-of-script copy', () => {
  it('does not promise a real call log in practice mode', () => {
    const { container } = render(
      <ScriptFlowPlayer
        steps={terminalStep}
        choices={[]}
        nicheId={null}
        extras={{}}
        fontSize={16}
        practice
      />,
    )
    expect(container.textContent).toContain('in practice mode')
    expect(container.textContent).not.toContain(
      'Add your notes and log the call outcome below.',
    )
  })

  it('keeps the live wording by default', () => {
    const { container } = render(
      <ScriptFlowPlayer
        steps={terminalStep}
        choices={[]}
        nicheId={null}
        extras={{}}
        fontSize={16}
      />,
    )
    expect(container.textContent).toContain(
      'End of script. Add your notes and log the call outcome below.',
    )
  })
})
