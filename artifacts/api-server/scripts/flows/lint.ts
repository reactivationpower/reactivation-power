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
//   R4  banned sales stock phrases, plus the retired closes (RETIRED_PHRASES)
//   R5  never claim what the patient said or felt in the past
//   R6  {{provider_name}} at most once per screen, then "we"
//   R7  coaching notes wrapped in parentheses, one line each, never mixed
//       into a spoken paragraph
//   R8  no {{rec_pronoun}} / {{rec_obj}} / {{rec_poss}} / {{rec_pronoun_cap}}
//   R9  objection handles: an isolating question before "(Let them answer",
//       a closing line no other obj_* screen in the flow shares, and never
//       "Does that sound reasonable?" (error for niches on the shape, warn
//       for niches still on the old three-sentence handles)
//   R10 question screens map one-to-one to the concern chips
//   R11 the read-back lives on review only; recommendation opens with the
//       bridge and asks "Can I make a recommendation?"
//   R12 every non-terminal step has an outgoing choice (no mid-call
//       "End of script"); known dead ends are allow-listed in lib.ts
//   R13 permission screens (transition, permission_questions, anything that
//       routes to digging_in) ask permission; "Does that sound reasonable?"
//       only closes a screen that asked permission earlier on; every
//       permission ask ends its paragraph and is followed by a coaching note
//   R14 making_it_real* screens keep the shared three-question shape: a
//       scaled duration question, a scaled frequency question, then "When
//       it's at its worst…", each followed by a coaching note
//   R15 every non-entry step is the target of some choice (no screen that
//       no button leads to); entry screens are listed in lib.ts next to
//       TERMINAL_STEP_PATTERNS
// Plus the structural checks apply runs (routing targets, tokens).
//   R16 the review screen the caller reaches (the file's own or general's)
//       names every impact bucket the effective making_it_real* screens
//       offered, so the read-back never names buckets the patient never heard
//   R17 concern chips for a parent-mode niche (any flow with a mode_parent*
//       step) keep their spoken phrase pronoun-free and token-free, so
//       {{main_concern}} reads the same to the patient or a parent
//   R18 every niche flow file has a CONCERN_OPTIONS entry under its niche
//       name (error: the question screen would fall back to the generic
//       phrase), and every CONCERN_OPTIONS key names a flow file (warn: the
//       chips are dead data). Niche name is the join key because the player
//       looks chips up by the niche row's name, which apply copies from the
//       file's niche block.
//   R19 every obj_* screen's buttons open with the shared exit pair from
//       lib.ts (OBJECTION_EXIT_CHOICES): "Resolved: back to scheduling" →
//       scheduling at 0, "Another concern came up" → uncover at 1; extra
//       routes (hvac/plumbing) sit after them and only lead to another
//       obj_* or a close_* screen
import { pathToFileURL } from 'node:url'
import {
  GENERAL_SLUG,
  findDeadEnds,
  findObjectionExitDrift,
  findUnreachableSteps,
  listSlugs,
  printProblems,
  readFlowFile,
  tokensIn,
  validateStructure,
  type FlowFile,
  type FlowStep,
  type Problem,
} from './lib.ts'
import { CONCERN_OPTIONS } from '@workspace/niche-catalog'

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

/**
 * Closing lines the owner retired from every script. Unlike BANNED_PHRASES
 * these were once the house close, so a batch rewrite or a hand edit in the
 * DB is likely to bring them back. Matched case-insensitively against the
 * whole step (spoken text and coaching notes), with curly apostrophes and
 * ellipses normalised first.
 */
