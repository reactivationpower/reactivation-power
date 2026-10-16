import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { GuidedScriptDemo, renderSample, SCRIPT_EXAMPLES } from './guided-script-demo'

type SavedFlow = {
  steps: { step_key: string; content: string }[]
  choices: { from_step_key: string; to_step_key: string; label: string }[]
}
function savedFlow(name: string): SavedFlow {
  const path = resolve(process.cwd(), '../api-server/content/flows', name)
  return JSON.parse(readFileSync(path, 'utf8')) as SavedFlow
}

describe('public two-screen sample excerpts', () => {
  it.each([
    ['reactivation', 'chiropractic.json', 'opening_question', ['resp_doing_great', 'resp_coming_back', 'resp_fully_back']],
    ['lead', 'general.lead.json', 'why_not_booked', ['reason_no_callback', 'reason_busy', 'reason_cost', 'reason_deciding', 'close_booked_elsewhere']],
  ] as const)('%s stays verbatim with its saved flow and response buttons', (mode, file, firstKey, branchKeys) => {
    const flow = savedFlow(file)
    const excerpt = SCRIPT_EXAMPLES[mode]
    expect(excerpt.first).toBe(flow.steps.find(step => step.step_key === firstKey)?.content)
    expect(excerpt.branches).toHaveLength(branchKeys.length)
    branchKeys.forEach((key, i) => {
      expect(excerpt.branches[i].content).toBe(flow.steps.find(step => step.step_key === key)?.content)
      expect(excerpt.branches[i].label).toBe(flow.choices.find(choice => choice.from_step_key === firstKey && choice.to_step_key === key)?.label)
      expect(renderSample(excerpt.branches[i].content, mode)).not.toMatch(/\{\{|\}\}/)
    })
    expect(renderSample(excerpt.first, mode)).not.toMatch(/\{\{|\}\}/)
  })

  it('shows every branch, resets, and switches modes without carrying a previous response', () => {
    render(<GuidedScriptDemo />)
    for (const mode of ['reactivation', 'lead'] as const) {
      fireEvent.click(screen.getByTestId(`button-demo-${mode}`))
      expect(screen.getByText(SCRIPT_EXAMPLES[mode].sample)).toBeTruthy()
      SCRIPT_EXAMPLES[mode].branches.forEach((branch, i) => {
        fireEvent.click(screen.getByTestId(`button-demo-${mode}-${i}`))
        expect(screen.getByText(/Screen 2 of 2/).textContent).toContain(branch.title)
        expect(within(screen.getByLabelText('Two screens of the real script')).getByText(branch.label)).toBeTruthy()
        expect(screen.queryByText(/\{\{|\}\}/)).toBeNull()
        fireEvent.click(screen.getByTestId('button-demo-reset'))
        expect(screen.getByText(/Screen 1 of 2/)).toBeTruthy()
      })
    }
    fireEvent.click(screen.getByTestId('button-demo-lead-0'))
    fireEvent.click(screen.getByTestId('button-demo-reactivation'))
    expect(screen.getByText(/Screen 1 of 2/)).toBeTruthy()
    expect(screen.queryByText(/Screen 2 of 2/)).toBeNull()
  })

  it('fails loudly on an unprovided sample token', () => {
    expect(() => renderSample('{{not_provided}}', 'lead')).toThrow('Missing homepage sample token: not_provided')
  })
})