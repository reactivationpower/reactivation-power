import { describe, expect, it } from 'vitest'
import { listSlugs, readFlowFile, type FlowChoice, type FlowFile, type FlowStep } from '../lib.ts'

/**
 * The "why did you stop coming?" screen (`lapsed_commitment`) fans out to five
 * reason screens. Pain/body niches use `lapsed_wait_pain` for the fourth
 * reason; facial-aesthetics niches use `lapsed_wait`. Every reason screen must
 * offer a way to scheduling and a way back to the reason picker.
 */
const COMMITMENT = 'lapsed_commitment'
const SCHEDULING = 'scheduling'
const FIXED_REASONS = ['lapsed_felt_fine', 'lapsed_cost', 'lapsed_busy', 'lapsed_moved'] as const
const WAIT_VARIANTS = ['lapsed_wait_pain', 'lapsed_wait'] as const

/** Files whose only lapsed_* step is the commitment screen (no reason buttons). */
function hasReasonScreens(file: FlowFile): boolean {
  return file.steps.some((s) => s.step_key.startsWith('lapsed_') && s.step_key !== COMMITMENT)
}

export function findLapsedReasonProblems(slug: string, file: FlowFile): string[] {
  const problems: string[] = []
  const stepKeys = new Set(file.steps.map((s) => s.step_key))
  const targetsFrom = (from: string) =>
    new Set(file.choices.filter((c) => c.from_step_key === from).map((c) => c.to_step_key))

  if (!stepKeys.has(COMMITMENT)) problems.push(`${slug}: missing step ${COMMITMENT}`)

  const waitPresent = WAIT_VARIANTS.filter((k) => stepKeys.has(k))
  if (waitPresent.length !== 1) {
    problems.push(
      `${slug}: expected exactly one of ${WAIT_VARIANTS.join(' / ')}, found [${waitPresent.join(', ')}]`,
    )
  }
  const expected = [...FIXED_REASONS, ...(waitPresent.length === 1 ? waitPresent : [])]

  for (const key of FIXED_REASONS) {
    if (!stepKeys.has(key)) problems.push(`${slug}: missing step ${key}`)
  }

  const extra = [...stepKeys].filter(
    (k) => k.startsWith('lapsed_') && k !== COMMITMENT && !expected.includes(k),
  )
  for (const k of extra) problems.push(`${slug}: unexpected lapsed_* step ${k}`)

  const fromCommitment = targetsFrom(COMMITMENT)
  for (const key of expected) {
    if (!fromCommitment.has(key)) problems.push(`${slug}: ${COMMITMENT} has no button to ${key}`)
  }

  for (const key of expected) {
    if (!stepKeys.has(key)) continue
    const targets = targetsFrom(key)
    if (!targets.has(SCHEDULING)) problems.push(`${slug}: ${key} has no button to ${SCHEDULING}`)
    if (!targets.has(COMMITMENT)) problems.push(`${slug}: ${key} has no button back to ${COMMITMENT}`)
  }

  return problems
}

const step = (step_key: string): FlowStep => ({ step_key, title: step_key, content: 'Hi.', sort_order: 0 })
const choice = (from_step_key: string, to_step_key: string): FlowChoice => ({
  from_step_key,
  label: 'Next',
  to_step_key,
  variant: 'default',
  sort_order: 0,
})

function goodFile(wait: (typeof WAIT_VARIANTS)[number] = 'lapsed_wait_pain'): FlowFile {
  const reasons = [...FIXED_REASONS, wait]
  return {
    niche: { name: 'Test', sector: 'healthcare', is_active: true, sort_order: 0 },
    steps: [step(COMMITMENT), ...reasons.map(step)],
    choices: [
      choice(COMMITMENT, SCHEDULING),
      ...reasons.map((r) => choice(COMMITMENT, r)),
      ...reasons.flatMap((r) => [choice(r, SCHEDULING), choice(r, COMMITMENT)]),
    ],
  }
}

describe('findLapsedReasonProblems', () => {
  it('accepts a complete pain-family set', () => {
    expect(findLapsedReasonProblems('t', goodFile('lapsed_wait_pain'))).toEqual([])
  })

  it('accepts a complete aesthetics-family set', () => {
    expect(findLapsedReasonProblems('t', goodFile('lapsed_wait'))).toEqual([])
  })

  it('flags a removed reason step', () => {
    const file = goodFile()
    file.steps = file.steps.filter((s) => s.step_key !== 'lapsed_cost')
    const problems = findLapsedReasonProblems('t', file)
    expect(problems).toContain('t: missing step lapsed_cost')
  })

  it('flags a removed reason button on the commitment screen', () => {
    const file = goodFile()
    file.choices = file.choices.filter(
      (c) => !(c.from_step_key === COMMITMENT && c.to_step_key === 'lapsed_busy'),
    )
    expect(findLapsedReasonProblems('t', file)).toEqual([
      't: lapsed_commitment has no button to lapsed_busy',
    ])
  })

  it('flags a reason screen that lost its way to scheduling or back', () => {
    const file = goodFile()
    file.choices = file.choices.filter((c) => c.from_step_key !== 'lapsed_moved')
    expect(findLapsedReasonProblems('t', file)).toEqual([
      't: lapsed_moved has no button to scheduling',
      't: lapsed_moved has no button back to lapsed_commitment',
    ])
  })

  it('flags a missing or doubled wait variant', () => {
    const none = goodFile()
    none.steps = none.steps.filter((s) => s.step_key !== 'lapsed_wait_pain')
    expect(findLapsedReasonProblems('t', none).join('\n')).toMatch(/expected exactly one of/)

    const both = goodFile()
    both.steps.push(step('lapsed_wait'))
    expect(findLapsedReasonProblems('t', both).join('\n')).toMatch(/expected exactly one of/)
  })

  it('flags a stray lapsed_* step that is not one of the five reasons', () => {
    const file = goodFile()
    file.steps.push(step('lapsed_other'))
    expect(findLapsedReasonProblems('t', file)).toEqual(['t: unexpected lapsed_* step lapsed_other'])
  })
})

describe('content/flows lapsed reason screens', () => {
  const withReasons = listSlugs().filter((slug) => hasReasonScreens(readFlowFile(slug)))

  it('covers the niches that were hand-routed', () => {
    for (const slug of ['gut-health', 'skin-tightening', 'red-light-body-contouring', 'cellulite-reduction']) {
      expect(withReasons, slug).toContain(slug)
    }
  })

  it('keeps all five reason buttons and their exits in every script that has them', () => {
    const problems = withReasons.flatMap((slug) => findLapsedReasonProblems(slug, readFlowFile(slug)))
    expect(problems).toEqual([])
  })
})
