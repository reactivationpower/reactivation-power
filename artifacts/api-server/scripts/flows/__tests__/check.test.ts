import { describe, expect, it } from 'vitest'
import { checkFlows } from '../check.ts'
import { diffFlowFile, normalizeFlowFile, type FlowChoice, type FlowFile, type FlowStep } from '../lib.ts'

const step = (step_key: string, content: string, sort_order = 0, title = step_key): FlowStep => ({
  step_key,
  title,
  content,
  sort_order,
})
const choice = (
  from_step_key: string,
  to_step_key: string,
  label: string,
  sort_order = 0,
  variant: FlowChoice['variant'] = 'default',
): FlowChoice => ({ from_step_key, to_step_key, label, variant, sort_order })

const niche = (over: Partial<NonNullable<FlowFile['niche']>> = {}) => ({
  name: 'Skin Tightening',
  sector: 'healthcare' as const,
  is_active: true,
  sort_order: 3,
  ...over,
})

const base = (): FlowFile => ({
  niche: niche(),
  steps: [step('opening', 'Hi there.', 0), step('close', 'Bye.', 1)],
  choices: [
    choice('opening', 'close', 'Yes', 0, 'positive'),
    choice('opening', 'close', 'Also yes', 1),
  ],
})

const clone = (f: FlowFile): FlowFile => JSON.parse(JSON.stringify(f))
const messages = (f: FlowFile | null, d: FlowFile | null) =>
  diffFlowFile('skin-tightening', f, d).map((x) => `${x.kind}: ${x.message}`)

describe('diffFlowFile', () => {
  it('reports nothing when file and database agree, regardless of row order', () => {
    const db = clone(base())
    db.steps.reverse()
    db.choices.reverse()
    expect(diffFlowFile('skin-tightening', base(), normalizeFlowFile(db))).toEqual([])
  })

  it('catches a step whose text was edited in the database', () => {
    const db = clone(base())
    db.steps[0].content = 'Hi there, edited in the admin UI.'
    expect(messages(base(), db)).toEqual([
      'text: step opening: content differs (file 9 chars, database 33 chars)',
    ])
  })

  it('catches title and sort_order changes on a step', () => {
    const db = clone(base())
    db.steps[1].title = 'Wrap Up'
    db.steps[1].sort_order = 9
    const out = messages(base(), db)
    expect(out).toContain('text: step close: title differs (file "close", database "Wrap Up")')
    expect(out).toContain('text: step close: sort_order differs (file 1, database 9)')
  })

  it('catches steps present on only one side, in both directions', () => {
    const file = base()
    file.steps.push(step('only_in_file', 'Applied nowhere yet.', 2))
    const db = clone(base())
    db.steps.push(step('only_in_db', 'Inserted by SQL.', 2))
    const out = messages(file, db)
    expect(out).toContain('text: step only_in_file: in file, not in database')
    expect(out).toContain('text: step only_in_db: in database, not in file')
  })

  it('pairs duplicate from+to choices by sort_order like apply does', () => {
    const db = clone(base())
    db.choices[1].label = 'Also yes (reworded live)'
    expect(messages(base(), db)).toEqual([
      'text: choice opening -> close: label differs (file "Also yes", database "Also yes (reworded live)")',
    ])
  })

  it('catches choice variant and sort_order drift, and extra live buttons', () => {
    const db = clone(base())
    db.choices[0].variant = 'caution'
    db.choices.push(choice('opening', 'close', 'Third button', 2))
    db.choices.push(choice('close', 'opening', 'Start over', 0))
    const out = messages(base(), db)
    expect(out).toContain('text: choice opening -> close: variant differs (file positive, database caution)')
    expect(out).toContain('text: choice opening -> close "Third button": in database, not in file')
    expect(out).toContain('text: choice close -> opening "Start over": in database, not in file')
  })

  it('catches a file button that was never applied', () => {
    const file = base()
    file.choices.push(choice('close', 'opening', 'Start over', 0))
    expect(messages(file, base())).toEqual([
      'text: choice close -> opening "Start over": in file, not in database',
    ])
  })

  it('reports niche attributes as notes, not text drift', () => {
    const db = clone(base())
    db.niche = niche({ is_active: false, sort_order: 7 })
    expect(messages(base(), db)).toEqual([
      'meta: niche is_active: file true, database false',
      'meta: niche sort_order: file 3, database 7',
    ])
  })

  it('flags a slug that exists on only one side', () => {
    expect(messages(base(), null)).toEqual([
      'text: content/flows/skin-tightening.json exists but the database has no rows for it (run flows:apply skin-tightening, or delete the file)',
    ])
    expect(messages(null, base())).toEqual([
      'text: database has 2 step(s) and 2 choice(s) but content/flows/skin-tightening.json does not exist (run flows:export skin-tightening)',
    ])
    expect(messages(null, null)).toEqual([])
  })
})

describe('checkFlows', () => {
  it('walks the union of repo and database slugs, sorted, honouring a slug filter', () => {
    const general: FlowFile = { niche: null, steps: [step('opening', 'Hi.')], choices: [] }
    const edited = clone(general)
    edited.steps[0].content = 'Hi, edited.'
    const inRepo = new Map<string, FlowFile>([
      ['general', general],
      ['skin-tightening', base()],
    ])
    const inDatabase = new Map<string, FlowFile>([
      ['general', edited],
      ['botox', base()],
    ])
    const all = checkFlows(inRepo, inDatabase)
    expect(all.map((d) => d.slug)).toEqual(['botox', 'general', 'skin-tightening'])
    expect(checkFlows(inRepo, inDatabase, new Set(['general'])).map((d) => d.slug)).toEqual(['general'])
    expect(checkFlows(inRepo, new Map([['skin-tightening', base()], ['general', general]]))).toEqual([])
  })
})
