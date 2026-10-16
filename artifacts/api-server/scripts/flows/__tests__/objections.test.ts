import { describe, expect, it } from 'vitest'
import { OBJECTION_SHAPE_NICHES, closingLine, lintObjections } from '../lint.ts'
import { GENERAL_SLUG, generalSlugFor, listSlugs, readFlowFile, type FlowChoice, type FlowFile, type FlowStep } from '../lib.ts'

const step = (step_key: string, content: string, sort_order = 0): FlowStep => ({
  step_key,
  title: step_key,
  content,
  sort_order,
})

const choice = (from_step_key: string, to_step_key: string): FlowChoice => ({
  from_step_key,
  label: to_step_key,
  to_step_key,
  variant: 'default',
  sort_order: 0,
})

const adoptedNiche = (...steps: FlowStep[]): FlowFile => ({
  niche: { name: 'Chiropractic', sector: 'healthcare', is_active: true, sort_order: 0 },
  steps,
  choices: [],
})

const withChoices = (file: FlowFile, ...choices: FlowChoice[]): FlowFile => ({ ...file, choices })

/** A general file whose recommendation routes to every obj_* step it carries. */
const generalWith = (...steps: FlowStep[]): FlowFile => ({
  niche: null,
  steps: [step('recommendation', 'Can I make a recommendation?'), ...steps],
  choices: steps.map((s) => choice('recommendation', s.step_key)),
})

const legacyNiche = (...steps: FlowStep[]): FlowFile => ({
  // Not on OBJECTION_SHAPE_NICHES: stands in for a future niche that has not been rewritten yet.
  niche: { name: 'Legacy Test Niche', sector: 'aesthetics', is_active: true, sort_order: 0 },
  steps,
  choices: [],
})

const emptyGeneral: FlowFile = { niche: null, steps: [], choices: [] }

/** A five-beat handle with a configurable tail. */
const handle = (tail: string, question = 'Is it the cost of the visit itself, or not knowing what insurance will cover?') => `I understand, {{contact_first_name}}. That's a fair thing to bring up.

${question}

(Let them answer. Do not quote prices.)

Right now you don't know what's going on with {{main_concern}}. {{provider_name}} can tell you that in one short visit.

${tail}`

const OLD_BRUSH_OFF = `That's fair. A visit lets us see what changed.

Would you be open to that?`

const messages = (file: FlowFile, general = emptyGeneral, slug = 't') =>
  lintObjections(slug, file, general).map((p) => `${p.level} ${p.where}: ${p.message}`)

