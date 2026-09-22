import { describe, expect, it } from 'vitest'
import { impactBuckets, lintMakingItReal, lintPermission, lintReadBack, lintReviewBuckets } from '../lint.ts'
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

const mirErrors = (file: FlowFile) =>
  lintMakingItReal('t', file).filter((p) => p.level === 'error').map((p) => p.message)

const MAKING_IT_REAL = `{{contact_first_name}}, I'd like to ask a few quick questions about {{main_concern}} so your file is up to date.

(Ask these three questions in order. Pause after each.)

How long has it been bothering you, like a week or two, or longer than that?

(Let them answer.)

Is it something you experience like 1 to 2 times a month, or is it more often than that?

(Let them answer.)

When it's at its worst, does it ever interfere with work, at home, or relaxing and doing your own thing?

(Let them answer. Repeat back whatever they name.)

Thank you for sharing that.`

const PRE_REWRITE = `{{contact_first_name}}, I'd like to ask about {{main_concern}}.

How long has that been bothering you?

(Let them answer.)

How often do you notice it?

(Let them answer.)

When it bothers you, how does it affect your day or the things you enjoy?

(Let them answer. Repeat it back: "That's a long time.")`

describe('R14 Making It Real keeps the three-question shape', () => {
  it('accepts the shared shape', () => {
    expect(mirErrors(flow(step('making_it_real', MAKING_IT_REAL)))).toEqual([])
  })

  it('accepts the niche variants of each scale and a parent-mode token', () => {
    const aesthetics = MAKING_IT_REAL.replace('like a week or two, or longer than that?', 'like a few weeks, or more like months?')
      .replace('like 1 to 2 times a month, or is it more often than that?', 'now and then, or every time you look in the mirror?')
    expect(mirErrors(flow(step('making_it_real', aesthetics)))).toEqual([])
    const home = MAKING_IT_REAL.replace('How long has it been bothering you, like a week or two, or longer than that?', 'How long has that been going on, like a couple weeks, or since last season?')
      .replace('Is it something you experience like 1 to 2 times a month, or is it more often than that?', 'Is it something you notice like a few days a month, or is it most days?')
    expect(mirErrors(flow(step('making_it_real', home)))).toEqual([])
    const parent = MAKING_IT_REAL.replace('How long has it been bothering you', 'How long has it been on {{pt_your}} mind')
    expect(mirErrors(flow(step('making_it_real_nw', parent)))).toEqual([])
  })

  it('ignores steps outside the making_it_real family', () => {
    expect(mirErrors(flow(step('digging_in', PRE_REWRITE), step('review', 'How long has that been bothering you?')))).toEqual([])
  })

  it('fails the pre-rewrite bare questions', () => {
    const msgs = mirErrors(flow(step('making_it_real', PRE_REWRITE)))
    expect(msgs).toHaveLength(3)
    expect(msgs[0]).toMatch(/first question needs a low anchor/)
    expect(msgs[1]).toMatch(/second question needs a low number/)
    expect(msgs[2]).toMatch(/third question must start with "When it's at its worst"/)
  })

  it('flags the wrong number of questions', () => {
    const two = MAKING_IT_REAL.replace(/Is it something you experience[^\n]*\n\n\(Let them answer\.\)\n\n/, '')
    expect(mirErrors(flow(step('making_it_real', two)))).toEqual([expect.stringMatching(/has 2 spoken question\(s\); Making It Real asks exactly three/)])
    const four = MAKING_IT_REAL.replace('Thank you for sharing that.', 'Anything else you noticed?')
    expect(mirErrors(flow(step('making_it_real', four)))).toEqual([expect.stringMatching(/has 4 spoken question/)])
  })

  it('flags the questions arriving out of order', () => {
    const swapped = MAKING_IT_REAL.replace('How long has it been bothering you, like a week or two, or longer than that?', 'WORST')
      .replace("When it's at its worst, does it ever interfere with work, at home, or relaxing and doing your own thing?", 'How long has it been bothering you, like a week or two, or longer than that?')
      .replace('WORST', "When it's at its worst, does it ever interfere with work, at home, or relaxing and doing your own thing?")
    const msgs = mirErrors(flow(step('making_it_real', swapped)))
    expect(msgs).toEqual([expect.stringMatching(/first question needs a low anchor/), expect.stringMatching(/third question must start with/)])
  })

  it('flags a question that keeps talking after the "?"', () => {
    const tail = MAKING_IT_REAL.replace('or longer than that?', 'or longer than that? That is a long time.')
    expect(mirErrors(flow(step('making_it_real', tail)))).toEqual([expect.stringMatching(/does not end in "\?"/)])
  })

  it('flags a question with no coaching note after it', () => {
    const noNote = MAKING_IT_REAL.replace('or is it more often than that?\n\n(Let them answer.)', 'or is it more often than that?')
    expect(mirErrors(flow(step('making_it_real', noNote)))).toEqual([expect.stringMatching(/question 2 is not followed by a coaching note/)])
    const noLast = MAKING_IT_REAL.replace('\n\n(Let them answer. Repeat back whatever they name.)\n\nThank you for sharing that.', '')
    expect(mirErrors(flow(step('making_it_real', noLast)))).toEqual([expect.stringMatching(/question 3 is not followed by a coaching note/)])
  })

  it('does not count a question inside a coaching note', () => {
    const noted = MAKING_IT_REAL.replace('(Let them answer.)', '(Let them answer. If they hedge, ask "would you say longer?")')
    expect(mirErrors(flow(step('making_it_real', noted)))).toEqual([])
  })

  it('treats curly apostrophes the same as straight ones', () => {
    const curly = MAKING_IT_REAL.replace("When it's at its worst", 'When it\u2019s at its worst')
    expect(mirErrors(flow(step('making_it_real', curly)))).toEqual([])
  })

  it('passes every checked-in flow', () => {
    for (const slug of [GENERAL_SLUG, ...listSlugs()]) {
      expect(mirErrors(readFlowFile(slug)), slug).toEqual([])
    }
  })
})

