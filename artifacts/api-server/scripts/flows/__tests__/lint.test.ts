import { describe, expect, it } from 'vitest'
import { lintPermission, lintReadBack } from '../lint.ts'
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

const permErrors = (file: FlowFile) =>
  lintPermission('t', file).filter((p) => p.level === 'error').map((p) => p.message)

const route = (from_step_key: string, to_step_key: string | null) => ({
  from_step_key,
  label: `${from_step_key} → ${to_step_key}`,
  to_step_key,
  variant: 'default',
  sort_order: 0,
})

describe('R13 permission screens ask permission', () => {
  it('accepts the usual transition and permission_questions openers', () => {
    const file: FlowFile = {
      niche: null,
      choices: [],
      steps: [
        step('transition', `That's why I'm glad we connected. Let me ask you a few quick questions. Is that okay?\n\n(Wait for the yes.)`),
        step('transition_still', `First, can I ask a few quick questions so your file is up to date?`),
        step('permission_questions', `While I have you, {{contact_first_name}}, can I ask you a few quick questions about anything else you've noticed?`),
      ],
    }
    expect(permErrors(file)).toEqual([])
  })

  it('flags a transition that goes straight into the questions', () => {
    const msgs = permErrors(flow(step('transition', `Great. Let's run through a few things so I can update your file.`)))
    expect(msgs).toEqual([expect.stringMatching(/is a permission screen but never asks permission/)])
  })

  it('flags a permission_questions variant with a statement instead of a question', () => {
    const msgs = permErrors(flow(step('permission_questions_back', `I'm going to ask you a few quick questions now.`)))
    expect(msgs).toEqual([expect.stringMatching(/never asks permission/)])
  })

  it('flags any step that routes to digging_in without asking first', () => {
    const file: FlowFile = {
      niche: null,
      steps: [step('doing_well_variant', `Glad you're doing well. Let's go through a few things.`), step('digging_in', `How long has it been? ...`)],
      choices: [route('doing_well_variant', 'digging_in')],
    }
    expect(permErrors(file)).toEqual([expect.stringMatching(/routes to digging_in but never asks permission/)])
  })

  it('does not count an opener that is not a question', () => {
    const msgs = permErrors(flow(step('transition', `Can I ask you a few quick questions. Great, first one.`)))
    expect(msgs).toEqual([expect.stringMatching(/never asks permission/)])
  })

  it('ignores an ask that only lives in a coaching note', () => {
    const msgs = permErrors(flow(step('transition', `Let's go through a few things.\n\n(Ask "can I ask you a few questions?" first.)`)))
    expect(msgs).toEqual([expect.stringMatching(/never asks permission/)])
  })

  it('treats curly apostrophes the same as straight ones', () => {
    expect(permErrors(flow(step('transition', `While I have you, can I ask about a few things you\u2019ve noticed?`)))).toEqual([])
  })
})

describe('R13 "Does that sound reasonable?" only after a permission ask', () => {
  it('accepts an objection screen that asks before it recommends', () => {
    const obj = `That makes sense. Can I share a thought?

(Wait for the yes.)

Most people come in for the look first. Does that sound reasonable?`
    expect(permErrors(flow(step('obj_spouse', obj)))).toEqual([])
  })

  it('accepts the lapsed screens that ask "Can I make a recommendation?" mid-screen', () => {
    const lapsed = `Can I ask what changed that led you to stop coming in?

(Let them answer.)

{{contact_first_name}}, can I make a recommendation?

(Wait for the yes.)

Let's get you back in. Does that sound reasonable?`
    expect(permErrors(flow(step('lapsed_busy', lapsed)))).toEqual([])
  })

  it('flags a screen that closes with "Does that sound reasonable?" and never asked', () => {
    const obj = `That makes sense. Most people come in for the look first.\n\nDoes that sound reasonable?\n\n(Wait for the yes.)`
    expect(permErrors(flow(step('obj_spouse', obj)))).toEqual([expect.stringMatching(/without ever asking permission first/)])
  })

  it('flags the ask landing after "Does that sound reasonable?"', () => {
    const obj = `Come in for the look first. Does that sound reasonable?\n\nCan I share why I ask?`
    expect(permErrors(flow(step('obj_spouse', obj)))).toEqual([expect.stringMatching(/before asking permission/)])
  })

  it('passes every checked-in flow', () => {
    for (const slug of [GENERAL_SLUG, ...listSlugs()]) {
      expect(permErrors(readFlowFile(slug)), slug).toEqual([])
    }
  })
})
