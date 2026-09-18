'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  AArrowDown,
  AArrowUp,
  Calendar,
  CalendarClock,
  CheckCircle2,
  History,
  Loader2,
  NotebookPen,
  Pencil,
  Phone,
  PhoneMissed,
  PhoneOff,
  Save,
  Voicemail,
} from 'lucide-react'
import { logCall, setSelectedNiche } from '@/app/actions/reactivation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { mergeScript, spokenComplaint } from '@/lib/script-merge'
import { CONCERN_OPTIONS } from '@/lib/concern-options'
import { ScriptFlowPlayer } from '@/components/reactivation/script-flow-player'
import { DateTimePicker } from '@/components/reactivation/date-time-picker'
import { cn } from '@/lib/utils'
import type { CallWithCaller, ContactWithMeta } from '@/lib/data/reactivation'
import type {
  CallDisposition,
  Niche,
  ScriptFlowChoice,
  ScriptFlowStep,
  ScriptSection,
} from '@/lib/types'

const DISPOSITION_LABELS: Record<string, string> = {
  no_answer: 'No answer',
  voicemail: 'No answer, left VM',
  spoke_did_not_schedule: 'Spoke, didn\u2019t schedule',
  spoke_call_back_later: 'Spoke, call back later',
  scheduled: 'Scheduled',
  do_not_call: 'Do not call',
}

const FONT_SIZES = [16, 18, 20, 24, 28, 32, 36, 40]

interface Props {
  contact: ContactWithMeta
  niches: Niche[]
  scriptBody: string
  sections: ScriptSection[]
  initialNicheId: string | null
  nextContactId: string | null
  callerName: string
  practiceName: string | null
  officePhone: string | null
  providerName: string | null
  isProvider?: boolean
  callHistory: CallWithCaller[]
  flowSteps: ScriptFlowStep[]
  flowChoices: ScriptFlowChoice[]
}

