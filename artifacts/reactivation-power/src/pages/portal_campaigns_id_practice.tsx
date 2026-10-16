// @ts-nocheck
import { useMemo, useState } from 'react'
import { Link, useParams } from 'wouter'
import {
  AArrowDown,
  AArrowUp,
  ArrowLeft,
  Calendar,
  CalendarClock,
  CheckCircle2,
  MapPinOff,
  PhoneMissed,
  PhoneOff,
  Voicemail,
} from 'lucide-react'
import { LEAD_DISPOSITION_LABELS } from '@workspace/shared/lead-followup'
import { CONCERN_OPTIONS } from '@workspace/niche-catalog'
import { ScriptFlowPlayer } from '@/components/reactivation/script-flow-player'
import { PracticeLogPreview } from '@/components/reactivation/practice-log-preview'
import { LEAD_FONT_SIZES } from '@/components/lead-followup/lead-call-screen'
import { leadScriptExtras } from '@/components/lead-followup/lead-script-extras'
import { usePageData } from '@/hooks/use-page-data'
import { nicheDisplayLabel } from '@/components/reactivation/niche-select'
import { PageError, PageLoading } from '@/components/page-status'
import NotFound from '@/pages/not-found'

/** Same order and labels as the live lead call screen. */
const LEAD_PREVIEW_BUTTONS = [
  { label: LEAD_DISPOSITION_LABELS.no_answer, icon: PhoneMissed },
  { label: LEAD_DISPOSITION_LABELS.voicemail, icon: Voicemail },
  { label: LEAD_DISPOSITION_LABELS.spoke_did_not_book, icon: Calendar },
  { label: LEAD_DISPOSITION_LABELS.callback_later, icon: CalendarClock },
  { label: LEAD_DISPOSITION_LABELS.booked, icon: CheckCircle2, tone: 'primary' as const },
  { label: LEAD_DISPOSITION_LABELS.booked_elsewhere, icon: MapPinOff },
  { label: LEAD_DISPOSITION_LABELS.do_not_call, icon: PhoneOff, tone: 'danger' as const },
]

/** Rehearse a campaign's lead script with no real lead on the line. */
export default function LeadPracticePage() {
  const { id } = useParams()
  const { data, loading, error, notFound } = usePageData<any>(`/portal/campaigns/${id}/practice`)
  const [sizeIndex, setSizeIndex] = useState(2)
  const extras = useMemo(
    () =>
      data
        ? leadScriptExtras({
            campaign: data.campaign,
            lead: null,
            callerName: data.participant.first_name,
            practiceName: data.owner?.practice_name ?? null,
            owner: data.owner ?? null,
            isProvider: data.participant.role === 'owner',
          })
        : {},
    [data],
  )
  if (loading) return <PageLoading />
  if (notFound) return <NotFound />
  if (error) return <PageError error={error} />
  const { campaign, niche, flow } = data

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
      <Link
        href={`/portal/campaigns/${campaign.id}`}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to {campaign.name}
      </Link>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-foreground" data-testid="text-practice-title">Practice the lead script</h1>
          <p className="text-sm text-muted-foreground">
            {niche ? `${nicheDisplayLabel(niche.name)} lead script for ` : 'Lead script for '}
            <span className="font-medium text-foreground">{campaign.name}</span>. Click the response buttons to
            practice steering the call, just like on a live one.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Text size</span>
          <div className="inline-flex items-center rounded-md border border-input">
            <button
              type="button"
              aria-label="Smaller text"
              disabled={sizeIndex === 0}
              onClick={() => setSizeIndex((i) => Math.max(0, i - 1))}
              className="flex size-9 items-center justify-center text-foreground hover:bg-muted disabled:opacity-40"
            >
              <AArrowDown className="size-4" />
            </button>
            <span className="border-x border-input px-2 text-xs tabular-nums text-muted-foreground">
              {LEAD_FONT_SIZES[sizeIndex]}px
            </span>
            <button
              type="button"
              aria-label="Larger text"
              disabled={sizeIndex === LEAD_FONT_SIZES.length - 1}
              onClick={() => setSizeIndex((i) => Math.min(LEAD_FONT_SIZES.length - 1, i + 1))}
              className="flex size-9 items-center justify-center text-foreground hover:bg-muted disabled:opacity-40"
            >
              <AArrowUp className="size-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-4">
        <ScriptFlowPlayer
          steps={flow.steps}
          choices={flow.choices}
          nicheId={campaign.nicheId}
          sector="healthcare"
          extras={extras}
          fontSize={LEAD_FONT_SIZES[sizeIndex]}
          concernOptions={CONCERN_OPTIONS[niche?.name ?? ''] ?? undefined}
          flowKind="lead"
          practice
        />
        <PracticeLogPreview buttons={LEAD_PREVIEW_BUTTONS} />
      </div>
    </div>
  )
}
