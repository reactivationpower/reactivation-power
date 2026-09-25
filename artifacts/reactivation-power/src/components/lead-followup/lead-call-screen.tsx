import { useCallback, useMemo, useState, useTransition } from 'react'
import {
  AArrowDown,
  AArrowUp,
  Calendar,
  CalendarCheck,
  CalendarClock,
  CalendarSync,
  CheckCircle2,
  History,
  Loader2,
  MapPinOff,
  Megaphone,
  NotebookPen,
  Pencil,
  Phone,
  PhoneMissed,
  PhoneOff,
  Save,
  Voicemail,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatPhone } from '@workspace/shared/phone'
import {
  LEAD_DISPOSITION_LABELS,
  isAppointmentDisposition,
  leadEntryStepKey,
  timeAgo,
  type LeadDisposition,
} from '@workspace/shared/lead-followup'
import { formatRequestedAt, requestedAtLocalDate } from '@workspace/shared/lead-requested-time'
import { RequestedTimeBadge } from './lead-bits'
import { CONCERN_OPTIONS } from '@workspace/niche-catalog'
import type { ScriptFlowChoice, ScriptFlowStep } from '@workspace/shared/types'
import { logLeadCall } from '@/app/actions/lead-followup'
import { ScriptFlowPlayer } from '@/components/reactivation/script-flow-player'
import { DateTimePicker } from '@/components/reactivation/date-time-picker'
import {
  DISPOSITION_BUTTON_BASE,
  dispositionButtonClasses,
  type DispositionTone,
} from '@/components/reactivation/disposition-button-styles'
import { leadScriptExtras } from '@/components/lead-followup/lead-script-extras'
import type { ProviderSource } from '@/lib/provider-name'
import { useRouter } from '@/hooks/use-router'
import { cn } from '@/lib/utils'

export const LEAD_FONT_SIZES = [16, 18, 20, 24, 28, 32, 36, 40]

export interface LeadCallRecord {
  id: string
  disposition: string
  notes: string | null
  callBackAt: string | null
  bookedAt: string | null
  createdAt: string
}

interface Props {
  campaign: {
    id: string
    name: string
    nicheId: string
    offerItems: string[]
    regularPriceCents: number | null
    offerPriceCents: number | null
    priceLineStyle: string
    urgencyNote: string | null
  }
  lead: {
    id: string
    firstName: string
    lastName: string
    phone: string
    email: string | null
    submittedAt: string
    requestedTime: string | null
    requestedAt?: string | null
    message: string | null
    status: string
  }
  niche: { id: string; name: string } | null
  callerName: string
  practiceName: string | null
  officePhone: string | null
  owner: ProviderSource | null
  isProvider: boolean
  calls: LeadCallRecord[]
  flowSteps: ScriptFlowStep[]
  flowChoices: ScriptFlowChoice[]
  /** Where "Next lead" goes after a save; null when the queue is empty. */
  nextHref: string | null
  now: string
}