export const RETIRED_PHRASES: string[] = [
  'my recommendation is that',
  'do you see how that could be the case',
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

const OBJECTION_PREFIX = 'obj_'
/**
 * Niches whose objection handles follow the five-beat shape (R9). R9 problems
 * are errors here and warnings everywhere else, so the rollout can go niche
 * by niche. Add a niche once its obj_* screens have been rewritten.
 */
export const OBJECTION_SHAPE_NICHES: ReadonlySet<string> = new Set([
  'Chiropractic',
  'Decompression',
  'Joint Pain',
  'Neuropathy',
  'ChiroThin',
  'Gut Health',
  'Red Light / Body Contouring',
  'Acne / Acne Scarring',
  'Acoustic Wave Therapy',
  'Acupuncture',
  'Body Waxing',
  'Botox',
  'Cellulite Reduction',
  'Chemical Peels',
  'Clear Aligners',
  'Dental Implants',
  'Facials / HydraFacial',
  'Fillers',
  'GLP Patients',
  'HVAC',
  'IPL / Photofacial',
  'Laser Hair Removal',
  'Laser Resurfacing',
  'Massage Therapy',
  'Medical-Grade Skincare',
  'Microneedling / RF Microneedling',
  'Orthodontics / Braces',
  'Pigmentation / Sun Damage',
  'Plumbing',
  'Rosacea / Redness',
  'Skin Tightening',
  'Teeth Whitening',
  'Weight Loss (Not ChiroThin)',
])

/** Coaching note that separates the isolating question from the reason (R9 beat 3). */
export const LET_THEM_ANSWER = '(let them answer'

/**
 * Ways a caller asks permission before asking questions or recommending
 * (R13). Matched against lower-cased spoken text; each one must be a
 * question, so "can i ask" only counts when a "?" follows in that sentence.
 */
export const PERMISSION_OPENERS: string[] = [
  'can i ask',
  'could i ask',
  'may i ask',
  'can i make a recommendation',
  'can i make a suggestion',
  'can i share',
  'can i tell you',
  'mind if i',
  'would it be okay if',
  'would it be all right if',
  'okay if i',
  'is that okay',
  'is that all right',
]
/** Step-key families that exist to ask permission for the questions (R13). */
const PERMISSION_KEY_PREFIXES = ['transition', 'permission_questions']
const QUESTIONS_KEY = 'digging_in'
/**
 * The shared Making It Real shape (R14, guide example 5). Every script asks
 * exactly three questions in this order, each carrying its own scale so the
 * honest answer sounds significant. Matched against lower-cased spoken text
 * with straight quotes.
 */
const MAKING_IT_REAL_KEY = 'making_it_real'
export const MAKING_IT_REAL_DURATION_SCALES: string[] = [
  'longer than that',
  'more like months',
  'since last season',
]
export const MAKING_IT_REAL_FREQUENCY_SCALES: string[] = [
  'more often than that',
  'most days',
  'every time',
]
export const MAKING_IT_REAL_IMPACT_OPENER = "when it's at its worst"

/** The words in the third question that introduce the buckets ("…interfere with work, at home, or…"). */
export const MAKING_IT_REAL_BUCKET_LEAD = /\b(?:interfere with|gets? in the way of)\s+/i
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

export function lintFile(
  slug: string,
  file: FlowFile,
  general: FlowFile,
  /** Niche files whose buttons may reach into general.json (only used when linting general). */
  referrers: FlowFile[] = [],
): Problem[] {
  const generalKeys = new Set(general.steps.map((s) => s.step_key))
  const problems: Problem[] = [
    ...validateStructure(slug, file, generalKeys),
    ...findDeadEnds(slug, file, general),
    ...findUnreachableSteps(slug, file, general, slug === GENERAL_SLUG ? referrers : []),
    ...findObjectionExitDrift(slug, file, general),
  ]
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

    // R4 retired closes: checked over the whole step, notes included, so a
    // retired line cannot hide inside a coaching note either.
    const normalisedStep = normalisePhraseText(step.content)
    for (const phrase of RETIRED_PHRASES) {
      if (normalisedStep.includes(phrase)) push('error', where, `R4 retired close "${phrase}"; the script no longer uses this line`)
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

  // R18 a niche flow with no concern chips sends callers to the generic
  // question screen
  problems.push(...lintChipPresence(slug, file))

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
  problems.push(...lintPermission(slug, file))
  problems.push(...lintObjections(slug, file, general))
  problems.push(...lintMakingItReal(slug, file))
  problems.push(...lintParentChips(slug, file))
  problems.push(...lintReviewBuckets(slug, file, general))

  return problems
}

/**
 * Niche names that deliberately ship a call script without concern chips.
 * Empty on purpose: every niche so far has chips. Add a name here (with a
 * comment saying why the generic "what's been bothering you the most"
 * question is acceptable for it) rather than skipping R18.
 */
export const CHIPLESS_NICHES: ReadonlySet<string> = new Set<string>([])
/**
 * R16: the review screen reads back the buckets the patient actually heard.
 * The third Making It Real question offers three impact buckets ("photos,
 * going out, or feeling put together"); the review screen the caller reaches
 * next (the file's own `review*` steps, else general's) has to name each of
 * them, in its spoken text or in the "(Say what they named: …)" note. A
 * niche that writes its own making_it_real but inherits general's review
 * would otherwise read back "work, home, or your own time" to a patient who
 * was asked about photos. Short forms of a bucket are declared in
 * IMPACT_BUCKET_EQUIVALENTS; any other bucket must appear with all of its
 * content words.
 */
export function lintReviewBuckets(slug: string, file: FlowFile, general: FlowFile): Problem[] {
  const problems: Problem[] = []
  const isGeneral = file === general || slug === GENERAL_SLUG

  const effective = (family: string): EffectiveStep[] => {
    const own = file.steps
      .filter((s) => isKeyIn(s.step_key, family))
      .map((step) => ({ step, where: `${slug}:${step.step_key}` }))
    if (own.length > 0 || isGeneral) return own
    return general.steps
      .filter((s) => isKeyIn(s.step_key, family))
      .map((step) => ({ step, where: `${slug}:${step.step_key} (inherited from ${GENERAL_SLUG})` }))
  }
  const makingItReal = effective(MAKING_IT_REAL_KEY)
  const reviews = effective(REVIEW_KEY)
  if (makingItReal.length === 0 || reviews.length === 0) return problems

  for (const review of reviews) {
    const reviewText = normalisePhraseText(review.step.content)
    for (const mir of makingItReal) {
      const buckets = impactBuckets(mir.step.content)
      if (buckets === null) continue // R14 reports the missing third question
      for (const bucket of buckets) {
        if (reviewNamesBucket(reviewText, bucket)) continue
        problems.push({
          level: 'error',
          where: review.where,
          message: `R16 review never names "${bucket}" from ${mir.where}'s third question ("${buckets.join(', ')}"); the read-back must use the buckets the patient heard`,
        })
      }
    }
  }
  return problems
}
/**
 * R14: every Making It Real screen keeps the shared three-question shape.
 * Exactly three spoken questions, each a paragraph ending in "?": duration
 * with a low anchor and "or longer than that?" (or the niche variants),
 * frequency with a low number and "or more often than that?" (or variants),
 * then "When it's at its worst, does it ever interfere with…". Each question
 * is followed by a coaching note so the caller pauses for the answer. Bare
 * questions ("How long has that been bothering you?") fail here.
 */
export function lintMakingItReal(slug: string, file: FlowFile): Problem[] {
  const problems: Problem[] = []
  const push = (level: Problem['level'], where: string, message: string) =>
    problems.push({ level, where, message })

  for (const step of file.steps) {
    if (!isKeyIn(step.step_key, MAKING_IT_REAL_KEY)) continue
    const where = `${slug}:${step.step_key}`
    const paragraphs = step.content
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean)

    const questionIdx = paragraphs
      .map((p, i) => (!isCoachingNote(p) && p.includes('?') ? i : -1))
      .filter((i) => i !== -1)

    if (questionIdx.length !== 3) {
      push('error', where, `R14 has ${questionIdx.length} spoken question(s); Making It Real asks exactly three (how long, how often, when it's at its worst)`)
      continue
    }

    const [duration, frequency, impact] = questionIdx.map((i) => normalizeQuotes(paragraphs[i]))
    const preview = (q: string) => `"${q.slice(0, 50)}\u2026"`

    for (const q of [duration, frequency, impact]) {
      if (!q.endsWith('?')) push('error', where, `R14 question does not end in "?"; ask it and stop: ${preview(q)}`)
    }

    const lowerDuration = duration.toLowerCase()
    if (!MAKING_IT_REAL_DURATION_SCALES.some((s) => lowerDuration.includes(s))) {
      push('error', where, `R14 first question needs a low anchor then "or ${MAKING_IT_REAL_DURATION_SCALES.join('" / "or ')}?"; a bare "how long" invites "a while": ${preview(duration)}`)
    }
    const lowerFrequency = frequency.toLowerCase()
    if (!MAKING_IT_REAL_FREQUENCY_SCALES.some((s) => lowerFrequency.includes(s))) {
      push('error', where, `R14 second question needs a low number then "or ${MAKING_IT_REAL_FREQUENCY_SCALES.join('" / "or ')}?"; a bare "how often" invites "sometimes": ${preview(frequency)}`)
    }
    if (!impact.toLowerCase().startsWith(MAKING_IT_REAL_IMPACT_OPENER)) {
      push('error', where, `R14 third question must start with "When it's at its worst" and name three buckets: ${preview(impact)}`)
    }

    questionIdx.forEach((i, n) => {
      const next = paragraphs[i + 1]
      if (next === undefined || !isCoachingNote(next)) {
        push('error', where, `R14 question ${n + 1} is not followed by a coaching note ("(Let them answer.)"): ${preview(normalizeQuotes(paragraphs[i]))}`)
      }
    })
  }
  return problems
}

/**
 * R9: every obj_* screen asks one isolating question before "(Let them
 * answer.)", ends on a tail no other objection screen in the same flow uses,
 * and never ends on the recommendation screen's "Does that sound reasonable?".
 *
 * The rule runs over the objection screens the caller can actually reach in
 * this flow: the niche's own obj_* steps plus every general obj_* step the
 * niche did not override but still routes to (a niche with no choices of its
 * own for a step falls through to general's, so deleting an override quietly
 * puts general's screen back in front of the caller). Inherited screens are
 * linted at the niche's severity. Niches on OBJECTION_SHAPE_NICHES get
 * errors; the rest get warnings until they are rewritten.
 */
export function lintObjections(slug: string, file: FlowFile, general: FlowFile): Problem[] {
  const problems: Problem[] = []
  const adopted = file.niche !== null && OBJECTION_SHAPE_NICHES.has(file.niche.name)
  const level: Problem['level'] = adopted ? 'error' : 'warn'
  const push = (where: string, message: string) => problems.push({ level, where, message })

  const effective = effectiveObjectionSteps(slug, file, general)
  const tails = new Map<string, string>()

  for (const { step, where } of effective) {
    const lines = step.content
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)

    // (1) one isolating question, then "(Let them answer.)"
    const noteIdx = lines.findIndex((l) => isCoachingNote(l) && normalizeQuotes(l).toLowerCase().startsWith(LET_THEM_ANSWER))
    if (noteIdx === -1) {
      push(where, `R9 no "(Let them answer.)" note; ask one isolating question, then let them answer before the reason`)
    } else {
      const asked = lines
        .slice(0, noteIdx)
        .filter((l) => !isCoachingNote(l))
        .reduce((n, l) => n + questionsIn(l), 0)
      if (asked === 0) push(where, `R9 nothing is asked before "(Let them answer.)"; open with one isolating question`)
      if (asked > 1) push(where, `R9 ${asked} questions before "(Let them answer.)"; ask one isolating question and let them answer it`)
    }

    // (2) and (3) the closing line
    const tail = closingLine(step.content)
    if (!tail) {
      push(where, `R9 objection screen has no spoken closing line`)
      continue
    }
    if (tail === RECOMMENDATION_CLOSE || tail.endsWith(` ${RECOMMENDATION_CLOSE}`)) {
      push(where, `R9 ends with "Does that sound reasonable?"; that line belongs to the recommendation screen and the caller just said it`)
    }
    const seenAt = tails.get(tail)
    if (seenAt) {
      push(where, `R9 closing line "${tail}" is also the tail of ${seenAt}; give each objection its own check`)
    } else {
      tails.set(tail, where)
    }
  }
  return problems
}