describe('R16 review reads back the Making It Real buckets', () => {
  const AESTHETICS_MIR = MAKING_IT_REAL.replace(
    'interfere with work, at home, or relaxing and doing your own thing?',
    'interfere with photos, going out, or feeling put together?',
  )
  const GENERAL_REVIEW = `{{contact_first_name}}, let me make sure I have this right.

(Read back their three answers: how long, how often, what it gets in the way of.)

So it's been going on a while. At its worst it gets in the way of what you mentioned. Did I get that right?

(Say what they named: work, home, or your own time. Let them answer.)

Is that fair to say?`
  const AESTHETICS_REVIEW = GENERAL_REVIEW.replace('work, home, or your own time', 'photos, going out, or feeling put together')
  const general: FlowFile = flow(step('making_it_real', MAKING_IT_REAL), step('review', GENERAL_REVIEW))
  const niche = (...steps: FlowStep[]): FlowFile => ({ niche: { name: 'Botox' } as FlowFile['niche'], steps, choices: [] })
  const bucketErrors = (file: FlowFile, gen: FlowFile = general) =>
    lintReviewBuckets('t', file, gen).filter((p) => p.level === 'error').map((p) => p.message)

  it('reads the buckets off the third question', () => {
    expect(impactBuckets(MAKING_IT_REAL)).toEqual(['work', 'at home', 'relaxing and doing your own thing'])
    expect(impactBuckets(AESTHETICS_MIR)).toEqual(['photos', 'going out', 'feeling put together'])
    expect(impactBuckets(PRE_REWRITE)).toBeNull()
  })

  it("accepts general's review against general's own short forms", () => {
    expect(lintReviewBuckets(GENERAL_SLUG, general, general)).toEqual([])
  })

  it('accepts a niche whose review names its own buckets', () => {
    expect(bucketErrors(niche(step('making_it_real', AESTHETICS_MIR), step('review', AESTHETICS_REVIEW)))).toEqual([])
  })

  it('fails a review that reads back "work or home" for an aesthetics niche', () => {
    const drifted = GENERAL_REVIEW.replace('work, home, or your own time', 'work or home')
    const msgs = bucketErrors(niche(step('making_it_real', AESTHETICS_MIR), step('review', drifted)))
    expect(msgs).toEqual([
      expect.stringMatching(/R16 review never names "photos"/),
      expect.stringMatching(/R16 review never names "going out"/),
      expect.stringMatching(/R16 review never names "feeling put together"/),
    ])
  })

  it("fails an aesthetics niche that inherits general's review", () => {
    const problems = lintReviewBuckets('botox', niche(step('making_it_real', AESTHETICS_MIR)), general)
    expect(problems).toHaveLength(3)
    expect(problems[0].where).toBe('botox:review (inherited from general)')
    expect(problems[0].message).toMatch(/never names "photos" from botox:making_it_real's third question/)
  })

  it("checks a niche review against general's Making It Real when the niche has none", () => {
    expect(bucketErrors(niche(step('review', GENERAL_REVIEW)))).toEqual([])
    const msgs = bucketErrors(niche(step('review', AESTHETICS_REVIEW)))
    expect(msgs).toEqual([
      expect.stringMatching(/never names "work" from t:making_it_real \(inherited from general\)/),
      expect.stringMatching(/never names "at home"/),
      expect.stringMatching(/never names "relaxing and doing your own thing"/),
    ])
  })

  it('checks every making_it_real variant against the review', () => {
    const msgs = bucketErrors(niche(step('making_it_real', MAKING_IT_REAL), step('making_it_real_nw', AESTHETICS_MIR), step('review', GENERAL_REVIEW)))
    expect(msgs).toHaveLength(3)
    expect(msgs[0]).toMatch(/from t:making_it_real_nw's third question/)
  })

  it('accepts a parent-mode bucket read back with the same token', () => {
    const parent = MAKING_IT_REAL.replace(
      'interfere with work, at home, or relaxing and doing your own thing?',
      'interfere with photos, smiling around people, or {{pt_your}} confidence?',
    )
    const review = GENERAL_REVIEW.replace('work, home, or your own time', 'photos, smiling around people, or {{pt_your}} confidence')
    expect(bucketErrors(niche(step('making_it_real', parent), step('review', review)))).toEqual([])
  })

  it('leaves the shape of the third question to R14', () => {
    expect(bucketErrors(niche(step('making_it_real', PRE_REWRITE), step('review', GENERAL_REVIEW)))).toEqual([])
  })

  it('passes every checked-in flow', () => {
    const gen = readFlowFile(GENERAL_SLUG)
    for (const slug of [GENERAL_SLUG, ...listSlugs()]) {
      expect(bucketErrors(readFlowFile(slug), gen), slug).toEqual([])
    }
  })
})