function fmtWhen(d: Date | string) {
  return new Date(d).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const TIMED: Partial<Record<LeadDisposition, 'callBack' | 'booked'>> = {
  callback_later: 'callBack',
  booked: 'booked',
  confirmed: 'booked',
  rescheduled: 'booked',
}

/**
 * Screens in the confirmation branch that pre-select the outcome, so the
 * caller reading "press the Confirmed button below" finds it already
 * chosen with the time filled in (or the picker open for a new time).
 */
const STEP_PRESELECTS: Record<string, LeadDisposition> = {
  close_confirmed: 'confirmed',
  close_rescheduled: 'rescheduled',
}

/** What the sticky bar and history call the time a disposition carries. */
function appointmentWord(d: LeadDisposition | string): string {
  if (d === 'confirmed') return 'confirmed for'
  if (d === 'rescheduled') return 'moved to'
  return 'booked for'
}

/**
 * The live call screen for one lead. Same player, buttons and layout as the
 * reactivation call screen; the script is the campaign niche's LEAD flow and
 * the outcomes follow the lead cadence instead of the quarterly cycle.
 */
export function LeadCallScreen({
  campaign,
  lead,
  niche,
  callerName,
  practiceName,
  officePhone,
  owner,
  isProvider,
  calls,
  flowSteps,
  flowChoices,
  nextHref,
  now,
}: Props) {
  const router = useRouter()
  const [sizeIndex, setSizeIndex] = useState(2)
  const [notes, setNotes] = useState('')
  const [disposition, setDisposition] = useState<LeadDisposition | null>(null)
  const [vmOpen, setVmOpen] = useState(false)
  const [pickerFor, setPickerFor] = useState<'callBack' | 'booked' | null>(null)
  const [pickerValue, setPickerValue] = useState<Date | null>(null)
  const [callBackAt, setCallBackAt] = useState<Date | null>(null)
  const [bookedAt, setBookedAt] = useState<Date | null>(null)
  const [saving, startSaving] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<LeadDisposition | null>(null)

  const nowMs = new Date(now).getTime()
  // A lead who picked a day and time on the form starts on the confirm
  // screen; that slot, read in the browser's zone, is the default
  // appointment time for "confirmed".
  const entryStepKey = leadEntryStepKey(lead)
  const requestedLocal = useMemo(() => requestedAtLocalDate(lead.requestedAt), [lead.requestedAt])
  const extras = useMemo(
    () =>
      leadScriptExtras({
        campaign,
        lead,
        callerName,
        practiceName,
        owner,
        isProvider,
        now: new Date(now),
      }),
    [campaign, lead, callerName, practiceName, owner, isProvider, now],
  )

  const fullName = `${lead.firstName} ${lead.lastName}`.trim()
  const vmBusiness = practiceName?.trim() || 'our office'
  const vmCallback = officePhone?.trim() || '(your office number)'
  const voicemailScript = `Hi ${lead.firstName}, this is ${callerName} from ${vmBusiness}. You reached out about our ${campaign.name} and I wanted to help you get that set up. Give me a call back at ${vmCallback} and I'll get you taken care of. Talk soon.`
  const previousNotes = calls.filter((c) => c.notes?.trim())

  function submit(d: LeadDisposition) {
    setError(null)
    startSaving(async () => {
      const result = await logLeadCall({
        leadId: lead.id,
        disposition: d,
        notes,
        callBackAt: d === 'callback_later' && callBackAt ? callBackAt.toISOString() : null,
        bookedAt: isAppointmentDisposition(d) && bookedAt ? bookedAt.toISOString() : null,
      })
      if (result?.error) {
        setError(result.error)
        return
      }
      setVmOpen(false)
      setPickerFor(null)
      setSaved(d)
      router.refresh()
    })
  }

  function choose(d: LeadDisposition) {
    setError(null)
    setDisposition(d)
    const timed = TIMED[d]
    if (timed) {
      setPickerValue(timed === 'callBack' ? callBackAt : bookedAt)
      setPickerFor(timed)
    }
  }

  const onStepChange = useCallback(
    (stepKey: string) => {
      const preselect = STEP_PRESELECTS[stepKey]
      if (!preselect) return
      setError(null)
      setDisposition(preselect)
      if (preselect === 'confirmed' && requestedLocal) {
        // The time they asked for, already filled in; the pencil re-opens the picker.
        setBookedAt(requestedLocal)
        return
      }
      // Rescheduled (or a confirm with no parsable slot): ask for the time now.
      setPickerValue(null)
      setPickerFor('booked')
    },
    [requestedLocal],
  )

  function confirmPicker() {
    if (!pickerFor || !pickerValue) return
    if (pickerFor === 'callBack') setCallBackAt(pickerValue)
    else setBookedAt(pickerValue)
    setPickerFor(null)
  }

  const needsTime =
    (disposition === 'callback_later' && !callBackAt) ||
    (disposition !== null && isAppointmentDisposition(disposition) && !bookedAt)
  const canLog = disposition !== null && !needsTime && !saving

  const buttons: { d: LeadDisposition; icon: typeof Phone; tone?: DispositionTone }[] = [
    { d: 'no_answer', icon: PhoneMissed },
    { d: 'voicemail', icon: Voicemail },
    { d: 'spoke_did_not_book', icon: Calendar },
    { d: 'callback_later', icon: CalendarClock },
    { d: 'booked', icon: CheckCircle2, tone: 'primary' },
    // Confirmation-call outcomes only make sense for a lead who asked for a time.
    ...(lead.requestedAt
      ? ([
          { d: 'confirmed', icon: CalendarCheck, tone: 'primary' },
          { d: 'rescheduled', icon: CalendarSync, tone: 'primary' },
        ] as const)
      : []),
    { d: 'booked_elsewhere', icon: MapPinOff },
    { d: 'do_not_call', icon: PhoneOff, tone: 'danger' },
  ]

  const campaignHref = `/portal/campaigns/${campaign.id}`

  return (
    <div className="flex flex-col gap-4">
      {/* 1. Lead details */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-full bg-accent/10">
            <Phone className="size-5 text-accent" />
          </div>
          <div>
            <p className="text-lg font-semibold text-foreground" data-testid="text-lead-name">
              {fullName}
            </p>
            <p className="text-sm text-muted-foreground">
              <a href={`tel:${lead.phone}`} className="font-medium text-foreground hover:underline">
                {formatPhone(lead.phone)}
              </a>
              {' \u00b7 '}
              responded {timeAgo(lead.submittedAt, nowMs)}
              {lead.requestedAt ? (
                <>
                  {' \u00b7 '}
                  <span className="font-medium text-foreground" data-testid="text-lead-requested-at">
                    Requested: {formatRequestedAt(lead.requestedAt)}
                  </span>
                </>
              ) : lead.requestedTime?.trim() ? (
                <> {' \u00b7 '}<RequestedTimeBadge requestedTime={lead.requestedTime} status={lead.status} /></>
              ) : lead.status !== 'booked' && lead.status !== 'confirmed' ? (
                <> {' \u00b7 '}<RequestedTimeBadge status={lead.status} /></>
              ) : (
                null
              )}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Megaphone className="size-3.5" />
              {campaign.name}
              {niche ? ` \u00b7 ${niche.name} lead script` : ''}
            </p>
          </div>
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

      {lead.message?.trim() ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="font-semibold">They wrote on the form: </span>
          {lead.message}
        </div>
      ) : null}

      {/* 2. Script */}
      {flowSteps.length > 0 ? (
        <ScriptFlowPlayer
          steps={flowSteps}
          choices={flowChoices}
          nicheId={campaign.nicheId}
          sector="healthcare"
          extras={extras}
          fontSize={LEAD_FONT_SIZES[sizeIndex]}
          concernOptions={CONCERN_OPTIONS[niche?.name ?? ''] ?? undefined}
          flowKind="lead"
          initialStepKey={entryStepKey}
          onStepChange={onStepChange}
          showLeaveVm
          onLeaveVoicemail={() => setVmOpen(true)}
        />
      ) : (
        <article className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">
          The lead script for this service has not been published yet.
        </article>
      )}

      {/* 3. What happened */}
      <section className="rounded-lg border border-border bg-card" aria-labelledby="lead-what-happened">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 id="lead-what-happened" className="text-sm font-semibold text-foreground">
            What happened on this call?
          </h2>
          <p className="text-xs text-muted-foreground">Pick one, then log it below</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 p-4">
          {buttons.map(({ d, icon: Icon, tone }) => {
            const active = disposition === d
            const when = d === 'callback_later' ? callBackAt : isAppointmentDisposition(d) ? bookedAt : null
            return (
              <button
                key={d}
                type="button"
                onClick={() => choose(d)}
                aria-pressed={active}
                disabled={saving}
                data-testid={`button-disposition-${d}`}
                className={cn(
                  DISPOSITION_BUTTON_BASE,
                  'transition-colors disabled:opacity-60',
                  dispositionButtonClasses(tone, active),
                )}
              >
                <Icon className="size-4" />
                {LEAD_DISPOSITION_LABELS[d]}
                {active && when && (
                  <span className="ml-1 inline-flex items-center gap-1 rounded bg-background/20 px-1.5 py-0.5 text-xs font-semibold tabular-nums">
                    {fmtWhen(when)}
                    <Pencil className="size-3" aria-hidden="true" />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </section>

      {/* 4. Previous calls */}
      {calls.length > 0 && (
        <section className="rounded-lg border border-border bg-card" aria-label="Previous calls logged">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <History className="size-4 text-accent" />
            <h2 className="text-sm font-semibold text-foreground">Previous calls logged ({calls.length})</h2>
          </div>
          <ul className="max-h-40 divide-y divide-border overflow-y-auto">
            {calls.map((call) => (
              <li
                key={call.id}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2 text-xs text-muted-foreground"
              >
                <span className="font-medium text-foreground">
                  {LEAD_DISPOSITION_LABELS[call.disposition as LeadDisposition] ?? call.disposition}
                </span>
                <span aria-hidden="true">{'\u00b7'}</span>
                <time dateTime={call.createdAt}>{fmtWhen(call.createdAt)}</time>
                {call.callBackAt ? <span>{'\u00b7'} call back {fmtWhen(call.callBackAt)}</span> : null}
                {call.bookedAt ? <span>{'\u00b7'} {appointmentWord(call.disposition)} {fmtWhen(call.bookedAt)}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 5. Notes */}
      <section className="rounded-lg border border-border bg-card" aria-labelledby="lead-call-notes">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <NotebookPen className="size-4 text-accent" />
            <h2 id="lead-call-notes" className="text-sm font-semibold text-foreground">
              Notes for this call
            </h2>
          </div>
          <p className="text-xs text-muted-foreground">Saved when you log the call</p>
        </div>
        <div className="p-4">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What happened, best time to reach them, objections... shown to whoever makes the next call."
            rows={3}
            className="resize-y text-base"
            data-testid="input-lead-call-notes"
          />
        </div>
      </section>

      {previousNotes.length > 0 && (
        <section className="rounded-lg border border-border bg-card" aria-label="Notes from previous calls">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <History className="size-4 text-accent" />
            <h2 className="text-sm font-semibold text-foreground">
              Notes from previous calls ({previousNotes.length})
            </h2>
          </div>
          <ul className="max-h-64 divide-y divide-border overflow-y-auto">
            {previousNotes.map((call) => (
              <li key={call.id} className="px-4 py-3">
                <p className="text-sm leading-relaxed text-foreground">{call.notes}</p>
                <p className="mt-1 text-xs text-muted-foreground">{fmtWhen(call.createdAt)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Sticky log bar */}
      <div className="sticky bottom-0 z-10 rounded-t-lg border border-b-0 border-border bg-card/95 px-4 py-3 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.15)] backdrop-blur sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {disposition ? (
              <>
                Logging as{' '}
                <span className="font-semibold text-foreground">{LEAD_DISPOSITION_LABELS[disposition]}</span>
                {disposition === 'callback_later' && callBackAt && <> {'\u00b7'} call back {fmtWhen(callBackAt)}</>}
                {isAppointmentDisposition(disposition) && bookedAt && <> {'\u00b7'} appointment {fmtWhen(bookedAt)}</>}
                {needsTime && (
                  <span className="text-destructive"> {'\u00b7'} pick a date and time first</span>
                )}
                {notes.trim() && !needsTime && ' \u00b7 with your notes'}
              </>
            ) : (
              'Choose what happened above to log this call.'
            )}
            {error && <span className="block text-destructive">{error}</span>}
          </p>
          <Button
            size="lg"
            className="gap-2"
            disabled={!canLog}
            onClick={() => disposition && submit(disposition)}
            data-testid="button-log-lead-call"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Log call
          </Button>
        </div>
      </div>

      {/* Saved */}
      <Dialog
        open={saved !== null}
        onOpenChange={(open) => {
          if (!open) router.push(campaignHref)
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-accent" />
              Call saved
            </DialogTitle>
            <DialogDescription>
              Logged as{' '}
              <span className="font-semibold text-foreground">
                {saved ? LEAD_DISPOSITION_LABELS[saved] : ''}
              </span>
              {saved === 'no_answer' || saved === 'voicemail'
                ? '. They will come back up on the call-next list when the next try is due.'
                : notes.trim()
                  ? ' with your note.'
                  : '.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {nextHref && (
              <Button className="w-full gap-2" onClick={() => router.push(nextHref)} data-testid="button-next-lead">
                <Phone className="size-4" />
                Next lead
              </Button>
            )}
            <Button
              variant={nextHref ? 'outline' : 'default'}
              className="w-full"
              onClick={() => router.push(campaignHref)}
              data-testid="button-back-to-campaign"
            >
              Back to campaign
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Voicemail script */}
      <Dialog open={vmOpen} onOpenChange={setVmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Voicemail className="size-5 text-accent" />
              Voicemail script
            </DialogTitle>
            <DialogDescription>Read this to {fullName}, then log the call.</DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-border bg-muted/40 p-4">
            <p className="text-base leading-relaxed text-foreground">{voicemailScript}</p>
          </div>
          {!officePhone?.trim() && (
            <p className="text-xs text-muted-foreground">
              Tip: set your office callback number in Settings so it fills in here automatically.
            </p>
          )}
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" disabled={saving} onClick={() => setVmOpen(false)}>
              Cancel
            </Button>
            <Button className="gap-2" disabled={saving} onClick={() => submit('voicemail')}>
              <Voicemail className="size-4" />
              Log as Voicemail Left
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Callback / appointment picker */}
      <Dialog
        open={pickerFor !== null}
        onOpenChange={(open) => {
          if (!open) setPickerFor(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {pickerFor !== 'booked'
                ? 'When should we call back?'
                : disposition === 'rescheduled'
                  ? 'What is the new time?'
                  : 'When is the appointment?'}
            </DialogTitle>
            <DialogDescription>
              {pickerFor === 'booked'
                ? disposition === 'rescheduled'
                  ? `Pick the day ${lead.firstName} moved to, then type the time ("9a", "1030", and "2:15 pm" all work).`
                  : `Pick the day ${lead.firstName} booked, then type the time ("9a", "1030", and "2:15 pm" all work).`
                : `${lead.firstName} asked for a callback. Pick the day, then type the time ("9a", "1030", and "2:15 pm" all work).`}
            </DialogDescription>
          </DialogHeader>
          {pickerFor && (
            <DateTimePicker key={pickerFor} value={pickerValue} onChange={setPickerValue} timeInputId="lead-call-time" />
          )}
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => setPickerFor(null)}>
              Cancel
            </Button>
            <Button disabled={!pickerValue} onClick={confirmPicker}>
              {pickerFor === 'booked' ? 'Set appointment' : 'Set callback'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