interface EffectiveStep {
  step: FlowStep
  /** Problem location; inherited screens are labelled so the fix lands in the right file. */
  where: string
}

/**
 * R13: ask before you ask. A permission screen (transition, permission
 * questions, or any step that routes straight into the question screen) must
 * contain a permission question. And "Does that sound reasonable?" is the
 * close of a recommendation the patient agreed to hear, so any screen that
 * says it must have asked permission earlier on the same screen.
 */
export function lintPermission(slug: string, file: FlowFile): Problem[] {
  const problems: Problem[] = []
  const push = (level: Problem['level'], where: string, message: string) =>
    problems.push({ level, where, message })

  const routesToQuestions = new Set(
    file.choices.filter((c) => isKeyIn(c.to_step_key, QUESTIONS_KEY)).map((c) => c.from_step_key),
  )

  for (const step of file.steps) {
    const where = `${slug}:${step.step_key}`
    const spoken = spokenParagraphs(step.content).map((p) => normalizeQuotes(p).toLowerCase())
    const all = spoken.join('\n')
    const ask = firstPermissionAsk(all)

    const byKey = PERMISSION_KEY_PREFIXES.some((k) => isKeyIn(step.step_key, k))
    if (byKey || routesToQuestions.has(step.step_key)) {
      if (ask === null) {
        const why = byKey ? 'is a permission screen' : `routes to ${QUESTIONS_KEY}`
        push('error', where, `R13 ${why} but never asks permission ("Can I ask you a few quick questions?" / "Is that okay?") before the questions`)
      }
    }

    for (const p of permissionPauseProblems(step)) push('error', where, p)

    const closeIdx = all.indexOf(RECOMMENDATION_CLOSE)
    if (closeIdx === -1) continue
    if (ask === null) {
      push('error', where, `R13 asks "Does that sound reasonable?" without ever asking permission first; ask ("Can I make a recommendation?") before you recommend`)
    } else if (ask.index > closeIdx) {
      push('error', where, `R13 asks "Does that sound reasonable?" before asking permission ("${ask.opener}"); the ask comes first`)
    }
  }
  return problems
}

