import { describe, expect, it } from 'vitest'
import { readFlowFile } from '../lib.ts'

const INTRO =
  "{{contact_first_name}}, I'm going to run through a few things people often notice. Just say yes if you get them at all, even if they're mild or come and go."

const SKIN_CONCERNS_INTRO =
  "{{contact_first_name}}, I'm going to run through a few skin concerns people often notice. Just let me know which ones apply to you, even if they're mild or come and go."
const CHANGES_INTRO =
  "{{contact_first_name}}, I'm going to run through a few changes people often notice. Just let me know which ones apply to you, even if they're subtle."
const SKINCARE_INTRO =
  "{{contact_first_name}}, I'm going to ask about your skin and your current routine. Just let me know what applies to you."
const HAIR_REMOVAL_INTRO =
  "{{contact_first_name}}, I'm going to ask about a few areas and any trouble with regrowth or irritation. Just let me know what applies to you."
const WAXING_INTRO =
  "{{contact_first_name}}, I'm going to ask about a few areas and how your waxing routine is going. Just let me know what applies to you."
const BODY_INTRO =
  "{{contact_first_name}}, I'm going to run through a few areas and changes people often notice. Just let me know which ones apply to you, even if they're subtle."

const CHIRO_FAMILY_SLUGS = [
  'gut-health',
  'chiropractic',
  'chirothin',
  'decompression',
  'joint-pain',
  'neuropathy',
  'acupuncture',
  'massage-therapy',
  'acoustic-wave-therapy',
  'weight-loss-not-chirothin',
  'glp-patients',
] as const

const LEAD_SLUGS = [
  'chiropractic.lead',
  'chirothin.lead',
  'decompression.lead',
  'joint-pain.lead',
  'acoustic-wave-therapy.lead',
  'red-light-body-contouring.lead',
] as const

const AESTHETIC_INTROS = [
  {
    intro: SKIN_CONCERNS_INTRO,
    slugs: [
      'acne-acne-scarring',
      'rosacea-redness',
      'ipl-photofacial',
      'pigmentation-sun-damage',
      'chemical-peels',
      'facials-hydrafacial',
    ],
  },
  {
    intro: CHANGES_INTRO,
    slugs: [
      'botox',
      'fillers',
      'microneedling-rf-microneedling',
      'laser-resurfacing',
      'skin-tightening',
    ],
  },
  { intro: SKINCARE_INTRO, slugs: ['medical-grade-skincare'] },
  { intro: HAIR_REMOVAL_INTRO, slugs: ['laser-hair-removal'] },
  { intro: WAXING_INTRO, slugs: ['body-waxing'] },
  { intro: BODY_INTRO, slugs: ['red-light-body-contouring', 'cellulite-reduction'] },
] as const

function firstSpokenParagraph(content: string): string | undefined {
  return content
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .find((paragraph) => paragraph && !(paragraph.startsWith('(') && paragraph.endsWith(')')))
}

describe('Chiro-family Questions screen intro', () => {
  it.each([...CHIRO_FAMILY_SLUGS, ...LEAD_SLUGS])('%s uses the exact intro first', (slug) => {
    const flow = readFlowFile(slug)
    const questions = flow.steps.filter(
      (step) =>
        step.step_key.startsWith('digging_in') ||
        (/questions/i.test(step.title) && !step.step_key.startsWith('permission')),
    )

    expect(questions.length).toBeGreaterThan(0)
    for (const step of questions) {
      expect(firstSpokenParagraph(step.content), `${slug}:${step.step_key}`).toBe(INTRO)
    }
  })
})

describe('Aesthetic Questions screen intro', () => {
  for (const group of AESTHETIC_INTROS) {
    it.each(group.slugs)('%s uses the exact approved group intro first', (slug) => {
      const flow = readFlowFile(slug)
      const questions = flow.steps.filter((step) => step.step_key.startsWith('digging_in'))

      expect(questions.length).toBeGreaterThan(0)
      for (const step of questions) {
        expect(firstSpokenParagraph(step.content), `${slug}:${step.step_key}`).toBe(group.intro)
      }
    })
  }
})
