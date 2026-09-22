// Guards that keep `flows:apply` from silently reverting wording another
// task already put on the phones: the --steps filter and the three-way
// (file / git HEAD / database) conflict check.
import { describe, expect, it } from 'vitest'
import { filterFlowFile, findConflicts, parseStepFilter } from '../apply.ts'
import { readFlowFile, readHeadFlowFile, type FlowChoice, type FlowFile, type FlowStep } from '../lib.ts'

const step = (step_key: string, content: string, sort_order = 0): FlowStep => ({
  step_key,
  title: step_key,
  content,
  sort_order,
})

const choice = (
  from_step_key: string,
  to_step_key: string,
  label = 'Next',
  sort_order = 0,
): FlowChoice => ({
  from_step_key,
  label,
  to_step_key,
  variant: 'default',
  sort_order,
})

const file = (steps: FlowStep[], choices: FlowChoice[] = []): FlowFile => ({
  niche: { name: 'Teeth Whitening', sector: 'healthcare', is_active: true, sort_order: 1 },
  steps,
  choices,
})

const stepMap = (steps: FlowStep[]) => new Map(steps.map((s) => [s.step_key, s]))

describe('parseStepFilter', () => {
  it('returns null when no filter flag is given', () => {
    expect(parseStepFilter(['--dry-run', 'teeth-whitening'])).toBeNull()
  })

  it('accepts --steps, --only, = syntax and repeats, splitting on commas', () => {
    expect([...parseStepFilter(['--steps', 'a,b', 'x'])!]).toEqual(['a', 'b'])
    expect([...parseStepFilter(['--only', 'a', 'x'])!]).toEqual(['a'])
    expect([...parseStepFilter(['--steps=a, b', '--only=c', 'x'])!]).toEqual(['a', 'b', 'c'])
  })

  it('rejects a flag with no keys', () => {
    expect(() => parseStepFilter(['--steps'])).toThrow(/needs a comma-separated list/)
    expect(() => parseStepFilter(['--steps', '--dry-run'])).toThrow(/needs a comma-separated list/)
    expect(() => parseStepFilter(['--steps', ','])).toThrow(/no step keys/)
  })
})

describe('filterFlowFile', () => {
  it('keeps only the listed steps and the choices leaving them', () => {
    const f = file(
      [step('recommendation', 'a'), step('cadence_close', 'b'), step('comeback_close', 'c')],
      [
        choice('recommendation', 'scheduling'),
        choice('recommendation', 'obj_cost'),
        choice('cadence_close', 'scheduling'),
      ],
    )
    const out = filterFlowFile(f, new Set(['recommendation']))
    expect(out.file.steps.map((s) => s.step_key)).toEqual(['recommendation'])
    expect(out.file.choices.map((c) => c.to_step_key)).toEqual(['scheduling', 'obj_cost'])
    expect(out.skippedSteps).toEqual(['cadence_close', 'comeback_close'])
    expect(out.skippedChoices).toBe(1)
    expect(out.file.niche).toBe(f.niche)
  })
})