function fmtWhen(d: Date) {
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function CallScreen({
  contact,
  niches,
  scriptBody,
  sections,
  initialNicheId,
  nextContactId,
  callerName,
  practiceName,
  officePhone,
  providerName,
  isProvider = false,
  callHistory,
  flowSteps,
  flowChoices,
}: Props) {
  const router = useRouter()
  // Only honor the saved niche if it belongs to this account's sector(s);
  // otherwise fall back to the first available niche.
  const [nicheId, setNicheId] = useState<string>(
    initialNicheId && niches.some((n) => n.id === initialNicheId)
      ? initialNicheId
      : (niches[0]?.id ?? ''),
  )
  const [sizeIndex, setSizeIndex] = useState(2) // 20px default
  const [notes, setNotes] = useState('')
  const [disposition, setDisposition] = useState<CallDisposition | null>(null)
  const [vmScriptOpen, setVmScriptOpen] = useState(false)
  // One picker dialog serves both "call back later" and "scheduled"
  const [pickerFor, setPickerFor] = useState<
    'spoke_call_back_later' | 'scheduled' | null
  >(null)
  const [pickerValue, setPickerValue] = useState<Date | null>(null)
  const [callBackAt, setCallBackAt] = useState<Date | null>(null)
  const [appointmentAt, setAppointmentAt] = useState<Date | null>(null)
  const [saving, startSaving] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [savedDisposition, setSavedDisposition] =
    useState<CallDisposition | null>(null)

  const extras = useMemo(() => {
    const e: Record<string, string> = {
      contact_first_name: contact.name.split(' ')[0],
      contact_full_name: contact.name,
      caller_name: callerName,
      your_name: callerName,
    }
    // Documented condition from the contact record fills the
    // {{complaint_reference}} token; when absent, the flow player handles
    // the fallback (clause drop on the opener, generic phrase mid-sentence).
    const complaint = spokenComplaint(contact.original_complaint ?? '')
    if (complaint) e.complaint_reference = complaint
    if (practiceName) e.practice_name = practiceName
    if (providerName) e.provider_name = providerName
    else if (practiceName) e.provider_name = practiceName
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
  }, [
    contact.name,
    contact.original_complaint,
    callerName,
    practiceName,
    providerName,
    isProvider,
  ])

  const merged = useMemo(() => {
    const nicheSections = sections.filter((s) => s.niche_id === nicheId)
    return mergeScript(scriptBody, nicheSections, extras)
  }, [scriptBody, sections, nicheId, extras])

  const paragraphs = useMemo(
    () =>
      merged
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean),
    [merged],
  )

  // "Leave VM" is offered on every 2nd attempt overall (2nd, 4th, 6th...),
  // not every call. callHistory is prior attempts, so this call is the next.
  const attemptNumber = callHistory.length + 1
  const showLeaveVm = attemptNumber % 2 === 0

  const firstName = contact.name.split(' ')[0]
  const vmBusiness = practiceName?.trim() || 'our office'
  const vmCallback = officePhone?.trim() || '(your office number)'
  const voicemailScript = `Hi ${firstName}, this is ${callerName} from ${vmBusiness}, and we're doing file updates on patients we haven't seen in a while. If you could do me a favor and give me a call back at this number, ${vmCallback}, when you have a few minutes, I'd really appreciate it. Thanks in advance, and have a great day!`

  const previousNotes = callHistory.filter((c) => c.notes?.trim())

  function handleNicheChange(id: string | null) {
    if (!id) return
    setNicheId(id)
    void setSelectedNiche(id)
  }

  function submit(d: CallDisposition, voicemailLeft = false) {
    setError(null)
    startSaving(async () => {
      const formData = new FormData()
      formData.set('contactId', contact.id)
      formData.set('disposition', d)
      formData.set('voicemailLeft', String(voicemailLeft))
      formData.set('notes', notes)
      if (d === 'spoke_call_back_later' && callBackAt) {
        formData.set('callBackAt', callBackAt.toISOString())
      }
      if (d === 'scheduled' && appointmentAt) {
        formData.set('appointmentAt', appointmentAt.toISOString())
      }
      const result = await logCall(formData)
      if (result?.error) {
        setError(result.error)
        return
      }
      setVmScriptOpen(false)
      setPickerFor(null)
      // Don't silently navigate away — confirm the save and let the caller
      // choose where to go next.
      setSavedDisposition(d)
    })
  }

  /** Selecting a disposition. Time-bearing ones open the picker first. */
  function choose(d: CallDisposition) {
    setError(null)
    setDisposition(d)
    if (d === 'spoke_call_back_later') {
      setPickerValue(callBackAt)
      setPickerFor(d)
    } else if (d === 'scheduled') {
      setPickerValue(appointmentAt)
      setPickerFor(d)
    }
  }

  function confirmPicker() {
    if (!pickerFor || !pickerValue) return
    if (pickerFor === 'spoke_call_back_later') setCallBackAt(pickerValue)
    else setAppointmentAt(pickerValue)
    setPickerFor(null)
  }

  const needsTime =
    (disposition === 'spoke_call_back_later' && !callBackAt) ||
    (disposition === 'scheduled' && !appointmentAt)
  const canLog = disposition !== null && !needsTime && !saving

  const dispositionButtons: {
    d: CallDisposition
    label: string
    icon: typeof Phone
    tone?: 'primary' | 'danger'
  }[] = [
    { d: 'no_answer', label: 'No Answer', icon: PhoneMissed },
    {
      d: 'spoke_did_not_schedule',
      label: 'Spoke, Didn\u2019t Schedule',
      icon: Calendar,
    },
    {
      d: 'spoke_call_back_later',
      label: 'Spoke, Call Back Later',
      icon: CalendarClock,
    },
    { d: 'scheduled', label: 'Scheduled', icon: CheckCircle2, tone: 'primary' },
    { d: 'do_not_call', label: 'Do Not Call', icon: PhoneOff, tone: 'danger' },
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* 1. Contact details */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-full bg-accent/10">
            <Phone className="size-5 text-accent" />
          </div>
          <div>
            <p className="text-lg font-semibold text-foreground">
              {contact.name}
            </p>
            <a
              href={`tel:${contact.phone}`}
              className="text-sm font-medium text-accent hover:underline"
            >
              {contact.phone}
            </a>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={nicheId}
            onValueChange={handleNicheChange}
            items={niches.map((n) => ({ value: n.id, label: n.name }))}
          >
            <SelectTrigger className="w-64" aria-label="Select niche">
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
      </div>

      {/* 2 + 3. Script with its progression buttons */}
      {flowSteps.length > 0 ? (
        <ScriptFlowPlayer
          key={nicheId}
          steps={flowSteps}
          choices={flowChoices}
          nicheId={nicheId || null}
          extras={extras}
          fontSize={FONT_SIZES[sizeIndex]}
          concernOptions={
            CONCERN_OPTIONS[
              niches.find((n) => n.id === nicheId)?.name ?? ''
            ] ?? undefined
          }
          showLeaveVm={showLeaveVm}
          onLeaveVoicemail={() => setVmScriptOpen(true)}
        />
      ) : (
        <article
          className="rounded-lg border border-border bg-card p-6 sm:p-8"
          aria-label="Call script"
        >
          {paragraphs.length > 0 ? (
            <div
              className="mx-auto flex max-w-2xl flex-col gap-5"
              style={{ fontSize: FONT_SIZES[sizeIndex] }}
            >
              {paragraphs.map((p, i) =>
                p.startsWith('## ') ? (
                  <h2
                    key={i}
                    className="mt-2 font-bold text-foreground"
                    style={{ fontSize: FONT_SIZES[sizeIndex] * 1.15 }}
                  >
                    {p.slice(3)}
                  </h2>
                ) : (
                  <p key={i} className="leading-relaxed text-foreground">
                    {p}
                  </p>
                ),
              )}
            </div>
          ) : (
            <p className="text-center text-muted-foreground">
              No script has been published yet. Ask your administrator to add
              the master script.
            </p>
          )}
        </article>
      )}

      {/* 4. What happened */}
      <section
        className="rounded-lg border border-border bg-card"
        aria-labelledby="what-happened"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2
            id="what-happened"
            className="text-sm font-semibold text-foreground"
          >
            What happened on this call?
          </h2>
          <p className="text-xs text-muted-foreground">
            Pick one, then log it below
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 p-4">
          {dispositionButtons.map(({ d, label, icon: Icon, tone }) => {
            const active = disposition === d
            const when =
              d === 'spoke_call_back_later'
                ? callBackAt
                : d === 'scheduled'
                  ? appointmentAt
                  : null
            return (
              <button
                key={d}
                type="button"
                onClick={() => choose(d)}
                aria-pressed={active}
                disabled={saving}
                className={cn(
                  'inline-flex h-10 items-center gap-2 rounded-md border px-3.5 text-sm font-medium transition-colors disabled:opacity-60',
                  !active &&
                    tone !== 'danger' &&
                    'border-input bg-background text-foreground hover:bg-muted',
                  !active &&
                    tone === 'danger' &&
                    'border-transparent bg-transparent text-destructive hover:bg-destructive/10',
                  active &&
                    tone !== 'danger' &&
                    'border-accent bg-accent text-accent-foreground shadow-sm',
                  active &&
                    tone === 'danger' &&
                    'border-destructive bg-destructive text-destructive-foreground',
                )}
              >
                <Icon className="size-4" />
                {label}
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

      {/* 5. Previous calls logged */}
      {callHistory.length > 0 && (
        <section
          className="rounded-lg border border-border bg-card"
          aria-label="Previous calls logged"
        >
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <History className="size-4 text-accent" />
            <h2 className="text-sm font-semibold text-foreground">
              Previous calls logged ({callHistory.length})
            </h2>
          </div>
          <ul className="max-h-40 divide-y divide-border overflow-y-auto">
            {callHistory.map((call) => {
              const who = call.caller
                ? `${call.caller.first_name} ${call.caller.last_name ?? ''}`.trim()
                : 'Unknown'
              return (
                <li
                  key={call.id}
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2 text-xs text-muted-foreground"
                >
                  <span className="font-medium text-foreground">
                    {DISPOSITION_LABELS[call.disposition] ?? call.disposition}
                  </span>
                  <span aria-hidden="true">{'\u00b7'}</span>
                  <span>{who}</span>
                  <span aria-hidden="true">{'\u00b7'}</span>
                  <time dateTime={call.created_at}>
                    {new Date(call.created_at).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </time>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* 6. Call notes for this call */}
      <section
        className="rounded-lg border border-border bg-card"
        aria-labelledby="call-notes"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <NotebookPen className="size-4 text-accent" />
            <h2 id="call-notes" className="text-sm font-semibold text-foreground">
              Notes for this call
            </h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Saved when you log the call
          </p>
        </div>
        <div className="p-4">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What happened, best time to reach them, objections... shown to whoever makes the next call."
            rows={3}
            className="resize-y text-base"
          />
        </div>
      </section>

      {/* 7. Notes from previous calls */}
      {previousNotes.length > 0 && (
        <section
          className="rounded-lg border border-border bg-card"
          aria-label="Notes from previous calls"
        >
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <History className="size-4 text-accent" />
            <h2 className="text-sm font-semibold text-foreground">
              Notes from previous calls ({previousNotes.length})
            </h2>
          </div>
          <ul className="max-h-64 divide-y divide-border overflow-y-auto">
            {previousNotes.map((call) => {
              const who = call.caller
                ? `${call.caller.first_name} ${call.caller.last_name ?? ''}`.trim()
                : 'Unknown'
              return (
                <li key={call.id} className="px-4 py-3">
                  <p className="text-sm leading-relaxed text-foreground">
                    {call.notes}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {who}
                    {' \u00b7 '}
                    {new Date(call.created_at).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                    {' \u00b7 '}
                    {DISPOSITION_LABELS[call.disposition] ?? call.disposition}
                  </p>
                </li>
              )
            })}
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
                <span className="font-semibold text-foreground">
                  {DISPOSITION_LABELS[disposition]}
                </span>
                {disposition === 'spoke_call_back_later' && callBackAt && (
                  <> {'\u00b7'} call back {fmtWhen(callBackAt)}</>
                )}
                {disposition === 'scheduled' && appointmentAt && (
                  <> {'\u00b7'} appointment {fmtWhen(appointmentAt)}</>
                )}
                {needsTime && (
                  <span className="text-destructive">
                    {' '}
                    {'\u00b7'} pick a date and time first
                  </span>
                )}
                {notes.trim() && !needsTime && ' \u00b7 with your notes'}
              </>
            ) : (
              'Choose what happened above to log this call.'
            )}
            {error && (
              <span className="block text-destructive">{error}</span>
            )}
          </p>
          <Button
            size="lg"
            className="gap-2"
            disabled={!canLog}
            onClick={() => disposition && submit(disposition)}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Log call
          </Button>
        </div>
      </div>

      {/* Call saved confirmation */}
      <Dialog
        open={savedDisposition !== null}
        onOpenChange={(open) => {
          if (!open) {
            // Dismissing the dialog still returns to the dialer so the
            // caller is never left on an already-logged call.
            router.push('/portal/dialer')
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-accent" />
              Call saved
            </DialogTitle>
            <DialogDescription>
              {contact.name} was logged as{' '}
              <span className="font-medium text-foreground">
                {savedDisposition
                  ? (DISPOSITION_LABELS[savedDisposition] ?? savedDisposition)
                  : ''}
              </span>
              {notes.trim() ? ' with your note.' : '.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {nextContactId && (
              <Button
                className="w-full gap-2"
                onClick={() =>
                  router.push(`/portal/dialer/call/${nextContactId}`)
                }
              >
                <Phone className="size-4" />
                Next call due
              </Button>
            )}
            <Button
              variant={nextContactId ? 'outline' : 'default'}
              className="w-full"
              onClick={() => router.push('/portal/dialer')}
            >
              Back to Dialer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Voicemail script */}
      <Dialog open={vmScriptOpen} onOpenChange={setVmScriptOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Voicemail className="size-5 text-accent" />
              Voicemail script
            </DialogTitle>
            <DialogDescription>
              Read this to {contact.name}, then log the call.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-border bg-muted/40 p-4">
            <p className="text-base leading-relaxed text-foreground">
              {voicemailScript}
            </p>
          </div>
          {!officePhone?.trim() && (
            <p className="text-xs text-muted-foreground">
              Tip: set your office callback number in Settings so it fills in
              here automatically.
            </p>
          )}
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => setVmScriptOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="gap-2"
              disabled={saving}
              onClick={() => submit('voicemail', true)}
            >
              <Voicemail className="size-4" />
              Log as Voicemail Left
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Date + lazy time picker (callback or appointment) */}
      <Dialog
        open={pickerFor !== null}
        onOpenChange={(open) => {
          if (!open) setPickerFor(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {pickerFor === 'scheduled'
                ? 'When is the appointment?'
                : 'When should we call back?'}
            </DialogTitle>
            <DialogDescription>
              {pickerFor === 'scheduled'
                ? `Pick the day ${firstName} booked, then type the time ("9a", "1030", and "2:15 pm" all work).`
                : `${firstName} asked for a callback. Pick the day, then type the time ("9a", "1030", and "2:15 pm" all work).`}
            </DialogDescription>
          </DialogHeader>
          {pickerFor && (
            <DateTimePicker
              key={pickerFor}
              value={pickerValue}
              onChange={setPickerValue}
              timeInputId="call-time"
            />
          )}
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => setPickerFor(null)}>
              Cancel
            </Button>
            <Button disabled={!pickerValue} onClick={confirmPicker}>
              {pickerFor === 'scheduled' ? 'Set appointment' : 'Set callback'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
