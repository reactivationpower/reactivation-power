import { describe, expect, it } from 'vitest'
import { listSlugs, readFlowFile, type FlowStep } from '../lib.ts'

const STEP_KEYS = ['making_it_real', 'making_it_real_nw'] as const
const AESTHETICS = [
  'acne-acne-scarring',
  'body-waxing',
  'botox',
  'cellulite-reduction',
  'chemical-peels',
  'facials-hydrafacial',
  'fillers',
  'ipl-photofacial',
  'laser-hair-removal',
  'laser-resurfacing',
  'medical-grade-skincare',
  'microneedling-rf-microneedling',
  'pigmentation-sun-damage',
  'red-light-body-contouring',
  'red-light-body-contouring.lead',
  'rosacea-redness',
  'skin-tightening',
] as const
const PARENT_MODE = ['clear-aligners', 'orthodontics-braces'] as const

function paragraphs(content: string): string[] {
  return content.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
}

function isCoaching(paragraph: string): boolean {
  return paragraph.startsWith('(') && paragraph.endsWith(')')
}

function checkAcknowledgments(step: FlowStep, where: string): void {
  const parts = paragraphs(step.content)
  const questions = parts
    .map((text, index) => ({ text, index }))
    .filter(({ text }) => !isCoaching(text) && text.endsWith('?'))

  expect(questions, `${where}: exactly three spoken questions, excluding coaching`).toHaveLength(3)
  expect(questions[0]!.text, `${where}: duration question`).toMatch(/^How long\b/i)
  expect(questions[1]!.text, `${where}: frequency question`).toMatch(/^Is it something\b/i)
  expect(questions[2]!.text, `${where}: conditional impact question`).toMatch(/\bdoes it ever interfere\b/i)

  // The optional cues must be instruction-only paragraphs immediately after
  // the corresponding spoken question, not extra lines to read to the patient.
  const q1Cue = parts[questions[0]!.index + 1]
  const q2Cue = parts[questions[1]!.index + 1]
  const q3Cue = parts[questions[2]!.index + 1]
  for (const [number, cue] of [[1, q1Cue], [2, q2Cue], [3, q3Cue]] as const) {
    expect(cue, `${where}: Q${number} coaching paragraph`).toBeDefined()
    expect(isCoaching(cue!), `${where}: Q${number} cue must be entirely parenthesized`).toBe(true)
  }
  expect(q1Cue, `${where}: optional Q1 acknowledgment`).toMatch(/\bif it fits\b[\s\S]*\bgot it\b/i)
  expect(q2Cue, `${where}: optional Q2 acknowledgment`).toMatch(/\bif it fits\b[\s\S]*\bi see\b[\s\S]*\bi understand\b/i)
  expect(q3Cue, `${where}: reflect only a stated impact`).toMatch(/\breflect only what they said\b/i)
  if (!PARENT_MODE.some((slug) => where.startsWith(`${slug}:`))) {
    expect(q3Cue, `${where}: reflection is conditional on a named impact`).toMatch(
      /\bif they name (?:an impact|an effect)\b/i,
    )
  }
  expect(q3Cue, `${where}: neutral response when there is no impact`).toMatch(
    /\bif (?:not|none|no impact)\b[\s\S]*\bgot it, thank you\b/i,
  )
  expect(step.content, `${where}: no shaming stock phrase`).not.toMatch(/\bthat is not okay\b/i)
}

describe('making-it-real optional acknowledgments', () => {
  const slugs = listSlugs()
  const authored = slugs.flatMap((slug) =>
    readFlowFile(slug).steps
      .filter((step) => STEP_KEYS.some((key) => step.step_key === key))
      .map((step) => ({ slug, step })),
  )

  it('covers every authored making_it_real and making_it_real_nw step', () => {
    expect(authored.length).toBeGreaterThan(0)
    expect(authored.some(({ step }) => step.step_key === 'making_it_real_nw')).toBe(true)
    for (const { slug, step } of authored) checkAcknowledgments(step, `${slug}:${step.step_key}`)
  })

  it.each(AESTHETICS)('%s uses conditional, optional cues for the aesthetics questions', (slug) => {
    const step = readFlowFile(slug).steps.find((s) => s.step_key === 'making_it_real')
    expect(step, `${slug}:making_it_real`).toBeDefined()
    checkAcknowledgments(step!, `${slug}:making_it_real`)
    expect(step!.content, `${slug}: Q3 must not presume an appearance impact`).toMatch(
      /\bif they name an impact\b/i,
    )
  })

  it.each(PARENT_MODE)('%s reflects the child, not the parent', (slug) => {
    const step = readFlowFile(slug).steps.find((s) => s.step_key === 'making_it_real')
    expect(step, `${slug}:making_it_real`).toBeDefined()
    checkAcknowledgments(step!, `${slug}:making_it_real`)
    expect(step!.content).toContain('{{pt_your}}')
    expect(step!.content).toMatch(/\bwith a parent, refer to their child, not the parent\b/i)
  })

  it('lead files without an override inherit general.lead acknowledgments', () => {
    const general = readFlowFile('general.lead').steps.find((s) => s.step_key === 'making_it_real')
    expect(general).toBeDefined()
    const inheriting = slugs.filter((slug) =>
      slug.endsWith('.lead') &&
      slug !== 'general.lead' &&
      !readFlowFile(slug).steps.some((s) => s.step_key === 'making_it_real'),
    )
    expect(inheriting.length).toBeGreaterThan(0)
    for (const slug of inheriting) {
      const own = readFlowFile(slug).steps.find((s) => s.step_key === 'making_it_real')
      const effective = own ?? general
      expect(effective?.content, `${slug}: falls through to general.lead`).toBe(general!.content)
      checkAcknowledgments(effective!, `${slug}:making_it_real (general.lead)`)
    }
  })
})