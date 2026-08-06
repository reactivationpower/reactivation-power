'use client'

import { useMemo, useState } from 'react'
import { ArrowLeft, MousePointerClick, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { mergeScript } from '@/lib/script-merge'
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

  const [currentKey, setCurrentKey] = useState<string | null>(startKey)
  const [trail, setTrail] = useState<string[]>([])

  const step = currentKey ? (stepMap.get(currentKey) ?? null) : null
  const stepChoices = step ? (choiceMap.get(step.step_key) ?? []) : []

  const paragraphs = useMemo(() => {
    if (!step) return []
    return mergeScript(step.content, [], extras)
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean)
  }, [step, extras])

  function go(choice: ScriptFlowChoice) {
    if (!choice.to_step_key || !stepMap.has(choice.to_step_key)) return
    setTrail((t) => [...t, currentKey!])
    setCurrentKey(choice.to_step_key)
  }

  function back() {
    setTrail((t) => {
      if (t.length === 0) return t
      setCurrentKey(t[t.length - 1])
      return t.slice(0, -1)
    })
  }

  function restart() {
    setTrail([])
    setCurrentKey(startKey)
  }

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
                    {c.label}
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
                    {c.label}
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
