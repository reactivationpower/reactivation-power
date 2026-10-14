// @ts-nocheck

import { useMemo, useState } from 'react'
import { AArrowDown, AArrowUp } from 'lucide-react'
import { setSelectedNiche } from '@/app/actions/reactivation'
import {
  providerTokens,
  spokenProviderName,
  type ProviderSource,
} from '@/lib/provider-name'
import { NicheSelect } from '@/components/reactivation/niche-select'
import { ScriptFlowPlayer } from '@/components/reactivation/script-flow-player'
import { PracticeLogPreview } from '@/components/reactivation/practice-log-preview'
import { CONCERN_OPTIONS } from '@workspace/niche-catalog'
import {
  HBOT_CONCERN_OPTIONS,
  HBOT_DRAFT_NICHE_ID,
  HBOT_DRAFT_SCREENS,
  hbotDraftChoices,
  hbotDraftSteps,
  withHbotDraft,
} from '@/lib/hbot-draft'
import type { Niche, ScriptFlowChoice, ScriptFlowStep } from '@workspace/shared/types'

const FONT_SIZES = [16, 18, 20, 24, 28, 32, 36, 40]

interface Props {
  niches: Niche[]
  steps: ScriptFlowStep[]
  choices: ScriptFlowChoice[]
  initialNicheId: string | null
  callerName?: string
  practiceName?: string | null
  /** Account owner; the provider's spoken name is derived from it. */
  owner?: ProviderSource | null
  isProvider?: boolean
  /** Optional deep link: open the player at this step (review/debug use). */
  initialStepKey?: string | null
  /** Practice-script page only: backend says the review-only HBOT draft may be shown. */
  hbotDraftAvailable?: boolean
}

export function ScriptViewer({
  niches: realNiches,
  steps,
  choices,
  initialNicheId,
  callerName,
  practiceName,
  owner = null,
  isProvider = false,
  initialStepKey = null,
  hbotDraftAvailable = false,
}: Props) {
  const niches = useMemo(
    () => withHbotDraft(realNiches, hbotDraftAvailable),
    [realNiches, hbotDraftAvailable],
  )
  const [draftScreen, setDraftScreen] = useState<string | null>(null)
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
    if (practiceName) e.practice_name = practiceName
    // Role-aware pronouns: the provider says "I / me", everyone else
    // speaks for the practice with "we / us".
    e.rec_pronoun = isProvider ? 'I' : 'we'
    e.rec_pronoun_cap = isProvider ? 'I' : 'We'
    e.rec_obj = isProvider ? 'me' : 'us'
    e.rec_poss = isProvider ? 'my' : 'our'
    // Same provider fill-in as the live call screen ("Dr. Whitaker", or
    // "the whole office" when there is no doctor on file).
    Object.assign(e, providerTokens(spokenProviderName(owner, sector), isProvider))
    return e
  }, [callerName, practiceName, owner, niches, nicheId, isProvider])

  function handleNicheChange(id: string | null) {
    if (!id) return
    setNicheId(id)
    // The synthetic review draft is local only: never persisted.
    if (id === HBOT_DRAFT_NICHE_ID) return
    void setSelectedNiche(id)
  }

  const isDraft = hbotDraftAvailable && nicheId === HBOT_DRAFT_NICHE_ID
  const draftEntry =
    draftScreen ??
    (initialStepKey && hbotDraftSteps.some((x) => x.step_key === initialStepKey)
      ? initialStepKey
      : null)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <NicheSelect
          value={nicheId}
          onValueChange={handleNicheChange}
          items={niches.map((n) => ({ value: n.id, label: n.name }))}
          className="w-80"
          aria-label="Select niche"
        />

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

      {isDraft && (
        <div className="flex flex-col gap-3">
          <div
            role="note"
            data-testid="hbot-draft-warning"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-foreground"
          >
            <strong>Review draft only.</strong> This HBOT script is not clinically
            approved. Do not use it for patient calls or treatment booking.
          </div>
          <label className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            Jump to screen
            <select
              data-testid="select-hbot-draft-screen"
              value={draftScreen ?? ''}
              onChange={(e) => setDraftScreen(e.target.value || null)}
              className="h-9 rounded-md border border-input bg-card px-2 text-foreground"
            >
              <option value="">Start of script</option>
              {HBOT_DRAFT_SCREENS.map((sc) => (
                <option key={sc.key} value={sc.key}>
                  {sc.title}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <ScriptFlowPlayer
        key={isDraft ? `${nicheId}:${draftScreen ?? ''}` : nicheId}
        steps={isDraft ? hbotDraftSteps : steps}
        choices={isDraft ? hbotDraftChoices : choices}
        nicheId={nicheId || null}
        sector={niches.find((n) => n.id === nicheId)?.sector ?? null}
        extras={extras}
        fontSize={FONT_SIZES[sizeIndex]}
        initialStepKey={isDraft ? draftEntry : initialStepKey}
        concernOptions={
          isDraft
            ? HBOT_CONCERN_OPTIONS
            : CONCERN_OPTIONS[
            niches.find((n) => n.id === nicheId)?.name ?? ''
          ] ?? undefined
        }
        practice
      />

      <PracticeLogPreview />
    </div>
  )
}
