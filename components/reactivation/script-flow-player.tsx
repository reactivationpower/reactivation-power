'use client'

import { useMemo, useState } from 'react'
import { ArrowLeft, Crosshair, MousePointerClick, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  CONCERN_FALLBACK,
  type ConcernOption,
} from '@/lib/concern-options'
import {
  COMPLAINT_FALLBACK,
  mergeScript,
  stripComplaintClause,
} from '@/lib/script-merge'
import { cn } from '@/lib/utils'
import type {
  ScriptFlowChoice,
  ScriptFlowStep,
  ScriptFlowVariant,
} from '@/lib/types'

interface Props {
  steps: ScriptFlowStep[]
  choices: ScriptFlowChoice[]
  nicheId: string | null
  extras: Record<string, string>
  fontSize: number
  /** Optional deep link: start the player at this step instead of the first screen. */
  initialStepKey?: string | null
  /** Main-concern capture chips for this niche (clinical niches only).
   * Shown on the questions screen; the tapped concern fills the
   * {{main_concern}} token on every later screen. */
  concernOptions?: ConcernOption[]
  }

// Relationship tokens: scripts can use {{pt_*}} slots that resolve
// differently when the caller is speaking with a parent/guardian instead of
// the patient. Parent mode turns on when the trail passes through a step
// whose key starts with "mode_parent" (reached from a "who's on the phone"
// screen). Niches without pt_ tokens are unaffected.
const PATIENT_TOKENS: Record<string, string> = {
  pt_you: 'you',
  pt_you_cap: 'You',
  pt_your: 'your',
  pt_them: 'you',
  pt_they_are: 'you\u2019re',
  pt_get_you_in: 'get you in',
  pt_no_fault: 'it\u2019s not anything you did wrong',
  pt_proud: 'you were so proud of it',
  pt_bite_q:
    'Any changes in the bite \u2014 teeth hitting differently than they used to, or one side doing more of the chewing work?',
  pt_jaw_q:
    'Any jaw soreness, clicking, or tension headaches, especially in the morning?',
  pt_photos_q:
    'And how do you feel about the smile in photos these days \u2014 still showing it off, or any creeping self-consciousness?',
  pt_obj_braces_q: 'Do I have to get braces again?',
  pt_obj_startover_q: 'Do I have to start all over?',
  pt_obj_embarrassed_q: 'I\u2019m embarrassed I stopped wearing my retainer',
  pt_al_photos_q:
    'And how do you feel about your smile in photos and on video calls these days? Be honest \u2014 do you still catch yourself doing the closed-lip smile, or angling away from the camera?',
  pt_moved_back_q: 'does it feel like they\u2019ve moved back quite a bit',
  pt_your_file: 'your file',
  pt_smile_bite: 'the smile and the bite',
  pt_mir_q1: 'how long has that been bothering you',
  pt_mir_q2:
    'is it something you notice here and there, or pretty much every time you see your smile',
  pt_mir_q3:
    'when it\u2019s on your mind, how does it affect your confidence, your photos, the way you feel meeting people',
  pt_floss_q:
    'How about flossing \u2014 any spots where the floss catches, shreds, or just won\u2019t go in? Crowded teeth create tight corners that are almost impossible to keep clean.',
  pt_clean_q:
    'How about cleaning \u2014 any tight spots where the floss catches, shreds, or won\u2019t go in?',
  pt_invested: 'the result you invested in',
  pt_uncover_action:
    'coming in to take care of something you\u2019ve told me is bothering you',
  pt_cost_ask:
    'Can I ask \u2014 how much does getting back to feeling the way you did matter to you?',
  pt_bridge_q:
    'you\u2019d really just love to get back to loving your smile again \u2014 showing it off without a second thought',
}