describe('findConflicts', () => {
  const headFile = file(
    [step('recommendation', 'old rec'), step('cadence_close', 'old cadence')],
    [choice('recommendation', 'scheduling', 'Book it')],
  )

  it('is clean when the database still matches HEAD (this branch made the change)', () => {
    const working = file(
      [step('recommendation', 'new rec'), step('cadence_close', 'old cadence')],
      [choice('recommendation', 'scheduling', 'Book it')],
    )
    const db = stepMap(headFile.steps)
    expect(findConflicts(working, headFile, db, headFile.choices)).toEqual([])
  })

  it('is clean when the database already has the file text (nothing to write)', () => {
    const working = file([step('recommendation', 'new rec'), step('cadence_close', 'old cadence')])
    const db = stepMap(working.steps)
    expect(findConflicts(working, headFile, db, [])).toEqual([])
  })

  it('flags a step whose database text matches neither the file nor HEAD', () => {
    // Another task rewrote cadence_close and applied it; this branch's JSON
    // still carries the HEAD text, so a whole-file apply would revert it.
    const working = file([step('recommendation', 'new rec'), step('cadence_close', 'old cadence')])
    const db = stepMap([step('recommendation', 'old rec'), step('cadence_close', 'NEWER cadence')])
    expect(findConflicts(working, headFile, db, [])).toEqual([
      { where: 'step cadence_close', fields: ['content'] },
    ])
  })

  it('flags the step even when this branch also edited it (true merge conflict)', () => {
    const working = file([step('recommendation', 'mine'), step('cadence_close', 'old cadence')])
    const db = stepMap([step('recommendation', 'theirs'), step('cadence_close', 'old cadence')])
    expect(findConflicts(working, headFile, db, [])).toEqual([
      { where: 'step recommendation', fields: ['content'] },
    ])
  })

  it('reports only the fields that are actually in conflict', () => {
    const working = file([step('recommendation', 'new rec', 5), step('cadence_close', 'old cadence')])
    // sort_order moved by us (db still equals HEAD's 0); content moved by someone else
    const db = stepMap([step('recommendation', 'theirs', 0), step('cadence_close', 'old cadence')])
    expect(findConflicts(working, headFile, db, [])).toEqual([
      { where: 'step recommendation', fields: ['content'] },
    ])
  })

  it('treats a step the database has but HEAD does not as a conflict', () => {
    const working = file([...headFile.steps, step('bonus', 'mine')])
    const db = stepMap([...headFile.steps, step('bonus', 'theirs')])
    expect(findConflicts(working, headFile, db, [])).toEqual([
      { where: 'step bonus', fields: ['content'] },
    ])
  })

  it('without a HEAD file (untracked), any differing row is a conflict', () => {
    const working = file([step('recommendation', 'mine')])
    const db = stepMap([step('recommendation', 'theirs')])
    expect(findConflicts(working, null, db, [])).toEqual([
      { where: 'step recommendation', fields: ['content'] },
    ])
  })

  it('ignores inserts (step not in the database yet)', () => {
    const working = file([step('recommendation', 'old rec'), step('brand_new', 'x')])
    const db = stepMap([step('recommendation', 'old rec')])
    expect(findConflicts(working, headFile, db, [])).toEqual([])
  })

  it('checks choice labels the same way, pairing duplicates by sort_order', () => {
    const working = file(headFile.steps, [
      choice('recommendation', 'scheduling', 'Book it', 0),
      choice('recommendation', 'scheduling', 'Yes, book it', 1),
    ])
    const head = file(headFile.steps, [
      choice('recommendation', 'scheduling', 'Book it', 0),
      choice('recommendation', 'scheduling', 'Book it too', 1),
    ])
    // first button: someone else relabelled it; second: only we changed it
    const db = [
      choice('recommendation', 'scheduling', 'Someone else', 0),
      choice('recommendation', 'scheduling', 'Book it too', 1),
    ]
    expect(findConflicts(working, head, stepMap(headFile.steps), db)).toEqual([
      { where: 'choice recommendation -> scheduling', fields: ['label'] },
    ])
  })
})

describe('readHeadFlowFile', () => {
  it('reads the committed copy of a tracked flow file', () => {
    const head = readHeadFlowFile('general')
    expect(head).not.toBeNull()
    expect(head!.steps.length).toBeGreaterThan(0)
    // the working tree should share at least the step keys with HEAD
    const working = readFlowFile('general')
    const headKeys = new Set(head!.steps.map((s) => s.step_key))
    expect(working.steps.some((s) => headKeys.has(s.step_key))).toBe(true)
  })

  it('returns null for a file git has never seen', () => {
    expect(readHeadFlowFile('no-such-niche-ever')).toBeNull()
  })
})
