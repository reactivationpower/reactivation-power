import { describe, expect, it } from 'vitest'
import { lintReadBack } from '../lint.ts'
import { GENERAL_SLUG, listSlugs, readFlowFile, type FlowFile, type FlowStep } from '../lib.ts'

const step = (step_key: string, content: string, sort_order = 0): FlowStep => ({
  step_key,
  title: step_key,
  content,
  sort_order,
})

const flow = (...steps: FlowStep[]): FlowFile => ({ niche: null, steps, choices: [] })

const REVIEW = `{{contact_first_name}}, let me make sure I have this right.

(Read back their three answers.)

So it's been on your mind a while. Did I get that right?

It sounds like you'd like to feel good about it again. Is that fair to say?

(Tap what you hear.)`

const BRIDGE_REC = `{{contact_first_name}}, that's worth getting looked at instead of just dealing with it. Can I make a recommendation?

(Wait for the yes.)

Let's get you in so {{provider_name}} can take a look. Does that sound reasonable?

(Tap what you hear.)`

const EXPLAINER_REC = `{{contact_first_name}}, that's worth getting looked at. A quick check shows us where things stand. Does that make sense?

(Wait for the yes.)

{{contact_first_name}}, can I make a recommendation?

(Wait for the yes.)

Let's get you in for that quick check. Does that sound reasonable?

(Tap what you hear.)`

const errors = (file: FlowFile) => lintReadBack('t', file).filter((p) => p.level === 'error').map((p) => p.message)

describe('R11 read-back lives on review only', () => {
  it('accepts the standard review + bridge recommendation', () => {
    expect(errors(flow(step('review', REVIEW), step('recommendation', BRIDGE_REC)))).toEqual([])
  })

  it('accepts the explainer shape that asks permission in paragraph two', () => {
    expect(errors(flow(step('review', REVIEW), step('recommendation', EXPLAINER_REC)))).toEqual([])
    expect(errors(flow(step('recommendation_weight_focus', EXPLAINER_REC)))).toEqual([])
  })

  it('flags a review screen without the read-back', () => {
    const msgs = errors(flow(step('review', 'So it bothers you. Is that fair to say?')))
    expect(msgs).toHaveLength(2)
    expect(msgs[0]).toMatch(/no read-back opener/)
    expect(msgs[1]).toMatch(/never asks "Did I get that right\?"/)
  })

  it('flags a recommendation that repeats the read-back', () => {
    const rec = `{{contact_first_name}}, let me make sure I have this right. You said it bothers you. Did I get that right?

Can I make a recommendation?

Let's get you in. Does that sound reasonable?`
    const msgs = errors(flow(step('recommendation', rec)))
    expect(msgs.some((m) => /read-back opener .* outside the review screen/.test(m))).toBe(true)
    expect(msgs.some((m) => /"Did I get that right\?" outside the review screen/.test(m))).toBe(true)
  })

  it('flags the read-back on any other screen too', () => {
    const msgs = errors(flow(step('making_it_real', 'Let me make sure I have this right. How long has it been?')))
    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toMatch(/outside the review screen/)
  })

  it('treats curly apostrophes the same as straight ones', () => {
    const msgs = errors(flow(step('obj_cost', 'So if I\u2019ve got this right, it\u2019s the price. Let me make sure I\u2019ve heard you right.')))
    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toMatch(/let me make sure i've heard you right/)
  })

  it('flags a recommendation that never asks permission', () => {
    const msgs = errors(flow(step('recommendation', "Let's get you in. Does that sound reasonable?")))
    expect(msgs).toEqual([expect.stringMatching(/never asks "Can I make a recommendation\?"/)])
  })

  it('flags a recommendation that recommends first and asks permission after', () => {
    const rec = `{{contact_first_name}}, let's get you in so we can take a look. Does that sound reasonable?

(Wait for the yes.)

Can I make a recommendation?`
    const msgs = errors(flow(step('recommendation', rec)))
    expect(msgs.some((m) => /is in paragraph 2/.test(m))).toBe(true)
    expect(msgs.some((m) => /before asking "Can I make a recommendation\?"/.test(m))).toBe(true)
  })

  it('flags a late ask when paragraph one is not an explainer', () => {
    const rec = `{{contact_first_name}}, that's worth getting looked at.

Can I make a recommendation?

Let's get you in. Does that sound reasonable?`
    const msgs = errors(flow(step('recommendation', rec)))
    expect(msgs).toEqual([expect.stringMatching(/is in paragraph 2/)])
  })

  it('flags an ask buried in paragraph three even after an explainer', () => {
    const rec = `A quick check shows us where things stand. Does that make sense?

(Wait for the yes.)

And it only takes a few minutes.

Can I make a recommendation?

Let's get you in. Does that sound reasonable?`
    const msgs = errors(flow(step('recommendation', rec)))
    expect(msgs).toEqual([expect.stringMatching(/is in paragraph 3/)])
  })

  it('ignores the ask when it only appears inside a coaching note', () => {
    const rec = `{{contact_first_name}}, let's get you in. Does that sound reasonable?

(Ask "can I make a recommendation?" first.)`
    expect(errors(flow(step('recommendation', rec)))).toEqual([expect.stringMatching(/never asks/)])
  })

  it('passes every checked-in flow', () => {
    for (const slug of [GENERAL_SLUG, ...listSlugs()]) {
      expect(errors(readFlowFile(slug)), slug).toEqual([])
    }
  })
})

describe('R11 permission comes before the recommendation itself', () => {
  it('flags recommending in the same paragraph before the ask', () => {
    const rec = `{{contact_first_name}}, let's get you in so we can take a look. Can I make a recommendation?

(Wait for the yes.)

Does that sound reasonable?`
    const msgs = errors(flow(step('recommendation', rec)))
    expect(msgs).toEqual([expect.stringMatching(/recommends before asking/)])
  })

  it('flags talking past the ask without waiting for the yes', () => {
    const rec = `{{contact_first_name}}, that's worth a look. Can I make a recommendation? Let's get you in. Does that sound reasonable?`
    const msgs = errors(flow(step('recommendation', rec)))
    expect(msgs).toEqual([expect.stringMatching(/keeps talking after/)])
  })

  it('flags an explainer whose paragraph-two ask is not on its own', () => {
    const rec = `A quick check shows us where things stand. Does that make sense?

(Wait for the yes.)

It only takes a few minutes, so can I make a recommendation?

Let's get you in. Does that sound reasonable?`
    const msgs = errors(flow(step('recommendation', rec)))
    expect(msgs).toEqual([expect.stringMatching(/ask on its own in paragraph two/)])
  })

  it('accepts the name before the ask in the explainer shape', () => {
    expect(errors(flow(step('recommendation', EXPLAINER_REC)))).toEqual([])
  })
})
