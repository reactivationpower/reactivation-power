import { describe, expect, it } from 'vitest'
import { CONCERN_OPTIONS } from '@workspace/niche-catalog'
import { hasParentMode, lintParentChips } from '../lint.ts'
import { GENERAL_SLUG, listSlugs, readFlowFile, type FlowFile, type FlowStep } from '../lib.ts'

const step = (step_key: string, content = 'Hello.'): FlowStep => ({
  step_key,
  title: step_key,
  content,
  sort_order: 0,
})

const nicheFile = (name: string, ...steps: FlowStep[]): FlowFile => ({
  niche: { name, sector: 'dental', is_active: true, sort_order: 0 },
  steps,
  choices: [],
})

const PARENT_NICHE = 'Clear Aligners'

/** Swap one niche's chip list for the duration of a test. */
function withChips<T>(name: string, chips: Array<{ label: string; spoken: string }>, run: () => T): T {
  const original = CONCERN_OPTIONS[name]
  CONCERN_OPTIONS[name] = chips
  try {
    return run()
  } finally {
    if (original) CONCERN_OPTIONS[name] = original
    else delete CONCERN_OPTIONS[name]
  }
}

describe('hasParentMode', () => {
  it('is derived from the flow steps, not the niche name', () => {
    expect(hasParentMode(nicheFile('Anything', step('mode_parent')))).toBe(true)
    expect(hasParentMode(nicheFile('Anything', step('mode_parent_open')))).toBe(true)
    expect(hasParentMode(nicheFile(PARENT_NICHE, step('open')))).toBe(false)
  })
})

describe('R15 parent-mode concern chips', () => {
  const parentFlow = nicheFile(PARENT_NICHE, step('open'), step('mode_parent'))

  it('passes a pronoun-free, token-free chip list', () => {
    const problems = withChips(
      PARENT_NICHE,
      [
        { label: 'Shifting / crowding', spoken: 'the shifting' },
        { label: 'Smile in photos', spoken: 'how the smile looks in photos' },
      ],
      () => lintParentChips('clear-aligners', parentFlow),
    )
    expect(problems).toEqual([])
  })

  it.each(['your smile', 'how you feel about the smile', 'the shifting yourself', 'what bothers you'])(
    'fails a spoken phrase with a second-person word: %s',
    (spoken) => {
      const problems = withChips(PARENT_NICHE, [{ label: 'Smile', spoken }], () =>
        lintParentChips('clear-aligners', parentFlow),
      )
      expect(problems).toHaveLength(1)
      expect(problems[0]!.level).toBe('error')
      expect(problems[0]!.where).toBe('clear-aligners:chip "Smile"')
      expect(problems[0]!.message).toMatch(/^R15 /)
    },
  )

  it('does not trip on words that merely contain "you"', () => {
    const problems = withChips(PARENT_NICHE, [{ label: 'Young', spoken: 'the youthful look' }], () =>
      lintParentChips('clear-aligners', parentFlow),
    )
    expect(problems).toEqual([])
  })

  it('fails a spoken phrase carrying a {{token}}', () => {
    const problems = withChips(PARENT_NICHE, [{ label: 'Smile', spoken: '{{pt_your}} smile' }], () =>
      lintParentChips('clear-aligners', parentFlow),
    )
    // "{{pt_your}} smile" has no bare second-person word, only the token.
    expect(problems).toHaveLength(1)
    expect(problems[0]!.message).toContain('{{token}}')
  })

  it('reports both problems for a phrase that has a pronoun and a token', () => {
    const problems = withChips(PARENT_NICHE, [{ label: 'Smile', spoken: 'your {{pt_smile}}' }], () =>
      lintParentChips('clear-aligners', parentFlow),
    )
    expect(problems).toHaveLength(2)
  })

  it('leaves a niche without a mode_parent step alone', () => {
    const patientOnly = nicheFile('Chiropractic', step('open'))
    const problems = withChips('Chiropractic', [{ label: 'Headaches', spoken: 'your headaches' }], () =>
      lintParentChips('chiropractic', patientOnly),
    )
    expect(problems).toEqual([])
  })

  it('applies to any niche that gains a mode_parent step, whatever its name', () => {
    const newcomer = nicheFile('Pediatric Dentistry', step('open'), step('mode_parent_intro'))
    const problems = withChips('Pediatric Dentistry', [{ label: 'Cavities', spoken: 'your cavities' }], () =>
      lintParentChips('pediatric-dentistry', newcomer),
    )
    expect(problems).toHaveLength(1)
  })

  it('ignores the general file', () => {
    const general: FlowFile = { niche: null, steps: [step('mode_parent')], choices: [] }
    expect(lintParentChips(GENERAL_SLUG, general)).toEqual([])
  })
})

describe('checked-in flows', () => {
  const parentSlugs = listSlugs().filter((slug) => slug !== GENERAL_SLUG && hasParentMode(readFlowFile(slug)))

  it('still has parent-mode flows to guard (Clear Aligners and Orthodontics)', () => {
    const names = parentSlugs.map((slug) => readFlowFile(slug).niche?.name)
    expect(names).toEqual(expect.arrayContaining(['Clear Aligners', 'Orthodontics / Braces']))
  })

  it.each(parentSlugs)('%s chips read correctly to a parent', (slug) => {
    const file = readFlowFile(slug)
    expect((CONCERN_OPTIONS[file.niche!.name] ?? []).length).toBeGreaterThan(0)
    expect(lintParentChips(slug, file)).toEqual([])
  })
})
