import { describe, expect, it } from 'vitest'
import {
  GENERAL_SLUG,
  OBJECTION_EXIT_CHOICES,
  findObjectionExitDrift,
  listSlugs,
  readFlowFile,
  type FlowChoice,
  type FlowFile,
  type FlowStep,
} from '../lib.ts'

const step = (step_key: string): FlowStep => ({ step_key, title: step_key, content: 'Hello.', sort_order: 0 })

const pair = (from: string): FlowChoice[] => OBJECTION_EXIT_CHOICES.map((c) => ({ ...c, from_step_key: from }))

const choice = (from_step_key: string, patch: Partial<FlowChoice>): FlowChoice => ({
  from_step_key,
  label: 'Next',
  to_step_key: 'scheduling',
  variant: 'default',
  sort_order: 0,
  ...patch,
})

const niche = (steps: FlowStep[], choices: FlowChoice[]): FlowFile => ({
  niche: { name: 'Test Niche', sector: 'healthcare', is_active: true, sort_order: 0 },
  steps,
  choices,
})

const general: FlowFile = {
  niche: null,
  steps: [step('scheduling'), step('uncover'), step('obj_cost')],
  choices: pair('obj_cost'),
}

const messages = (file: FlowFile, slug = 't') =>
  findObjectionExitDrift(slug, file, general).map((p) => `${p.level} ${p.where}: ${p.message}`)

describe('R19 shared objection exit pair', () => {
  it('pins the pair itself', () => {
    expect(OBJECTION_EXIT_CHOICES).toEqual([
      { sort_order: 0, label: 'Resolved: back to scheduling', to_step_key: 'scheduling', variant: 'positive' },
      { sort_order: 1, label: 'Another concern came up', to_step_key: 'uncover', variant: 'objection' },
    ])
  })

  it('accepts an objection screen with exactly the pair', () => {
    expect(messages(niche([step('obj_price')], pair('obj_price')))).toEqual([])
  })

  it('accepts the pair in any file order as long as sort_order is 0/1', () => {
    const [a, b] = pair('obj_price')
    expect(messages(niche([step('obj_price')], [b, a]))).toEqual([])
  })

  it('flags a renamed scheduling button', () => {
    const [a, b] = pair('obj_price')
    const msgs = messages(niche([step('obj_price')], [{ ...a, label: 'Resolved: schedule' }, b]))
    expect(msgs).toEqual([
      expect.stringMatching(/^error t:obj_price: R19 objection button 1 differs .* label "Resolved: schedule" \(want "Resolved: back to scheduling"\)/),
    ])
  })

  it('flags a renamed uncover button, a wrong variant, and a wrong target', () => {
    const [a, b] = pair('obj_price')
    const msgs = messages(
      niche([step('obj_price')], [{ ...a, variant: 'default' }, { ...b, label: 'I have another concern', to_step_key: 'recommendation' }]),
    )
    expect(msgs).toHaveLength(2)
    expect(msgs[0]).toMatch(/button 1 differs .* variant default \(want positive\)/)
    expect(msgs[1]).toMatch(/button 2 differs .* label "I have another concern" .* target recommendation \(want uncover\)/)
  })

  it('flags the pair starting at sort_order 1 instead of 0', () => {
    const [a, b] = pair('obj_price')
    const msgs = messages(niche([step('obj_price')], [{ ...a, sort_order: 1 }, { ...b, sort_order: 2 }]))
    expect(msgs).toEqual([
      expect.stringMatching(/button 1 differs .* sort_order 1 \(want 0\)/),
      expect.stringMatching(/button 2 differs .* sort_order 2 \(want 1\)/),
    ])
  })

  it('flags a missing uncover button', () => {
    const [a] = pair('obj_price')
    expect(messages(niche([step('obj_price')], [a]))).toEqual([
      expect.stringMatching(/R19 missing objection button \[1\] "Another concern came up" → uncover \(objection\)/),
    ])
  })

  it('allows extra routes to another objection or a close screen after the pair', () => {
    const extras = [
      choice('obj_think', { label: 'It’s really about cost', to_step_key: 'obj_price', variant: 'objection', sort_order: 2 }),
      choice('obj_think', { label: 'Set a callback', to_step_key: 'close_callback', variant: 'caution', sort_order: 3 }),
    ]
    expect(messages(niche([step('obj_think')], [...pair('obj_think'), ...extras]))).toEqual([])
  })

  it('flags an extra route to scheduling or to a non-objection screen', () => {
    const extras = [
      choice('obj_think', { label: 'Book it', to_step_key: 'scheduling', variant: 'positive', sort_order: 2 }),
      choice('obj_think', { label: 'Back to questions', to_step_key: 'digging_in', variant: 'default', sort_order: 3 }),
    ]
    const msgs = messages(niche([step('obj_think')], [...pair('obj_think'), ...extras]))
    expect(msgs).toEqual([
      expect.stringMatching(/R19 duplicate route \[2\] "Book it" → scheduling/),
      expect.stringMatching(/R19 extra objection button \[3\] "Back to questions" → digging_in \(default\) routes somewhere other than/),
    ])
  })

  it('checks general’s buttons when a niche obj_* step has none of its own', () => {
    // general's obj_cost carries the pair, so the inherited screen passes
    expect(messages(niche([step('obj_cost')], []))).toEqual([])
    const drifted: FlowFile = { ...general, choices: [{ ...general.choices[0], label: 'Concern resolved' }, general.choices[1]] }
    const msgs = findObjectionExitDrift('t', niche([step('obj_cost')], []), drifted)
    expect(msgs).toHaveLength(1)
    expect(msgs[0].where).toBe('t:obj_cost')
  })

  it('checks a niche override of general’s buttons even when the niche does not carry the step', () => {
    const [a, b] = pair('obj_cost')
    const msgs = messages(niche([], [{ ...a, label: 'Concern resolved' }, b]))
    expect(msgs).toEqual([expect.stringMatching(/^error t:obj_cost: R19 objection button 1 differs .* label "Concern resolved"/)])
    expect(messages(niche([], pair('obj_cost')))).toEqual([])
  })

  it('leaves a step with no buttons at all to R12', () => {
    expect(messages(niche([step('obj_new')], []))).toEqual([])
  })

  it('ignores steps that are not objection screens', () => {
    expect(messages(niche([step('review')], [choice('review', { label: 'Not quite', to_step_key: 'bridge_no' })]))).toEqual([])
  })

  it('lints general.json without falling through to itself', () => {
    expect(findObjectionExitDrift(GENERAL_SLUG, general, general)).toEqual([])
  })
})

describe('R19 on the real content files', () => {
  it('every objection screen in every flow file carries the shared pair', () => {
    const generalFile = readFlowFile(GENERAL_SLUG)
    const problems = listSlugs().flatMap((slug) => findObjectionExitDrift(slug, readFlowFile(slug), generalFile))
    expect(problems.map((p) => `${p.where}: ${p.message}`)).toEqual([])
  })
})
