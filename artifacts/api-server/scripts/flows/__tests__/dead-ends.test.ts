import { describe, expect, it } from 'vitest'
import {
  GENERAL_SLUG,
  KNOWN_DEAD_ENDS,
  findDeadEnds,
  isTerminalStep,
  listSlugs,
  readFlowFile,
  type FlowChoice,
  type FlowFile,
  type FlowStep,
} from '../lib.ts'

const step = (step_key: string, sort_order = 0): FlowStep => ({
  step_key,
  title: step_key,
  content: 'Hello.',
  sort_order,
})

const choice = (from_step_key: string, to_step_key: string): FlowChoice => ({
  from_step_key,
  label: 'Next',
  to_step_key,
  variant: 'default',
  sort_order: 0,
})

const general: FlowFile = {
  niche: null,
  steps: [step('open'), step('recommendation'), step('obj_cost'), step('scheduling')],
  choices: [
    choice('open', 'recommendation'),
    choice('recommendation', 'scheduling'),
    choice('obj_cost', 'scheduling'),
  ],
}

const niche = (steps: FlowStep[], choices: FlowChoice[]): FlowFile => ({
  niche: { name: 'Test', sector: 'healthcare', is_active: true, sort_order: 0 },
  steps,
  choices,
})

describe('isTerminalStep', () => {
  it('treats scheduling, close and wrap-up screens as script endings', () => {
    for (const k of [
      'scheduling',
      'close_appt',
      'close_callback',
      'close_no',
      'booked_wrap',
      'masseter_bonus',
      'other_areas_bonus',
      'voicemail',
      'wrong_number',
      'dnc',
      'end',
      'end_call',
      'wrap_up',
    ]) {
      expect(isTerminalStep(k), k).toBe(true)
    }
  })

  it('does not treat objections or question screens as endings', () => {
    for (const k of ['obj_cost', 'obj_came_back_stopped', 'digging_in', 'recommendation', 'uncover']) {
      expect(isTerminalStep(k), k).toBe(false)
    }
  })
})

describe('findDeadEnds', () => {
  it('errors on a non-terminal step with no outgoing choice anywhere', () => {
    const file = niche([step('obj_came_back_stopped')], [])
    const problems = findDeadEnds('test', file, general, {})
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatchObject({
      level: 'error',
      where: 'test:obj_came_back_stopped',
    })
    expect(problems[0].message).toMatch(/R12 dead end/)
  })

  it('accepts a niche step whose choices come from general.json', () => {
    // text-only override of a general objection: general's buttons still apply
    const file = niche([step('obj_cost')], [])
    expect(findDeadEnds('test', file, general, {})).toEqual([])
  })

  it('accepts a niche step with its own outgoing choice', () => {
    const file = niche([step('obj_x')], [choice('obj_x', 'scheduling')])
    expect(findDeadEnds('test', file, general, {})).toEqual([])
  })

  it('ignores terminal steps', () => {
    const file = niche([step('scheduling'), step('close_no'), step('jaw_bonus')], [])
    expect(findDeadEnds('test', file, general, {})).toEqual([])
  })

  it('downgrades allow-listed dead ends to warnings', () => {
    const file = niche([step('obj_think'), step('obj_send_info')], [])
    const problems = findDeadEnds('test', file, general, { test: ['obj_think', 'obj_send_info'] })
    expect(problems.map((p) => p.level)).toEqual(['warn', 'warn'])
    expect(problems[0].message).toMatch(/known dead end/)
  })

  it('warns when an allow-list entry no longer applies', () => {
    const file = niche([step('obj_think')], [choice('obj_think', 'scheduling')])
    const problems = findDeadEnds('test', file, general, { test: ['obj_think', 'obj_gone'] })
    expect(problems).toHaveLength(2)
    for (const p of problems) expect(p.level).toBe('warn')
    expect(problems.map((p) => p.message).join('\n')).toMatch(/now has outgoing choices/)
    expect(problems.map((p) => p.message).join('\n')).toMatch(/does not exist/)
  })

  it('checks general.json against itself only', () => {
    const broken: FlowFile = { ...general, steps: [...general.steps, step('uncover')] }
    const problems = findDeadEnds(GENERAL_SLUG, broken, broken, {})
    expect(problems).toHaveLength(1)
    expect(problems[0].where).toBe('general:uncover')
  })
})

describe('content/flows', () => {
  it('has no un-listed dead ends and no stale allow-list entries', () => {
    const gen = readFlowFile(GENERAL_SLUG)
    const errors = listSlugs().flatMap((slug) =>
      findDeadEnds(slug, readFlowFile(slug), gen, KNOWN_DEAD_ENDS).filter(
        (p) => p.level === 'error' || /stale/.test(p.message),
      ),
    )
    expect(errors.map((p) => `${p.where}: ${p.message}`)).toEqual([])
  })
})
