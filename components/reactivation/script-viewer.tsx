'use client'

import { useMemo, useState } from 'react'
import { AArrowDown, AArrowUp } from 'lucide-react'
import { setSelectedNiche } from '@/app/actions/reactivation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScriptFlowPlayer } from '@/components/reactivation/script-flow-player'
import type { Niche, ScriptFlowChoice, ScriptFlowStep } from '@/lib/types'

const FONT_SIZES = [16, 18, 20, 24, 28, 32, 36, 40]

interface Props {
  niches: Niche[]
  steps: ScriptFlowStep[]
  choices: ScriptFlowChoice[]
  initialNicheId: string | null
  callerName?: string
  practiceName?: string | null
  isProvider?: boolean
  /** Optional deep link: open the player at this step (review/debug use). */
  initialStepKey?: string | null
}

export function ScriptViewer({
  niches,
  steps,
  choices,
  initialNicheId,
  callerName,
  practiceName,
  isProvider = false,
  initialStepKey = null,
}: Props) {
  // Only honor the saved niche if it belongs to this account's sector(s);
  // otherwise fall back to the first available niche.
  const validInitial =
    initialNicheId && niches.some((n) => n.id === initialNicheId)
      ? initialNicheId
      : (niches[0]?.id ?? '')
  const [nicheId, setNicheId] = useState<string>(validInitial)
  const [sizeIndex, setSizeIndex] = useState(2) // 20px default

  const extras = useMemo(() => {
    const sector = niches.find((n) => n.id === nicheId)?.sector ?? 'healthcare'
    const person = sector === 'healthcare' ? '[patient name]' : '[customer name]'
    const e: Record<string, string> = {
      contact_first_name: person,
      contact_full_name: person,
    }
    if (callerName) {
      e.caller_name = callerName
      e.your_name = callerName
    }
    if (practiceName) {
      e.practice_name = practiceName
      e.provider_name = practiceName
    }
    // Role-aware pronouns: the provider says "I / me", everyone else
    // speaks for the practice with "we / us".
    e.rec_pronoun = isProvider ? 'I' : 'we'
    e.rec_pronoun_cap = isProvider ? 'I' : 'We'
    e.rec_obj = isProvider ? 'me' : 'us'
    e.rec_poss = isProvider ? 'my' : 'our'
    // Credibility line in the Professional Open: staff callers borrow the
    // provider's authority; the provider speaks for themselves.
    e.asked_by_provider = isProvider
      ? 'I wanted to reach out to you personally.'
      : `${e.provider_name ?? '[PROVIDER NAME]'} asked me to reach out to you personally.`
    return e
  }, [callerName, practiceName, niches, nicheId, isProvider])

  function handleNicheChange(id: string | null) {
    if (!id) return
    setNicheId(id)
    void setSelectedNiche(id)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select
          value={nicheId}
          onValueChange={handleNicheChange}
          items={niches.map((n) => ({ value: n.id, label: n.name }))}
        >
          <SelectTrigger className="w-44" aria-label="Select niche">
            <SelectValue placeholder="Select niche" />
          </SelectTrigger>
          <SelectContent>
            {niches.map((n) => (
              <SelectItem key={n.id} value={n.id}>
                {n.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div
          className="flex items-center rounded-md border border-input"
          role="group"
          aria-label="Font size"
        >
          <button
            type="button"
            onClick={() => setSizeIndex((i) => Math.max(0, i - 1))}
            disabled={sizeIndex === 0}
            className="flex size-9 items-center justify-center rounded-l-md text-foreground transition-colors hover:bg-muted disabled:opacity-40"
            aria-label="Decrease font size"
          >
            <AArrowDown className="size-4" />
          </button>
          <span className="border-x border-input px-2 text-xs tabular-nums text-muted-foreground">
            {FONT_SIZES[sizeIndex]}px
          </span>
          <button
            type="button"
            onClick={() =>
              setSizeIndex((i) => Math.min(FONT_SIZES.length - 1, i + 1))
            }
            disabled={sizeIndex === FONT_SIZES.length - 1}
            className="flex size-9 items-center justify-center rounded-r-md text-foreground transition-colors hover:bg-muted disabled:opacity-40"
            aria-label="Increase font size"
          >
            <AArrowUp className="size-4" />
          </button>
        </div>
      </div>

      <ScriptFlowPlayer
        key={nicheId}
        steps={steps}
        choices={choices}
        nicheId={nicheId || null}
        extras={extras}
        fontSize={FONT_SIZES[sizeIndex]}
        initialStepKey={initialStepKey}
      />
    </div>
  )
}
