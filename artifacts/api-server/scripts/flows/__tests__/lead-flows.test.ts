// The lead script family: files keyed by the `.lead` suffix, the lead-aware
// Rule 5, and the shape the chiropractic lead script promised.
import { describe, expect, it } from 'vitest'
import { LEAD_CLAIM_PHRASES, lintFile } from '../lint.ts'
import {
  flowKindOf,
  generalSlugFor,
  isGeneralSlug,
  listSlugs,
  readFlowFile,
  slugFor,
  type FlowFile,
  type FlowStep,
} from '../lib.ts'

const step = (step_key: string, content: string, sort_order = 0): FlowStep => ({ step_key, title: step_key, content, sort_order })
const niche = (...steps: FlowStep[]): FlowFile => ({
  niche: { name: 'Chiropractic', sector: 'healthcare', is_active: true, sort_order: 1 },
  steps,
  choices: [],
})

describe('flow families', () => {
  it('tells the two families apart by slug', () => {
    expect(flowKindOf('chiropractic')).toBe('reactivation')
    expect(flowKindOf('chiropractic.lead')).toBe('lead')
    expect(slugFor('chiropractic', 'lead')).toBe('chiropractic.lead')
    expect(generalSlugFor('chiropractic.lead')).toBe('general.lead')
    expect(generalSlugFor('chiropractic')).toBe('general')
    expect(isGeneralSlug('general.lead')).toBe(true)
    expect(isGeneralSlug('chiropractic.lead')).toBe(false)
  })

  it('ships a general lead flow and the chiropractic lead flow', () => {
    const slugs = listSlugs()
    expect(slugs).toContain('chiropractic.lead')
    expect(slugs).toContain('chiropractic')
    const general = readFlowFile('general.lead')
    const keys = new Set(general.steps.map((s) => s.step_key))
    for (const k of ['open', 'resp_dont_remember', 'why_not_booked', 'reason_no_callback', 'reason_busy', 'reason_cost', 'reason_deciding', 'close_booked_elsewhere', 'making_it_real', 'review', 'recommendation', 'obj_cost', 'scheduling']) {
      expect(keys.has(k), k).toBe(true)
    }
    expect([...keys].some((k) => k.startsWith('lapsed_'))).toBe(false)
    expect(keys.has('doing_great')).toBe(false)
  })

  it('anchors the Open on the form and pre-loads the price into the cost objection', () => {
    const general = readFlowFile('general.lead')
    const chiro = readFlowFile('chiropractic.lead')
    const openText = (chiro.steps.find((s) => s.step_key === 'open') ?? general.steps.find((s) => s.step_key === 'open'))!.content
    expect(openText).toMatch(/\{\{offer_name\}\}/)
    expect(openText).toMatch(/You submitted a form\{\{submission_timing\}\}/)
    expect(openText).toMatch(/\{\{preference_note\}\}/)
    const cost = (chiro.steps.find((s) => s.step_key === 'obj_cost') ?? general.steps.find((s) => s.step_key === 'obj_cost'))!.content
    expect(cost).toMatch(/\{\{price_line\}\}/)
  })
})

describe('R5 for lead flows', () => {
  const general = readFlowFile('general.lead')

  it('rejects a chart or past-visit claim in a lead flow', () => {
    for (const phrase of ['your notes say', 'last time you were in']) {
      const file = niche(step('open', `Hi {{contact_first_name}}, ${phrase} you had back pain.`))
      const problems = lintFile('chiropractic.lead', file, general).filter((p) => p.message.includes('R5'))
      expect(problems.length, phrase).toBeGreaterThan(0)
      expect(problems[0].message).toMatch(/lead/)
    }
  })

  it('keeps every lead claim phrase out of the checked-in lead flows', () => {
    for (const slug of ['general.lead', ...listSlugs().filter((s) => flowKindOf(s) === 'lead')]) {
      const file = readFlowFile(slug)
      for (const s of file.steps) {
        const lower = s.content.toLowerCase()
        for (const phrase of LEAD_CLAIM_PHRASES) {
          expect(lower.includes(phrase), `${slug}:${s.step_key} "${phrase}"`).toBe(false)
        }
      }
    }
  })
})
