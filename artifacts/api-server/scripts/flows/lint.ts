// Lint content/flows/*.json against docs/SCRIPT_STYLE_GUIDE.md.
//   node scripts/flows/lint.ts                      # every file
//   node scripts/flows/lint.ts skin-tightening general
//   node scripts/flows/lint.ts --quiet general      # counts only
//
// Exit code 1 when any linted file has an error. Warnings never fail.
//
// Mechanical rules (see the guide for the reasoning):
//   R1  one question per sentence (two "?" in one breath)
//   R2  spoken sentences under 20 words, average around 10 per step
//   R3  everyday vocabulary (swap-table words)
//   R4  banned sales stock phrases
//   R5  never claim what the patient said or felt in the past
//   R6  {{provider_name}} at most once per screen, then "we"
//   R7  coaching notes wrapped in parentheses, one line each, never mixed
//       into a spoken paragraph
//   R8  no {{rec_pronoun}} / {{rec_obj}} / {{rec_poss}} / {{rec_pronoun_cap}}
//   R10 question screens map one-to-one to the concern chips
//   R11 the read-back lives on review only; recommendation opens with the
//       bridge and asks "Can I make a recommendation?"
// Plus the structural checks apply runs (routing targets, tokens).
import { pathToFileURL } from 'node:url'
import {
  GENERAL_SLUG,
  listSlugs,
  printProblems,
  readFlowFile,
  tokensIn,
  validateStructure,
  type FlowFile,
  type Problem,
} from './lib.ts'
import { CONCERN_OPTIONS } from '../../../reactivation-power/src/lib/concern-options.ts'

export const MAX_SENTENCE_WORDS = 20
export const TARGET_AVG_WORDS = 12

/** Words that belong to the trainer's voice, not a front-desk caller's. */
export const BANNED_PHRASES: string[] = [
  // stock closer lines
  "i'll tell you the same thing i tell everyone",
  'the same thing i tell everyone',
  "we'd be honored",
  "i'd be honored",
  'be honored if you let',
  'waste your time or your money',
  'waste anybody\u2019s time',
  "waste anybody's time",
  "that's exactly the kind of thing",
  'exactly the kind of thing',
  'every single day',
  "here's the thing",
  "here's the funny thing",
  'the funny thing about',
  'use-it-or-lose-it',
  'the long way around',
  'yes-yes',
  'the heart of the close',
  'that yes is the moment',
  'quietly chipping away',
  "that's not really ok",
  'not really okay',
  'stay ahead of it instead of behind it',
  'sneaking back',
  'silently',
  // copywriter flourishes
  'absolutely',
  'incredibly',
  'honestly',
  'beautifully',
  'thrilled',
  'vibrant',
  'nothing better than',
  'relive the win',
  'firmness you earned',
  "isn't kind",
  'isn\u2019t kind',
  // over-validation openers
  'i completely understand',
  'i completely hear you',
  'that makes complete sense',
  'makes total sense',
  'it makes complete sense',
  'completely normal',
  'no guilt at all',
  "that's real, and i'm glad you told me",
]

/** Clinical or copy words -> plain words. Left side is matched whole-word, case-insensitive. */
export const WORD_SWAPS: Array<[string, string]> = [
  ['laxity', 'loosening'],
  ['crepey', 'thin-looking'],
  ['non-judgmental', 'stay warm'],
  ['nonjudgmental', 'stay warm'],
  ['delicate areas', 'thinner skin'],
  ['collagen', 'the firmness'],
  ['maintenance schedule', 'regular check'],
  ['evaluation', 'visit'],
  ['periodic', 'regular'],
  ['discouraging', 'frustrating'],
  ['empathetic', 'kind'],
  ['empathy', 'warmth'],
  ['vibrant', 'good'],
  ['radar', 'to-do list'],
]

/** Past-visit claims about what the patient said or felt (rule 5). */
export const CLAIM_PHRASES: string[] = [
  'i remember how',
  'i remember when',
  'i remember you',
  'you told us',
  'you told me when',
  'when you first came in, you',
  'how happy you were',
  'how pleased you were',
  'how proud you were',
  'how much you loved',
  'how much it bothered you',
  'you were so',
  "i'm sure you remember",
  'i\u2019m sure you remember',
]

