import { describe, expect, it } from 'vitest'
import { validateForApply } from '../apply.ts'
import {
  GENERAL_SLUG,
  generalSlugFor,
  isGeneralSlug,
  KNOWN_DEAD_ENDS,
  findDeadEnds,
  findUnreachableSteps,
  isEntryStep,
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

describe('isEntryStep', () => {
  it('treats open and the outcome-button screens as entry screens', () => {
    for (const k of ['open', 'voicemail', 'wrong_number', 'dnc']) {
      expect(isEntryStep(k), k).toBe(true)
    }
  })

  it('does not treat mid-call screens as entry screens', () => {
    for (const k of ['recommendation', 'obj_cost', 'scheduling', 'open_variant', 'reopen']) {
      expect(isEntryStep(k), k).toBe(false)
    }
  })
})

describe('findUnreachableSteps (R15)', () => {
  it('passes a step that a choice in the same file routes to', () => {
    const file = niche(
      [step('resp_fine'), step('obj_think')],
      [choice('resp_fine', 'obj_think'), choice('obj_think', 'scheduling')],
    )
    const problems = findUnreachableSteps('test', file, {
      ...general,
      choices: [...general.choices, choice('open', 'resp_fine')],
    })
    expect(problems).toEqual([])
  })

  it('passes a niche override that only general.json routes to', () => {
    const file = niche([step('recommendation')], [choice('recommendation', 'scheduling')])
    expect(findUnreachableSteps('test', file, general)).toEqual([])
  })

  it('warns about a step no choice routes to', () => {
    const file = niche(
      [step('obj_think'), step('obj_thnik_reassure')],
      [choice('obj_think', 'scheduling'), choice('obj_thnik_reassure', 'scheduling')],
    )
    const problems = findUnreachableSteps('test', file, {
      ...general,
      choices: [...general.choices, choice('recommendation', 'obj_think')],
    })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatchObject({ level: 'warn', where: 'test:obj_thnik_reassure' })
    expect(problems[0].message).toMatch(/R15 unreachable/)
  })

  it('never flags entry screens', () => {
    const file = niche(
      [step('open'), step('voicemail'), step('wrong_number'), step('dnc')],
      [choice('open', 'recommendation')],
    )
    expect(findUnreachableSteps('test', file, general)).toEqual([])
  })

  it('never flags the player-swapped making_it_real_nw screen', () => {
    const file = niche([step('making_it_real_nw')], [choice('making_it_real_nw', 'scheduling')])
    expect(findUnreachableSteps('test', file, general)).toEqual([])
  })

  it('checks general.json against its own choices plus the niche files given', () => {
    const shared: FlowFile = {
      ...general,
      steps: [...general.steps, step('obj_cost_weight')],
      choices: [...general.choices, choice('recommendation', 'obj_cost')],
    }
    expect(findUnreachableSteps(GENERAL_SLUG, shared, shared).map((p) => p.where)).toEqual([
      'general:obj_cost_weight',
    ])
    const referrer = niche([], [choice('uncover', 'obj_cost_weight')])
    expect(findUnreachableSteps(GENERAL_SLUG, shared, shared, [referrer])).toEqual([])
  })
})

describe('content/flows', () => {
  it('has no unreachable steps', () => {
    const generals = listSlugs().filter(isGeneralSlug)
    const problems = generals.flatMap((generalSlug) => {
      const gen = readFlowFile(generalSlug)
      const niches = listSlugs().filter((s) => !isGeneralSlug(s) && generalSlugFor(s) === generalSlug)
      const nicheFiles = niches.map((s) => readFlowFile(s))
      return [
        ...findUnreachableSteps(generalSlug, gen, gen, nicheFiles),
        ...niches.flatMap((slug) => findUnreachableSteps(slug, readFlowFile(slug), gen)),
      ]
    })
    expect(problems.map((p) => `${p.where}: ${p.message}`)).toEqual([])
  })

  it('has no un-listed dead ends and no stale allow-list entries', () => {
    const errors = listSlugs().flatMap((slug) =>
      findDeadEnds(slug, readFlowFile(slug), readFlowFile(generalSlugFor(slug)), KNOWN_DEAD_ENDS).filter(
        (p) => p.level === 'error' || /stale/.test(p.message),
      ),
    )
    expect(errors.map((p) => `${p.where}: ${p.message}`)).toEqual([])
  })
})

describe('flows:apply validation (validateForApply)', () => {
  it('refuses a file whose objection step has no choices', () => {
    const file = niche(
      [step('open'), step('obj_came_back_stopped')],
      [choice('open', 'obj_came_back_stopped')],
    )
    const errors = validateForApply('test', file, general).filter((p) => p.level === 'error')
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({ level: 'error', where: 'test:obj_came_back_stopped' })
    expect(errors[0].message).toMatch(/R12 dead end/)
  })

  it('still reports structural errors alongside dead ends', () => {
    const file = niche([step('obj_x')], [choice('obj_x', 'nowhere')])
    const messages = validateForApply('test', file, general)
      .filter((p) => p.level === 'error')
      .map((p) => p.message)
    expect(messages.join('\n')).toMatch(/routes to missing step_key "nowhere"/)
  })

  it('lets an allow-listed dead end through as a warning only', () => {
    const file = niche([step('obj_think')], [])
    KNOWN_DEAD_ENDS.test = ['obj_think']
    try {
      const problems = validateForApply('test', file, general)
      expect(problems.filter((p) => p.level === 'error')).toEqual([])
      expect(problems.map((p) => p.level)).toEqual(['warn'])
      expect(problems[0].message).toMatch(/known dead end/)
    } finally {
      delete KNOWN_DEAD_ENDS.test
    }
  })

  it('accepts a well-formed file with no problems', () => {
    const file = niche([step('obj_x')], [choice('obj_x', 'scheduling')])
    expect(validateForApply('test', file, general)).toEqual([])
  })

  it('accepts every committed flow file', () => {
    // Each family validates against its own general file.
    const errors = listSlugs().flatMap((slug) =>
      validateForApply(slug, readFlowFile(slug), readFlowFile(generalSlugFor(slug))).filter((p) => p.level === 'error'),
    )
    expect(errors.map((p) => `${p.where}: ${p.message}`)).toEqual([])
  })
})