/**
 * R13 (wait for the yes): every permission ask, on any screen, is the last
 * thing the caller says before stopping. The ask ends its line, and whatever
 * comes next on the screen is a coaching note ("(Wait for the yes.)") rather
 * than more speech. Mirrors the R11 "keeps talking after" check, which only
 * covers the recommendation screen's own ask.
 */
function permissionPauseProblems(step: FlowStep): string[] {
  const problems: string[] = []
  const lines = step.content
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (isCoachingNote(line)) continue
    const lower = normalizeQuotes(line).toLowerCase()
    const ask = firstPermissionAsk(lower)
    if (ask === null) continue
    const quoted = `"${line.slice(ask.index, lower.indexOf('?', ask.index) + 1)}"`
    const after = line.slice(lower.indexOf('?', ask.index) + 1).trim()
    if (after) {
      // A note glued onto the ask is R7's problem, not a second breath.
      if (isCoachingNote(after)) continue
      // R11 already reports the recommendation screen's own ask.
      if (isRecommendationKey(step.step_key) && ask.opener + '?' === RECOMMENDATION_ASK) continue
      problems.push(`R13 keeps talking after ${quoted} in the same paragraph; end the paragraph there and add "(Wait for the yes.)" before the next line`)
      continue
    }
    const next = lines[i + 1]
    if (next !== undefined && !isCoachingNote(next)) {
      problems.push(`R13 goes straight from ${quoted} into "${next.slice(0, 40)}…"; put a coaching note like "(Wait for the yes.)" between the ask and the next spoken line`)
    }
  }
  return problems
}
/** A flow runs in parent mode when it carries a mode_parent* step. */
export function hasParentMode(file: FlowFile): boolean {
  return file.steps.some((s) => s.step_key.startsWith('mode_parent'))
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
  return isKeyIn(key, RECOMMENDATION_KEY)
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

/** Earliest permission opener that is part of a question. */
function firstPermissionAsk(lowerSpoken: string): { opener: string; index: number } | null {
  let best: { opener: string; index: number } | null = null
  for (const opener of PERMISSION_OPENERS) {
    let from = 0
    while (true) {
      const idx = lowerSpoken.indexOf(opener, from)
      if (idx === -1) break
      // The opener has to be inside a question: a "?" before the next sentence end.
      const rest = lowerSpoken.slice(idx + opener.length)
      const stop = rest.search(/[.!?\n]/)
      if (stop !== -1 && rest[stop] === '?') {
        if (best === null || idx < best.index) best = { opener, index: idx }
        break
      }
      from = idx + opener.length
    }
  }
  return best
}

function isKeyIn(key: string | null, family: string): boolean {
  return key !== null && (key === family || key.startsWith(`${family}_`))
}

function main() {
  const args = process.argv.slice(2)
  const quiet = args.includes('--quiet')
  const requested = args.filter((a) => !a.startsWith('--'))
  const slugs = requested.length > 0 ? requested : listSlugs()
  const general = readFlowFile(GENERAL_SLUG)
  const nicheFiles = listSlugs()
    .filter((s) => s !== GENERAL_SLUG)
    .map((s) => readFlowFile(s))

  let totalErrors = 0
  let totalWarnings = 0
  for (const slug of slugs) {
    const file = readFlowFile(slug)
    const problems = lintFile(slug, file, general, nicheFiles)
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
  // R18 cross-file: chip sets with no script. Reported once, on every run
  // that covers all files (a single-slug run has nothing to compare against).
  if (requested.length === 0) {
    const coverage = lintChipCoverage(nicheFiles)
    if (coverage.length > 0) {
      totalWarnings += coverage.length
      console.log(`WARN  ${'concern-options'.padEnd(28)} 0 error(s), ${coverage.length} warning(s)`)
      if (!quiet) {
        printProblems(coverage)
        console.log('')
      }
    }
  }
  console.log(`\n${slugs.length} file(s): ${totalErrors} error(s), ${totalWarnings} warning(s)`)
  process.exit(totalErrors > 0 ? 1 : 0)
}

/** Lower-case with straight quotes, a plain ellipsis and single spaces so phrase lists match either typography. */
export function normalisePhraseText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/\s+/g, ' ')
}