const PARENT_TOKENS: Record<string, string> = {
  pt_you: 'your child',
  pt_you_cap: 'Your child',
  pt_your: 'their',
  pt_them: 'them',
  pt_they_are: 'they\u2019re',
  pt_get_you_in: 'get your child in',
  pt_no_fault: 'it\u2019s not anything you or your child did wrong',
  pt_proud: 'they were so proud of it',
  pt_bite_q:
    'Has your child mentioned any changes in the bite \u2014 teeth hitting differently than they used to, or chewing more on one side?',
  pt_jaw_q:
    'Any complaints of jaw soreness, clicking, or headaches, especially in the morning?',
  pt_photos_q:
    'And how does your child feel about their smile these days \u2014 still showing it off, or any covering the mouth in photos or teasing at school?',
  pt_obj_braces_q: 'Does my child have to get braces again?',
  pt_obj_startover_q: 'Does my child have to start all over?',
  pt_obj_embarrassed_q: 'I feel bad we let the retainer routine slip',
  pt_al_photos_q:
    'And how does your child feel about their smile these days \u2014 still showing it off, or any covering the mouth in photos or teasing at school?',
  pt_moved_back_q: 'are you seeing that they\u2019ve moved back quite a bit',
  pt_your_file: 'your child\u2019s file',
  pt_smile_bite: 'their smile and bite',
  pt_mir_q1: 'how long has this been on your child\u2019s mind',
  pt_mir_q2:
    'do they notice it here and there, or pretty much every time they see their smile',
  pt_mir_q3:
    'when it\u2019s on their mind, how does it show up in their confidence at school, in photos, around friends',
  pt_floss_q:
    'How about your child\u2019s flossing \u2014 have they mentioned any spots where the floss catches or shreds? Crowded teeth create tight corners that are almost impossible to keep clean.',
  pt_clean_q:
    'How about your child\u2019s cleaning \u2014 have they mentioned any tight spots where the floss catches or shreds?',
  pt_invested: 'the result you\u2019ve both invested in',
  pt_uncover_action:
    'getting them in to take care of something you\u2019ve told me has been bothering them',
  pt_cost_ask:
    'And taking a look is exactly what lets us see what \u2014 if anything \u2014 is actually needed, so the office can give you a real answer on cost instead of a guess. One thing worth knowing: catching it early usually means a small tweak, and a small tweak is always going to be faster and less expensive than waiting until things have really shifted.',
  pt_bridge_q:
    'you\u2019d really just love to see them loving their smile again \u2014 showing it off without a second thought',
}

const CHOICE_STYLES: Record<ScriptFlowVariant, string> = {
  positive: '',
  caution:
    'border-accent/50 bg-accent/10 text-foreground hover:bg-accent/20',
  negative:
    'border-destructive/40 bg-destructive/10 text-foreground hover:bg-destructive/15',
  objection:
    'border-border bg-muted text-foreground hover:bg-muted/70',
  default: 'border-border bg-card text-foreground hover:bg-muted',
}