const REC_TOKENS = ['rec_pronoun', 'rec_pronoun_cap', 'rec_obj', 'rec_poss']

/** Openers that mark a paragraph as a coaching note even without parentheses. */
const COACHING_OPENERS =
  /^(let them|wait for|do not|don't|don\u2019t|never |pause|confirm and continue|then respond|then ask|recap|ask about|ask each|take the|be empathetic|be warm|if (they|no|yes|the)|click |tap |write down|critical:|note:|always |before the call|once booked|about \d+%|their answer)/i

const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'or', 'and', 'your', 'you', 'to', 'in', 'on', 'at',
  'is', 'it', 'that', 'this', 'how', 'any', 'about', 'with', 'after', 'they',
  'them', 'asked', 'change', 'problems', 'issues', 'trouble', 'low', 'coming',
  'creeping', 'slipping', 'back', 'given', 'up', 'cut', 'their', 'fit', 'feel',
  'original', 'area', 'routine', 'old', 'nagging', 'stubborn',
])

/** Map a chip label to search stems so the lint can find its question. */
function chipStems(label: string): string[] {
  const words = label
    .toLowerCase()
    .replace(/[^a-z0-9\s/]/g, ' ')
    .split(/[\s/]+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
  // crude stemming: "headaches" -> "headache", "hands" -> "hand"
  const stems = words.map((w) => w.replace(/(es|s)$/, '').replace(/ies$/, 'y'))
  // Every-word-is-a-stopword labels ("Back", "Legs") fall back to the label itself.
  return stems.length > 0 ? stems : [label.toLowerCase()]
}

// Manual stems for chips whose label words never appear in a natural question.
const CHIP_HINTS: Record<string, string[]> = {
  'Skin after weight change': ['weight'],
  'Above the knees': ['knee'],
  'Backs of hands': ['hand'],
  'Jawline / neck': ['jawline', 'neck'],
  'Activities given up': ['activit', 'given up', 'stopped doing'],
  'Activities cut back': ['activit', 'cut back'],
  'How clothes fit / feel': ['clothes'],
  'How clothes fit': ['clothes'],
  'Medications': ['medication', 'pills'],
  'The original area': ['original', 'we treated', 'area we'],
  'A treatment they asked about': ['asked about', 'curious', 'wondering about'],
  'A service they asked about': ['asked about', 'curious', 'wondering about'],
  'Routine slipped': ['routine'],
  'Foods they avoid': ['food'],
  'Weight creeping back': ['weight'],
  'Weight coming back': ['weight'],
  'Eating habits slipping': ['eating'],
  'Old eating habits creeping in': ['eating'],
  'Energy dips / fatigue': ['energy', 'tired'],
  'Fatigue / low energy': ['energy', 'tired', 'fatigue'],
  'Energy crashes': ['energy'],
  'Energy / recovery': ['energy', 'recover'],
  'Women\u2019s health': ['women', 'cycle', 'hormon'],
  'Pain traveling down leg / arm': ['leg', 'arm', 'travel', 'shoot'],
  'Trouble bending / lifting': ['bend', 'lift'],
  'Trouble sitting': ['sitting', 'sit '],
  'Flare-ups': ['flare'],
  'Irritation / ingrowns': ['irritation', 'ingrown', 'bumps'],
  'Lip / face': ['lip', 'face'],
  'Face': ['face', 'facial'],
  'Knees, hips, or feet': ['knee', 'hip', 'feet'],
  'Neck or back pain': ['neck', 'back'],
  'Muscle or strength loss': ['muscle', 'strength'],
  'Mood / stress': ['mood', 'stress'],
  'Brain fog': ['fog', 'foggy'],
  'Heartburn / reflux': ['heartburn', 'reflux'],
  'Irregularity': ['irregular', 'regular'],
}

/** Read-back openers that belong on the review screen only (R11). */
export const READBACK_OPENERS: string[] = [
  'let me make sure i have this right',
  'let me make sure i have that right',
  'let me make sure i got this right',
  'let me make sure i got that right',
  'let me make sure i heard you right',
  "let me make sure i've heard you right",
  "let me make sure i've got this right",
  "let me make sure i've got that right",
  'let me make sure i understand',
  'let me read that back',
  'let me read this back',
  'let me play that back',
  'let me play this back',
  'so if i heard you right',
  'so if i have this right',
  'so if i got this right',
]
export const READBACK_CONFIRM = 'did i get that right?'
export const RECOMMENDATION_ASK = 'can i make a recommendation?'
export const RECOMMENDATION_CLOSE = 'does that sound reasonable?'
export const EXPLAINER_CHECK = 'does that make sense?'
/** Phrases that mean the caller has started recommending (the "let's get you in" move). */
export const RECOMMENDING_PHRASES: string[] = [
  "let's get",
  "let's book",
  "let's schedule",
  "let's set you up",
  'my recommendation is',
  'i recommend',
  "i'd recommend",
  'what i recommend',
]
const REVIEW_KEY = 'review'
const RECOMMENDATION_KEY = 'recommendation'

interface Sentence {
  text: string
  words: number
}

/** Split a spoken paragraph into sentences. Tokens count as one word each. */
function sentencesOf(paragraph: string): Sentence[] {
  const plain = paragraph
    .replace(/\{\{\s*[a-zA-Z0-9_]+\s*\}\}/g, 'TOKEN')
    .replace(/\([^)]*\)/g, ' ') // inline placeholder like (day), (time)
    .replace(/\[[^\]]*\]/g, 'X') // [Repeat their answer back]
    .replace(/\s+/g, ' ')
    .trim()
  if (!plain) return []
  const parts = plain
    .split(/(?<=[.!?])\s+(?=["\u201c\u2018']?[A-Z0-9])/)
    .map((s) => s.trim())
    .filter(Boolean)
  return parts.map((text) => ({
    text,
    words: text.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length,
  }))
}

function isCoachingNote(p: string): boolean {
  return p.startsWith('(') && p.endsWith(')')
}

/** A spoken paragraph that has a coaching note glued on either end. */
function hasMixedNote(p: string): boolean {
  if (isCoachingNote(p)) return false
  // trailing "(Let them answer.)" or leading "(If ...:)" glued to speech
  if (/^\([^)]*\)\s*\S/.test(p)) return true
  if (/\S\s*\([^)]{12,}\)$/.test(p) && !/\((day|time|s)\)$/i.test(p)) return true
  return false
}

