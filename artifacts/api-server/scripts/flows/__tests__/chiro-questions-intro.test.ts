import { describe, expect, it } from 'vitest'
import { readFlowFile } from '../lib.ts'

const INTRO =
  "{{contact_first_name}}, I'm going to run through a few things people often notice. Just say yes if you get them at all, even if they're mild or come and go."

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
  'red-light-body-contouring',
  'cellulite-reduction',
] as const

const LEAD_SLUGS = [
  'chiropractic.lead',
  'chirothin.lead',
  'decompression.lead',
  'joint-pain.lead',
  'acoustic-wave-therapy.lead',
  'red-light-body-contouring.lead',
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