export function ScriptFlowPlayer({
  steps,
  choices,
  nicheId,
  extras,
  fontSize,
  initialStepKey,
  concernOptions,
}: Props) {
  // Resolve niche overrides: a niche row with the same step_key replaces the
  // general row; a niche's choice set for a step replaces the general set.
  const { stepMap, choiceMap, startKey } = useMemo(() => {
    const stepMap = new Map<string, ScriptFlowStep>()
    for (const s of steps) {
      if (s.niche_id === null && !stepMap.has(s.step_key)) {
        stepMap.set(s.step_key, s)
      }
    }
    if (nicheId) {
      for (const s of steps) {
        if (s.niche_id === nicheId) stepMap.set(s.step_key, s)
      }
    }

    const generalChoices = new Map<string, ScriptFlowChoice[]>()
    const nicheChoices = new Map<string, ScriptFlowChoice[]>()
    for (const c of choices) {
      if (c.niche_id === null) {
        const list = generalChoices.get(c.from_step_key) ?? []
        list.push(c)
        generalChoices.set(c.from_step_key, list)
      } else if (nicheId && c.niche_id === nicheId) {
        const list = nicheChoices.get(c.from_step_key) ?? []
        list.push(c)
        nicheChoices.set(c.from_step_key, list)
      }
    }
    const choiceMap = new Map<string, ScriptFlowChoice[]>(generalChoices)
    for (const [key, list] of nicheChoices) choiceMap.set(key, list)

    const ordered = [...stepMap.values()].sort(
      (a, b) => a.sort_order - b.sort_order,
    )
    return { stepMap, choiceMap, startKey: ordered[0]?.step_key ?? null }
  }, [steps, choices, nicheId])

  const [currentKey, setCurrentKey] = useState<string | null>(
    initialStepKey && stepMap.has(initialStepKey) ? initialStepKey : startKey,
  )
  const [trail, setTrail] = useState<string[]>([])

  // Main-concern capture: the caller taps the patient's answer to the magic
  // question on the questions screen. Last tap wins. "Other" opens a small
  // type-in. The choice fills {{main_concern}} on every later screen; when
  // nothing is tapped the token falls back to a generic phrase so the script
  // never breaks.
  const [concern, setConcern] = useState<ConcernOption | null>(null)
  const [otherOpen, setOtherOpen] = useState(false)
  const [otherText, setOtherText] = useState('')

  // Concern-aware step swap (ChiroThin): a non-weight concern replaces the
  // weight-anchored Making It Real with its non-weight variant. The trail
  // still records 'making_it_real', so Back navigation is unaffected.
  const concernIsNonWeight = concern?.weightRelated === false
  const resolvedKey =
    currentKey === 'making_it_real' &&
    concernIsNonWeight &&
    stepMap.has('making_it_real_nw')
      ? 'making_it_real_nw'
      : currentKey
  const step = resolvedKey ? (stepMap.get(resolvedKey) ?? null) : null
  const allStepChoices = step ? (choiceMap.get(step.step_key) ?? []) : []

  // Path awareness: did the caller come through the kept-the-weight-off path?
  const KEPT_PATH_KEYS = ['resp_doing_great', 'transition_kept', 'digging_in_kept']
  const cameViaKeptPath = trail.some((k) => KEPT_PATH_KEYS.includes(k))

  // Concern-aware uncover screen (ChiroThin): when the tapped concern is
  // explicitly non-weight (weightRelated: false), the weight-assuming
  // objections are swapped for chiropractic-style handling. A weight chip,
  // "Other", the original-complaint chip, or no chip keeps today's set.
  // Kept-it-off path additionally hides the weight-focused cost objection.
  const WEIGHT_ONLY_OBJECTIONS = [
    'obj_do_it_myself',
    'obj_embarrassed',
    'obj_cost_weight',
  ]
  const NONWEIGHT_ONLY_OBJECTIONS = [
    'obj_nw_thought_behind_me',
    'obj_nw_chiro_didnt_help',
  ]

  let stepChoices = allStepChoices
  if (step?.step_key === 'uncover') {
    stepChoices = concernIsNonWeight
      ? stepChoices.filter(
          (c) => !WEIGHT_ONLY_OBJECTIONS.includes(c.to_step_key ?? ''),
        )
      : stepChoices.filter(
          (c) => !NONWEIGHT_ONLY_OBJECTIONS.includes(c.to_step_key ?? ''),
        )
    if (cameViaKeptPath) {
      stepChoices = stepChoices.filter(
        (c) => c.to_step_key !== 'obj_cost_weight',
      )
    }
  }

  // Parent/guardian mode: on when the trail passed through a mode_parent
  // marker step. Marker steps (key prefix "mode_") are recorded in the trail
  // but never displayed \u2014 navigation passes straight through them.
  const parentMode = trail.some((k) => k.startsWith('mode_parent'))

  // {{complaint_reference}} resolution, best source first:
  // 1. documented condition from the contact record (arrives via extras)
  // 2. the concern the patient named during this call (tapped chip)
  // 3. generic fallback phrase — and on the opening question the optional
  //    "especially with ..." clause is dropped entirely instead.
  // The generic fallback phrase doesn't count as a real complaint here:
  // "especially with" clauses read awkwardly with it, so they still drop.
  const concernSpoken = concern?.spoken?.trim()
  const hasComplaint = Boolean(
    extras.complaint_reference ||
      (concernSpoken && concernSpoken !== COMPLAINT_FALLBACK),
  )

  const effectiveExtras = useMemo(
    () => ({
      ...(parentMode ? PARENT_TOKENS : PATIENT_TOKENS),
      complaint_reference:
        extras.complaint_reference ||
        concern?.spoken?.trim() ||
        COMPLAINT_FALLBACK,
      ...extras,
      main_concern: concern?.spoken?.trim() || CONCERN_FALLBACK,
    }),
    [extras, parentMode, concern],
  )

  const paragraphs = useMemo(() => {
    if (!step) return []
    const body = hasComplaint
      ? step.content
      : stripComplaintClause(step.content)
    return mergeScript(body, [], effectiveExtras)
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean)
  }, [step, effectiveExtras, hasComplaint])

  function go(choice: ScriptFlowChoice) {
    if (!choice.to_step_key || !stepMap.has(choice.to_step_key)) return
    const target = choice.to_step_key
    if (target.startsWith('mode_')) {
      // Pass through the marker: record it in the trail, land on its
      // single onward destination so the caller never sees an extra screen.
      const onward = (choiceMap.get(target) ?? [])[0]?.to_step_key
      if (onward && stepMap.has(onward)) {
        setTrail((t) => [...t, currentKey!, target])
        setCurrentKey(onward)
        return
      }
    }
    setTrail((t) => [...t, currentKey!])
    setCurrentKey(target)
  }

  function back() {
    setTrail((t) => {
      // Skip over pass-through marker steps when stepping back.
      let i = t.length - 1
      while (i >= 0 && t[i].startsWith('mode_')) i--
      if (i < 0) return t
      setCurrentKey(t[i])
      return t.slice(0, i)
    })
  }

  function restart() {
    setTrail([])
    setCurrentKey(startKey)
    setConcern(null)
    setOtherOpen(false)
    setOtherText('')
  }

  function pickConcern(option: ConcernOption) {
    setConcern(option)
    setOtherOpen(false)
  }

  // Original-complaint chip: always first on the questions screen, so the
  // most common answer to the magic question ("the thing I originally came
  // in for") is a one-tap capture. When the office documented a condition,
  // the chip shows and speaks it; when not, a generic chip fills the
  // fallback phrase so the script ahead still reads naturally.
  const originalChip = useMemo<ConcernOption>(() => {
    const documented = extras.complaint_reference?.trim()
    if (documented) {
      const display = documented.replace(/^the\s+/i, '')
      return {
        label: `${display.charAt(0).toUpperCase()}${display.slice(1)} (original)`,
        spoken: documented,
      }
    }
    return { label: 'Original complaint', spoken: COMPLAINT_FALLBACK }
  }, [extras.complaint_reference])

  if (!step) {
    return (
      <article className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">
        No interactive script has been published yet.
      </article>
    )
  }

  const isObjection = step.step_key.startsWith('obj_')

  return (
    <article
      className="overflow-hidden rounded-lg border border-border bg-card"
      aria-label="Interactive call script"
    >
      {/* Step header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/50 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          {isObjection && (
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
              Objection
            </span>
          )}
          {parentMode && (
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent-foreground">
              Parent/guardian wording
            </span>
          )}
          {concern && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              <Crosshair className="size-3" />
              {concern.label}
            </span>
          )}
          <h2 className="text-sm font-semibold text-foreground">
            {step.title}
          </h2>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={back}
            disabled={trail.length === 0}
          >
            <ArrowLeft className="size-3.5" />
            Back
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={restart}
            disabled={trail.length === 0}
          >
            <RotateCcw className="size-3.5" />
            Restart
          </Button>
        </div>
      </div>

      {/* Script text */}
      <div className="px-5 py-6 sm:px-8">
        <div
          className="mx-auto flex max-w-2xl flex-col gap-5"
          style={{ fontSize }}
        >
          {paragraphs.map((p, i) =>
            /^\(?let them answer/i.test(p) ? (
              <p
                key={i}
                className="leading-relaxed text-muted-foreground italic"
                style={{
                  fontSize: Math.max(14, fontSize * 0.85),
                  paddingLeft: '7ch',
                }}
              >
                {p}
              </p>
            ) : p.startsWith('(') && p.endsWith(')') ? (
              <p
                key={i}
                className="leading-relaxed text-muted-foreground italic"
                style={{ fontSize: Math.max(14, fontSize * 0.85) }}
              >
                {p}
              </p>
            ) : (
              <p key={i} className="leading-relaxed text-foreground">
                {p}
              </p>
            ),
          )}
        </div>
      </div>

      {/* Main-concern capture: shown on the questions screen for niches with
          a concern list. Tapping records the patient's answer to the magic
          question; the routing buttons below still control navigation. */}
      {step.step_key.startsWith('digging_in') &&
        concernOptions &&
        concernOptions.length > 0 && (
          <div className="border-t border-border bg-primary/5 px-5 py-4 sm:px-8">
            <p className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Crosshair className="size-3.5" />
              Tap their answer — which one do they want gone?
            </p>
            <div className="flex flex-wrap gap-2">
              {[originalChip, ...concernOptions].map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => pickConcern(opt)}
                  aria-pressed={concern?.label === opt.label}
                  className={cn(
                    'inline-flex min-h-10 items-center rounded-full border px-4 py-2 text-sm font-medium transition-colors',
                    concern?.label === opt.label && !otherOpen
                      ? 'border-primary bg-primary text-primary-foreground'
                      : opt === originalChip
                        ? 'border-primary/40 bg-primary/5 text-foreground hover:bg-primary/10'
                        : 'border-border bg-card text-foreground hover:bg-muted',
                  )}
                >
                  {opt.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setOtherOpen(true)
                  if (otherText.trim()) {
                    setConcern({ label: 'Other', spoken: otherText.trim() })
                  }
                }}
                aria-pressed={otherOpen}
                className={cn(
                  'inline-flex min-h-10 items-center rounded-full border px-4 py-2 text-sm font-medium transition-colors',
                  otherOpen
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-dashed border-border bg-card text-muted-foreground hover:bg-muted',
                )}
              >
                Other…
              </button>
            </div>
            {otherOpen && (
              <div className="mt-3 flex max-w-md items-center gap-2">
                <Input
                  autoFocus
                  value={otherText}
                  placeholder="Type it as you’d say it, e.g. “the dizziness”"
                  onChange={(e) => {
                    setOtherText(e.target.value)
                    setConcern(
                      e.target.value.trim()
                        ? { label: 'Other', spoken: e.target.value.trim() }
                        : null,
                    )
                  }}
                />
              </div>
            )}
            {concern && !otherOpen && (
              <p className="mt-3 text-xs text-muted-foreground">
                The script ahead will now say{' '}
                <span className="font-medium text-foreground">
                  “{concern.spoken}”
                </span>
                . Tap a different chip if they change their answer.
              </p>
            )}
          </div>
        )}

      {/* Choice buttons */}
      <div className="border-t border-border bg-muted/30 px-5 py-4 sm:px-8">
        {stepChoices.length > 0 ? (
          <>
            <p className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <MousePointerClick className="size-3.5" />
              {stepChoices.length > 1
                ? 'Click what you hear'
                : 'When you\u2019re ready'}
            </p>
            <div className="flex flex-wrap gap-2">
              {stepChoices.map((c) =>
                c.variant === 'positive' ? (
                  <Button
                    key={c.id}
                    size="lg"
                    className="h-auto min-h-11 whitespace-normal py-2.5 text-left"
                    onClick={() => go(c)}
                  >
                    {mergeScript(c.label, [], effectiveExtras)}
                  </Button>
                ) : (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => go(c)}
                    className={cn(
                      'inline-flex min-h-11 items-center rounded-md border px-4 py-2.5 text-sm font-medium transition-colors',
                      CHOICE_STYLES[c.variant] ?? CHOICE_STYLES.default,
                    )}
                  >
                    {mergeScript(c.label, [], effectiveExtras)}
                  </button>
                ),
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            End of script — add your notes and log the call outcome below.
          </p>
        )}
      </div>
    </article>
  )
}