export function lintFile(slug: string, file: FlowFile, generalKeys: Set<string>): Problem[] {
  const problems: Problem[] = [...validateStructure(slug, file, generalKeys)]
  const push = (level: Problem['level'], where: string, message: string) =>
    problems.push({ level, where, message })

  for (const step of file.steps) {
    const where = `${slug}:${step.step_key}`
    const paragraphs = step.content
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean)

    // R8 legacy pronoun tokens
    for (const t of tokensIn(step.content)) {
      if (REC_TOKENS.includes(t)) push('error', where, `R8 uses {{${t}}}; write {{provider_name}} once, then "we"`)
    }

    // R6 provider named once
    const providerMentions = (step.content.match(/\{\{\s*provider_name\s*\}\}/g) ?? []).length
    if (providerMentions > 1) push('warn', where, `R6 {{provider_name}} appears ${providerMentions} times; name the provider once, then say "we"`)

    let spokenSentences = 0
    let spokenWords = 0

    for (const p of paragraphs) {
      if (isCoachingNote(p)) {
        if (/\n/.test(p)) push('warn', where, `R7 coaching note spans several lines: "${p.slice(0, 50)}\u2026"`)
        continue
      }
      if (hasMixedNote(p)) {
        push('error', where, `R7 coaching note glued to spoken text; put it on its own line in parentheses: "${p.slice(0, 60)}\u2026"`)
      }
      // Multi-line paragraphs: lint each line as spoken unless it is a note.
      const lines = p.split('\n').map((l) => l.trim()).filter(Boolean)
      for (const line of lines) {
        if (isCoachingNote(line)) continue
        if (COACHING_OPENERS.test(line)) {
          push('error', where, `R7 coaching note not wrapped in parentheses: "${line.slice(0, 60)}\u2026"`)
          continue
        }
        const lower = line.toLowerCase()
        for (const phrase of BANNED_PHRASES) {
          if (lower.includes(phrase)) push('error', where, `R4 banned phrase "${phrase}"`)
        }
        for (const [from, to] of WORD_SWAPS) {
          if (new RegExp(`\\b${from.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i').test(line)) {
            push('error', where, `R3 swap "${from}" -> "${to}"`)
          }
        }
        for (const phrase of CLAIM_PHRASES) {
          if (lower.includes(phrase)) push('error', where, `R5 claims what the patient said or felt ("${phrase}"); use "your notes say"`)
        }
        // R1: two questions in one breath (no period between two "?")
        for (const unit of line.split(/(?<=[.!])\s+/)) {
          const q = (unit.match(/\?/g) ?? []).length
          if (q >= 2) push('error', where, `R1 ${q} questions in one sentence: "${unit.slice(0, 60)}\u2026"`)
        }
        // R2 sentence length
        for (const s of sentencesOf(line)) {
          spokenSentences++
          spokenWords += s.words
          if (s.words > MAX_SENTENCE_WORDS) {
            push('error', where, `R2 ${s.words}-word sentence: "${s.text.slice(0, 60)}\u2026"`)
          }
        }
      }
    }
    if (spokenSentences > 0) {
      const avg = spokenWords / spokenSentences
      if (avg > TARGET_AVG_WORDS + 3) {
        push('warn', where, `R2 average ${avg.toFixed(1)} words per spoken sentence (target ~10)`)
      }
    }
  }

  // R10 chips <-> questions, for niches with concern chips
  const chips = file.niche ? CONCERN_OPTIONS[file.niche.name] : undefined
  if (chips && chips.length > 0) {
    const questionSteps = file.steps.filter((s) => s.step_key.startsWith('digging_in'))
    if (questionSteps.length === 0) {
      push('warn', `${slug}`, `R10 niche has ${chips.length} concern chips but no digging_in step of its own (general questions will not match the chips)`)
    }
    for (const step of questionSteps) {
      const where = `${slug}:${step.step_key}`
      const questions = step.content
        .split(/\n/)
        .map((l) => l.trim())
        .filter((l) => l && !isCoachingNote(l) && l.includes('?'))
      const bodyQuestions = questions.filter(
        (q) => !/which (one|of these|area)|would you (choose|pick)|bothers you the most|is that (right|okay|ok)\?|can i ask/i.test(q),
      )
      const joined = bodyQuestions.join('\n').toLowerCase()
      for (const chip of chips) {
        const stems = CHIP_HINTS[chip.label] ?? chipStems(chip.label)
        const hit = stems.some((st) => joined.includes(st))
        if (!hit) push('error', where, `R10 no question for chip "${chip.label}" (looked for: ${stems.join(', ')})`)
      }
      // Count questions that carry a chip; extras mean a question with no chip.
      const matched = new Set<number>()
      for (const chip of chips) {
        const stems = CHIP_HINTS[chip.label] ?? chipStems(chip.label)
        bodyQuestions.forEach((q, i) => {
          if (stems.some((st) => q.toLowerCase().includes(st))) matched.add(i)
        })
      }
      const unmatched = bodyQuestions.filter((_, i) => !matched.has(i))
      if (unmatched.length > 0) {
        push('warn', where, `R10 ${unmatched.length} question(s) with no matching chip: ${unmatched.map((q) => `"${q.slice(0, 40)}\u2026"`).join(' ')}`)
      }
      if (bodyQuestions.length !== chips.length) {
        push(unmatched.length > 0 ? 'warn' : 'warn', where, `R10 ${bodyQuestions.length} questions for ${chips.length} chips`)
      }
    }
  }

  problems.push(...lintReadBack(slug, file))

  return problems
}

/**
 * R11: the read-back happens once, on the review screen. Every other screen
 * must not recap; the recommendation screen asks permission before it
 * recommends anything.
 */
export function lintReadBack(slug: string, file: FlowFile): Problem[] {
  const problems: Problem[] = []
  const push = (level: Problem['level'], where: string, message: string) =>
    problems.push({ level, where, message })

  for (const step of file.steps) {
    const where = `${slug}:${step.step_key}`
    const spoken = spokenParagraphs(step.content).map((p) => normalizeQuotes(p).toLowerCase())
    const all = spoken.join('\n')
    const opener = READBACK_OPENERS.find((o) => all.includes(o))
    const confirms = all.includes(READBACK_CONFIRM)

    if (step.step_key === REVIEW_KEY) {
      if (!opener) push('error', where, `R11 review screen has no read-back opener ("let me make sure I have this right")`)
      if (!confirms) push('error', where, `R11 review screen never asks "Did I get that right?"`)
      continue
    }

    // Every other screen: no recap. The caller already read the answers back.
    if (opener) push('error', where, `R11 read-back opener "${opener}" outside the review screen; the recap happens once, on review`)
    if (confirms) push('error', where, `R11 asks "Did I get that right?" outside the review screen; that question belongs on review`)

    if (!isRecommendationKey(step.step_key)) continue

    const askIdx = spoken.findIndex((p) => p.includes(RECOMMENDATION_ASK))
    if (askIdx === -1) {
      push('error', where, `R11 recommendation never asks "Can I make a recommendation?"; open with the bridge and ask permission before recommending`)
      continue
    }
    // The ask belongs in the first spoken paragraph. The one allowed exception
    // is the explainer shape: paragraph 1 explains the visit and ends with
    // "Does that make sense?", paragraph 2 is the ask on its own.
    const askParagraph = spoken[askIdx]
    const explainer = askIdx === 1 && spoken[0].endsWith(EXPLAINER_CHECK)
    if (askIdx > 0 && !explainer) {
      push('error', where, `R11 "Can I make a recommendation?" is in paragraph ${askIdx + 1}; ask it in the first paragraph (or explain the visit, end on "Does that make sense?", then ask)`)
    }
    // The ask closes its paragraph: nothing is recommended until the patient
    // has said yes. Only the bridge (or the name) may come before it.
    if (!askParagraph.endsWith(RECOMMENDATION_ASK)) {
      push('error', where, `R11 keeps talking after "Can I make a recommendation?" in the same paragraph; stop there and wait for the yes`)
    }
    const beforeAsk = askParagraph.slice(0, askParagraph.indexOf(RECOMMENDATION_ASK))
    if (explainer && !/^(\{\{\s*contact_first_name\s*\}\},?\s*)?$/.test(beforeAsk)) {
      push('error', where, `R11 explainer shape needs the ask on its own in paragraph two; move "${beforeAsk.trim().slice(0, 40)}…" into the explainer`)
    }
    const spokenBeforeAsk = [...spoken.slice(0, askIdx), beforeAsk].join('\n')
    if (RECOMMENDING_PHRASES.some((ph) => spokenBeforeAsk.includes(ph)) || spokenBeforeAsk.includes(RECOMMENDATION_CLOSE)) {
      push('error', where, `R11 recommends before asking "Can I make a recommendation?"; ask permission first`)
    }
  }
  return problems
}

function isRecommendationKey(key: string): boolean {
  return key === RECOMMENDATION_KEY || key.startsWith(`${RECOMMENDATION_KEY}_`)
}

/** Spoken paragraphs of a step, with coaching notes and note-only lines removed. */
function spokenParagraphs(content: string): string[] {
  return content
    .split(/\n\s*\n/)
    .map((p) =>
      p
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !isCoachingNote(l))
        .join('\n'),
    )
    .filter(Boolean)
}

function normalizeQuotes(s: string): string {
  return s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
}

function main() {
  const args = process.argv.slice(2)
  const quiet = args.includes('--quiet')
  const requested = args.filter((a) => !a.startsWith('--'))
  const slugs = requested.length > 0 ? requested : listSlugs()
  const general = readFlowFile(GENERAL_SLUG)
  const generalKeys = new Set(general.steps.map((s) => s.step_key))

  let totalErrors = 0
  let totalWarnings = 0
  for (const slug of slugs) {
    const file = readFlowFile(slug)
    const problems = lintFile(slug, file, generalKeys)
    const errors = problems.filter((p) => p.level === 'error').length
    const warnings = problems.length - errors
    totalErrors += errors
    totalWarnings += warnings
    const status = errors === 0 ? 'PASS' : 'FAIL'
    console.log(`${status}  ${slug.padEnd(28)} ${errors} error(s), ${warnings} warning(s)`)
    if (!quiet && problems.length > 0) {
      printProblems(problems)
      console.log('')
    }
  }
  console.log(`\n${slugs.length} file(s): ${totalErrors} error(s), ${totalWarnings} warning(s)`)
  process.exit(totalErrors > 0 ? 1 : 0)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
