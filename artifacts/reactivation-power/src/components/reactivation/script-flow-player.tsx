// @ts-nocheck

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  Crosshair,
  MousePointerClick,
  RotateCcw,
  Voicemail,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  CONCERN_FALLBACK,
  type ConcernOption,
} from '@workspace/niche-catalog'
import {
  complaintFallbackFor,
  isComplaintFallback,
  mergeScript,
  stripComplaintClause,
} from '@workspace/shared/script-merge'
import { cn } from '@/lib/utils'
import { PARENT_TOKENS, PATIENT_TOKENS } from '@workspace/script-tokens'
import type {
  ScriptFlowChoice,
  ScriptFlowStep,
  ScriptFlowVariant,
  Sector,
} from '@workspace/shared/types'

interface Props {
  steps: ScriptFlowStep[]
  choices: ScriptFlowChoice[]
  nicheId: string | null
  /** Sector of the selected niche. Home-services niches get a house-call
   * phrasing for the generic "Original complaint" chip ("what we originally
   * came out for"); healthcare (the default) keeps "what you originally came
   * in for". */
  sector?: Sector | null
  extras: Record<string, string>
  fontSize: number
  /** Optional entry point: start (and restart) the player at this step instead of the first screen. */
  initialStepKey?: string | null
  /** Fires with the step_key every time the screen changes, including the first render. */
  onStepChange?: (stepKey: string) => void
  /** Main-concern capture chips for this niche (clinical niches only).
   * Shown on the questions screen; the tapped concern fills the
   * {{main_concern}} token on every later screen. */
  concernOptions?: ConcernOption[]
  /** When true, show the "Leave VM" chip on the opener step (every 2nd call). */
  showLeaveVm?: boolean
  /** Opens the voicemail script dialog (owned by the call screen). */
  onLeaveVoicemail?: () => void
  /** Practice player (no contact loaded): the notes box and disposition
   * buttons the scripts refer to are rendered as a disabled preview by the
   * practice screen, so end-of-script copy must not promise a real log. */
  practice?: boolean
  /** Which script family is playing. Lead flows talk to people who have
   * never visited, so the reactivation-only "Original complaint" chip (and
   * its "what you originally came in for" wording) is replaced by a chip
   * anchored on the form they submitted. */
  flowKind?: 'reactivation' | 'lead'
}

/** First concern chip on a LEAD questions screen: the thing they filled the form about. */
export const LEAD_FIRST_CHIP: ConcernOption = {
  label: 'What they reached out about',
  spoken: 'what you reached out about',
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
  sector,
  extras,
  fontSize,
  initialStepKey,
  onStepChange,
  concernOptions,
  flowKind = 'reactivation',
  showLeaveVm = false,
  onLeaveVoicemail,
  practice = false,
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

  const entryKey = initialStepKey && stepMap.has(initialStepKey) ? initialStepKey : startKey
  const [currentKey, setCurrentKey] = useState<string | null>(entryKey)
  const [trail, setTrail] = useState<string[]>([])
  useEffect(() => {
    if (currentKey) onStepChange?.(currentKey)
    // Only the screen change matters; a new callback identity should not re-fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey])

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
  const complaintFallback = complaintFallbackFor(sector)
  const concernSpoken = concern?.spoken?.trim()
  const hasComplaint = Boolean(
    extras.complaint_reference ||
      (concernSpoken && !isComplaintFallback(concernSpoken)),
  )

  const effectiveExtras = useMemo(
    () => ({
      ...(parentMode ? PARENT_TOKENS : PATIENT_TOKENS),
      complaint_reference:
        extras.complaint_reference ||
        concern?.spoken?.trim() ||
        complaintFallback,
      ...extras,
      main_concern: concern?.spoken?.trim() || CONCERN_FALLBACK,
    }),
    [extras, parentMode, concern, complaintFallback],
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
    setCurrentKey(entryKey)
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
    return { label: 'Original complaint', spoken: complaintFallback }
  }, [extras.complaint_reference, complaintFallback])
  const firstChip = flowKind === 'lead' ? LEAD_FIRST_CHIP : originalChip

  if (!step) {
    return (
      <article className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">
        No interactive script has been published yet.
      </article>
    )
  }

  const isObjection = step.step_key.startsWith('obj_')
  // The opener is the entry step. If nobody picks up here, this is where the
  // caller leaves a voicemail — so the "Leave VM" chip lives on this screen.
  const isStartStep = step.step_key === entryKey
  const canLeaveVm = isStartStep && showLeaveVm && Boolean(onLeaveVoicemail)

  return (
    <article
      className="overflow-hidden rounded-lg border border-border bg-card"
      aria-label="Interactive call script"
    >
      {nicheId && steps.some((s) => s.niche_id === nicheId && s.step_key === 'obj_chamber_anxiety') && (
        <details className="border-b border-border px-4 py-3 text-sm sm:px-6">
          <summary className="cursor-pointer font-medium">HBOT clinical handoff guidance</summary>
          <div className="mt-2 space-y-2 text-muted-foreground">
            <p>Caller instructions—not for reading aloud. Book review visits only, not treatment sessions.</p>
            <p>If a patient describes a prior reaction, pause treatment booking, write down their exact words, and pass the concern to the clinical team. Do not say it is normal or harmless, or advise on medication.</p>
            <p>For an urgent concern, stop the ordinary script and follow the office’s clinician-approved urgent and emergency guidance. Do not judge urgency yourself. Notify the clinical team.</p>
          </div>
        </details>
      )}
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
              // A bullet list (campaign offer items) keeps its line breaks;
              // every other paragraph flows as prose.
              <p
                key={i}
                className={cn(
                  'leading-relaxed text-foreground',
                  p.includes('\u2022 ') && 'whitespace-pre-line',
                )}
              >
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
              Tap their answer: which one do they want gone?
            </p>
            <div className="flex flex-wrap gap-2">
              {[firstChip, ...concernOptions].map((opt) => (
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
              {canLeaveVm && (
                <button
                  type="button"
                  onClick={onLeaveVoicemail}
                  className="inline-flex min-h-11 items-center gap-2 rounded-md border border-accent/50 bg-accent/10 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent/20"
                >
                  <Voicemail className="size-4 text-accent" />
                  No answer? Leave a voicemail
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              {practice
                ? 'End of script. On a live call you would add your notes and log the outcome below; in practice mode those controls are shown but switched off.'
                : 'End of script. Add your notes and log the call outcome below.'}
            </p>
            {canLeaveVm && (
              <div>
                <button
                  type="button"
                  onClick={onLeaveVoicemail}
                  className="inline-flex min-h-11 items-center gap-2 rounded-md border border-accent/50 bg-accent/10 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent/20"
                >
                  <Voicemail className="size-4 text-accent" />
                  No answer? Leave a voicemail
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  )
}