describe('R9 objection handle shape', () => {
  it('accepts a five-beat handle with its own tail', () => {
    expect(messages(adoptedNiche(step('obj_cost', handle('Would it be okay to at least get you in for the look?'))))).toEqual([])
  })

  it('flags the old three-sentence brush-off (no question, no "(Let them answer.)")', () => {
    const msgs = messages(adoptedNiche(step('obj_cost', OLD_BRUSH_OFF)))
    expect(msgs).toEqual([expect.stringMatching(/^error t:obj_cost: R9 no "\(Let them answer\.\)" note/)])
  })

  it('flags "(Let them answer.)" with nothing asked before it', () => {
    const content = `That's fair, {{contact_first_name}}.

(Let them answer.)

A visit tells you what is going on with {{main_concern}}.

Would that work?`
    const msgs = messages(adoptedNiche(step('obj_time', content)))
    expect(msgs).toEqual([expect.stringMatching(/nothing is asked before "\(Let them answer\.\)"/)])
  })

  it('counts a parent-mode question token as the isolating question', () => {
    const content = `I understand, {{contact_first_name}}. This first visit is just a look. {{pt_cost_ask}}

(Let them answer. Do not quote prices.)

Would it be okay to at least get you in for the look?`
    expect(messages(adoptedNiche(step('obj_cost', content)))).toEqual([])
  })

  it('ignores a question that only appears inside a coaching note', () => {
    const content = `That's fair, {{contact_first_name}}.

(Ask them: is it the cost or the time?)

(Let them answer.)

Would that work?`
    const msgs = messages(adoptedNiche(step('obj_time', content)))
    expect(msgs).toEqual([expect.stringMatching(/nothing is asked before/)])
  })

  it('flags an objection that ends on the recommendation close', () => {
    const msgs = messages(adoptedNiche(step('obj_spouse', handle('Does that sound reasonable?'))))
    expect(msgs).toEqual([expect.stringMatching(/ends with "Does that sound reasonable\?"/)])
  })

  it('still catches the close when a coaching note follows it', () => {
    const msgs = messages(adoptedNiche(step('obj_spouse', `${handle('Does that sound reasonable?')}\n\n(Wait for the yes.)`)))
    expect(msgs).toEqual([expect.stringMatching(/ends with "Does that sound reasonable\?"/)])
  })

  it('flags two objection screens in the same file sharing a closing line', () => {
    const msgs = messages(
      adoptedNiche(
        step('obj_cost', handle('Would that work?')),
        step('obj_time', handle('Would that work?', 'Is it mornings or afternoons that are hard?')),
      ),
    )
    expect(msgs).toEqual([expect.stringMatching(/^error t:obj_time: R9 closing line "would that work\?" is also the tail of t:obj_cost/)])
  })

  it('compares closing lines without regard to case or curly quotes', () => {
    const msgs = messages(
      adoptedNiche(
        step('obj_cost', handle("Can we pencil it in, and you'll move it later?")),
        step('obj_time', handle('can we pencil it in, and you\u2019ll move it later?', 'Is it mornings or afternoons that are hard?')),
      ),
    )
    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toMatch(/closing line/)
  })

  it('flags multiple questions before "(Let them answer.)"', () => {
    const msgs = messages(adoptedNiche(step('obj_cost', handle('Would that work?', 'Is it the cost? Or is it the insurance side?'))))
    expect(msgs).toEqual([expect.stringMatching(/R9 2 questions before "\(Let them answer\.\)"/)])
  })

  it('flags a niche screen that repeats the tail of an inherited general screen', () => {
    const general = generalWith(step('obj_taken_care_of', handle('Is there anything else on your mind?', 'How long did it hold?')))
    const msgs = messages(adoptedNiche(step('obj_cost', handle('Is there anything else on your mind?'))), general)
    expect(msgs).toEqual([
      expect.stringMatching(/^error t:obj_taken_care_of \(inherited from general\): R9 closing line "is there anything else on your mind\?" is also the tail of t:obj_cost;/),
    ])
  })

  it('lints an inherited general screen at the niche severity when the niche still routes to it', () => {
    // The niche deleted its obj_cost override; its own button still points at obj_cost, so general's old handle is back in front of the caller.
    const general = generalWith(step('obj_cost', OLD_BRUSH_OFF))
    const niche = withChoices(
      adoptedNiche(step('recommendation', 'Can I make a recommendation?')),
      choice('recommendation', 'obj_cost'),
    )
    const msgs = messages(niche, general)
    expect(msgs).toEqual([expect.stringMatching(/^error t:obj_cost \(inherited from general\): R9 no "\(Let them answer\.\)" note/)])
  })

  it('reaches an inherited general screen through general choices the niche does not shadow', () => {
    const general = generalWith(step('obj_cost', OLD_BRUSH_OFF))
    const msgs = messages(adoptedNiche(step('open', 'Hello.')), general)
    expect(msgs).toEqual([expect.stringMatching(/^error t:obj_cost \(inherited from general\)/)])
  })

  it('flags two inherited general screens that share a closing line', () => {
    const general = generalWith(
      step('obj_cost', handle('Would that work?')),
      step('obj_time', handle('Would that work?', 'Is it mornings or afternoons that are hard?')),
    )
    const msgs = messages(adoptedNiche(step('open', 'Hello.')), general)
    expect(msgs).toEqual([
      expect.stringMatching(/^error t:obj_time \(inherited from general\): R9 closing line "would that work\?" is also the tail of t:obj_cost \(inherited from general\)/),
    ])
  })

  it('does not count an overridden general screen as inherited', () => {
    const general = generalWith(step('obj_cost', 'Just a look.\n\nWould that work?'))
    expect(messages(adoptedNiche(step('obj_cost', handle('Would that work?'))), general)).toEqual([])
  })

  it('ignores a general screen the niche never routes to', () => {
    // The niche has its own recommendation buttons, so general's recommendation -> obj_taken_care_of route is shadowed.
    const general = generalWith(step('obj_taken_care_of', OLD_BRUSH_OFF))
    const niche = withChoices(
      adoptedNiche(step('recommendation', 'Can I make a recommendation?'), step('obj_cost', handle('Would that work?'))),
      choice('recommendation', 'obj_cost'),
    )
    expect(messages(niche, general)).toEqual([])
  })

  it('leaves non-objection screens alone', () => {
    expect(messages(adoptedNiche(step('recommendation', 'Can I make a recommendation? Does that sound reasonable?')))).toEqual([])
  })

  it('only warns for a niche that has not adopted the shape yet', () => {
    const msgs = messages(legacyNiche(step('obj_cost', OLD_BRUSH_OFF), step('obj_time', OLD_BRUSH_OFF)))
    expect(msgs.length).toBeGreaterThan(0)
    expect(msgs.every((m) => m.startsWith('warn '))).toBe(true)
  })

  it('only warns for general.json itself', () => {
    const general: FlowFile = { niche: null, steps: [step('obj_spouse', handle('Does that sound reasonable?'))], choices: [] }
    const msgs = messages(general, general, GENERAL_SLUG)
    expect(msgs).toEqual([expect.stringMatching(/^warn general:obj_spouse: R9 ends with/)])
  })
})

describe('closingLine', () => {
  it('returns the last spoken line, skipping trailing coaching notes', () => {
    expect(closingLine('Hello.\n\nWould that work?\n\n(Wait for the yes.)')).toBe('would that work?')
  })

  it('is empty for a note-only step', () => {
    expect(closingLine('(Tap what you hear.)')).toBe('')
  })
})

describe('R9 against the checked-in flows', () => {
  const general = readFlowFile(GENERAL_SLUG)

  it('every niche on the shape list has a flow file', () => {
    const names = new Set(listSlugs().map((s) => readFlowFile(s).niche?.name).filter(Boolean))
    for (const niche of OBJECTION_SHAPE_NICHES) expect(names, niche).toContain(niche)
  })

  it('every niche on the shape list passes with no errors', () => {
    for (const slug of listSlugs()) {
      const file = readFlowFile(slug)
      if (!file.niche || !OBJECTION_SHAPE_NICHES.has(file.niche.name)) continue
      expect(lintObjections(slug, file, readFlowFile(generalSlugFor(slug))).filter((p) => p.level === 'error'), slug).toEqual([])
    }
  })

  it('never errors on a niche that has not adopted the shape', () => {
    for (const slug of [GENERAL_SLUG, ...listSlugs()]) {
      const file = readFlowFile(slug)
      if (file.niche && OBJECTION_SHAPE_NICHES.has(file.niche.name)) continue
      expect(lintObjections(slug, file, readFlowFile(generalSlugFor(slug))).filter((p) => p.level === 'error'), slug).toEqual([])
    }
  })
})