/** The last spoken line of a step, lowercased with quotes normalized. Empty when the step has no speech. */
export function closingLine(content: string): string {
  const spoken = spokenParagraphs(content)
  if (spoken.length === 0) return ''
  const last = spoken[spoken.length - 1].split('\n')
  return normalizeQuotes(last[last.length - 1]).toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * The obj_* screens a caller can reach in this flow, in the order the player
 * would resolve them: the file's own steps, then general's obj_* steps that
 * are not overridden but are the target of an effective choice. A step's
 * effective choices are the niche's own when it has any, else general's.
 */
function effectiveObjectionSteps(slug: string, file: FlowFile, general: FlowFile): EffectiveStep[] {
  const own = file.steps
    .filter((s) => s.step_key.startsWith(OBJECTION_PREFIX))
    .map((step) => ({ step, where: `${slug}:${step.step_key}` }))
  if (file === general || slug === GENERAL_SLUG) return own

  const ownKeys = new Set(file.steps.map((s) => s.step_key))
  const ownChoiceFrom = new Set(file.choices.map((c) => c.from_step_key))
  const routedTo = new Set<string>()
  for (const c of file.choices) routedTo.add(c.to_step_key)
  for (const c of general.choices) if (!ownChoiceFrom.has(c.from_step_key)) routedTo.add(c.to_step_key)

  const inherited = general.steps
    .filter((s) => s.step_key.startsWith(OBJECTION_PREFIX) && !ownKeys.has(s.step_key) && routedTo.has(s.step_key))
    .map((step) => ({ step, where: `${slug}:${step.step_key} (inherited from ${GENERAL_SLUG})` }))
  return [...own, ...inherited]
}

/** Questions in a spoken line: each "?" plus each parent-mode question token ({{pt_cost_ask}}, {{pt_floss_q}}). */
function questionsIn(line: string): number {
  const marks = (line.match(/\?/g) ?? []).length
  const tokens = tokensIn(line).filter((t) => /^pt_.*(_ask|_q\d*)$/.test(t)).length
  return marks + tokens
}

/**
 * R17: on a parent-mode niche the caller may be speaking with a parent, so
 * a chip's spoken phrase is injected into sentences ("take a look at
 * {{main_concern}}") that must read the same to either listener. The phrase
 * therefore carries no second-person word and no {{token}}: mergeScript is
 * single-pass and never re-expands tokens inside substituted values, so a
 * {{pt_your}} in a chip would reach the caller raw.
 *
 * Parent mode is derived from the flow file (any mode_parent* step), not
 * from a list of niche names, so a niche that gains a parent screen later
 * picks up the rule on its own.
 */
export function lintParentChips(slug: string, file: FlowFile): Problem[] {
  const problems: Problem[] = []
  if (!file.niche || !hasParentMode(file)) return problems
  const chips = CONCERN_OPTIONS[file.niche.name] ?? []
  for (const chip of chips) {
    const where = `${slug}:chip "${chip.label}"`
    const pronoun = SECOND_PERSON.exec(chip.spoken)
    if (pronoun) {
      problems.push({
        level: 'error',
        where,
        message: `R17 spoken phrase "${chip.spoken}" says "${pronoun[1]}"; this niche runs in parent mode, so write it pronoun-free ("the shifting", "how the smile looks in photos")`,
      })
    }
    if (chip.spoken.includes('{{')) {
      problems.push({
        level: 'error',
        where,
        message: `R17 spoken phrase "${chip.spoken}" contains a {{token}}; tokens inside a chip are never expanded, so the caller would read it raw`,
      })
    }
  }
  return problems
}

/** Whether the (normalised) review text reads a bucket back, verbatim, by a declared short form, or by all of its content words. */
function reviewNamesBucket(reviewText: string, bucket: string): boolean {
  if (reviewText.includes(bucket)) return true
  const equivalents = IMPACT_BUCKET_EQUIVALENTS[bucket] ?? []
  if (equivalents.some((e) => reviewText.includes(e))) return true
  const words = bucket
    .replace(/\{\{\s*[a-zA-Z0-9_]+\s*\}\}/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9'-]/g, ''))
    .filter((w) => w && !BUCKET_STOPWORDS.has(w))
  if (words.length === 0) return false
  return words.every((w) => new RegExp(`\\b${w.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`).test(reviewText))
}
/** Second-person words that misaddress a parent when spoken about the patient (R17). */
export const SECOND_PERSON = /\b(you|your|yours|yourself)\b/i


/**
 * Shorter ways the review screen may read a bucket back (R16). Keys are the
 * bucket exactly as the third question phrases it (lower-cased, straight
 * quotes, tokens kept); values are the accepted read-back phrases. A bucket
 * not listed here must appear on review with all of its content words.
 */
export const IMPACT_BUCKET_EQUIVALENTS: Record<string, string[]> = {
  'relaxing and doing your own thing': ['your own time', 'own time', 'relaxing', 'time to yourself'],
  'at home': ['home'],
}

/** Small words that carry no meaning when matching a bucket against the review screen. */
const BUCKET_STOPWORDS = new Set(['the', 'a', 'an', 'at', 'in', 'on', 'or', 'and', 'your', 'their', 'with', 'of', 'to'])

/**
 * The impact buckets a making_it_real* screen offers: the text of the third
 * spoken question after "interfere with", split on commas and "or". Null
 * when the screen has no third question in the R14 shape (it must open with
 * "When it's at its worst") or it names no buckets.
 */
export function impactBuckets(content: string): string[] | null {
  const questions = content
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p && !isCoachingNote(p) && p.includes('?'))
  const impact = questions[2]
  if (impact === undefined || !normalizeQuotes(impact).toLowerCase().startsWith(MAKING_IT_REAL_IMPACT_OPENER)) return null
  const lead = MAKING_IT_REAL_BUCKET_LEAD.exec(impact)
  if (lead === null) return null
  const tail = normalisePhraseText(impact.slice(lead.index + lead[0].length)).replace(/\?.*$/, '')
  const buckets = tail
    .split(/,\s*(?:or\s+)?|\s+or\s+/)
    .map((b) => b.trim())
    .filter(Boolean)
  return buckets.length > 0 ? buckets : null
}
/**
 * R18 (across files): every CONCERN_OPTIONS key should be the niche name of
 * some flow file; otherwise the chips can never be shown. Warn rather than
 * fail because a chip set may land a task ahead of its script.
 */
export function lintChipCoverage(nicheFiles: FlowFile[]): Problem[] {
  const names = new Set(nicheFiles.map((f) => f.niche?.name).filter((n): n is string => Boolean(n)))
  return Object.keys(CONCERN_OPTIONS)
    .filter((key) => !names.has(key))
    .map((key) => ({
      level: 'warn' as const,
      where: 'concern-options',
      message: `R18 CONCERN_OPTIONS["${key}"] matches no flow file's niche name (chips are never shown; rename the key to the niche's exact name or add the flow)`,
    }))
}

/**
 * R18 (per file): a niche flow file must have a CONCERN_OPTIONS entry under
 * the niche name in its niche block. The player picks chips with
 * CONCERN_OPTIONS[niche.name], so a missing entry means the question screen
 * shows no chips and {{main_concern}} renders as the generic fallback.
 */
export function lintChipPresence(slug: string, file: FlowFile): Problem[] {
  if (!file.niche || slug === GENERAL_SLUG) return []
  const name = file.niche.name
  if (CHIPLESS_NICHES.has(name)) return []
  const chips = CONCERN_OPTIONS[name]
  if (chips && chips.length > 0) return []
  return [{
    level: 'error',
    where: slug,
    message: chips
      ? `R18 CONCERN_OPTIONS["${name}"] is empty; callers get the generic question screen (add chips in lib/niche-catalog or allow-list the niche in CHIPLESS_NICHES)`
      : `R18 no CONCERN_OPTIONS entry for niche "${name}" (lib/niche-catalog/src/concern-options.ts); callers get the generic question screen (add chips under that exact name or allow-list the niche in CHIPLESS_NICHES)`,
  }]
}

// CLI entrypoint. Keep this last: main() reads top-level constants declared
// below the functions that use them, and a call above them throws a TDZ
// ReferenceError at runtime that import-only unit tests never see.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
