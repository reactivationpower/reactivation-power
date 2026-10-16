import { describe, expect, it } from 'vitest'
import { CONCERN_OPTIONS } from '@workspace/niche-catalog'
import { CHIPLESS_NICHES, lintChipCoverage, lintChipPresence } from '../lint.ts'
import { GENERAL_SLUG, listSlugs, readFlowFile, type FlowFile } from '../lib.ts'

const nicheFile = (name: string): FlowFile => ({
  niche: { name, sector: 'healthcare', is_active: true, sort_order: 0 },
  steps: [],
  choices: [],
})

const nicheFiles = listSlugs()
  .filter((s) => s !== GENERAL_SLUG)
  .map((s) => ({ slug: s, file: readFlowFile(s) }))

describe('R18 concern chips <-> flow files', () => {
  it('every checked-in niche flow has a CONCERN_OPTIONS entry under its niche name', () => {
    const missing = nicheFiles
      .flatMap(({ slug, file }) => lintChipPresence(slug, file))
      .map((p) => p.message)
    expect(missing).toEqual([])
  })

  it('every CONCERN_OPTIONS key names a checked-in flow file', () => {
    expect(lintChipCoverage(nicheFiles.map((n) => n.file)).map((p) => p.message)).toEqual([])
  })

  it('errors on a niche flow whose name has no chips', () => {
    const problems = lintChipPresence('brand-new', nicheFile('Brand New Niche'))
    expect(problems).toHaveLength(1)
    expect(problems[0].level).toBe('error')
    expect(problems[0].message).toMatch(/no CONCERN_OPTIONS entry for niche "Brand New Niche"/)
  })

  it('does not match a slug-shaped key: the join is the niche display name', () => {
    // The player looks chips up by the niche row's name, so a flow whose
    // niche block says "Joint pain" (wrong case) must fail even though
    // "Joint Pain" has chips.
    expect(lintChipPresence('joint-pain', nicheFile('Joint pain'))).toHaveLength(1)
    expect(lintChipPresence('joint-pain', nicheFile('Joint Pain'))).toEqual([])
  })

  it('skips the general file and allow-listed niches only', () => {
    expect(lintChipPresence(GENERAL_SLUG, { niche: null, steps: [], choices: [] })).toEqual([])
    for (const name of CHIPLESS_NICHES) {
      expect(lintChipPresence('allowed', nicheFile(name))).toEqual([])
    }
  })

  it('allow-list entries are real niches that truly have no chips', () => {
    const names = new Set(nicheFiles.map((n) => n.file.niche?.name))
    for (const name of CHIPLESS_NICHES) {
      expect(names.has(name), `${name} is allow-listed but has no flow file`).toBe(true)
      expect(CONCERN_OPTIONS[name], `${name} is allow-listed but has chips; drop it from CHIPLESS_NICHES`).toBeUndefined()
    }
  })

  it('warns on a chip set whose key matches no flow file', () => {
    const problems = lintChipCoverage([nicheFile('Joint Pain')])
    expect(problems.every((p) => p.level === 'warn')).toBe(true)
    expect(problems.map((p) => p.message).some((m) => m.includes('"Chiropractic"'))).toBe(true)
    expect(problems.map((p) => p.message).some((m) => m.includes('"Joint Pain"'))).toBe(false)
  })
})
