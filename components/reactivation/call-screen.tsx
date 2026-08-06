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
  Phone,
  PhoneMissed,
  PhoneOff,
  Voicemail,
} from 'lucide-react'
import { logCall, setSelectedNiche } from '@/app/actions/reactivation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { mergeScript } from '@/lib/script-merge'
import { ScriptFlowPlayer } from '@/components/reactivation/script-flow-player'
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
  voicemail: 'Left voicemail',
  spoke_did_not_schedule: 'Spoke \u2014 didn\u2019t schedule',
  spoke_call_back_later: 'Spoke \u2014 call back later',
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
  providerName: string | null
  isProvider?: boolean
  callHistory: CallWithCaller[]
  flowSteps: ScriptFlowStep[]
  flowChoices: ScriptFlowChoice[]
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
  const [pendingDisposition, setPendingDisposition] =
    useState<CallDisposition | null>(null)
  const [voicemailPromptOpen, setVoicemailPromptOpen] = useState(false)
  const [callBackOpen, setCallBackOpen] = useState(false)
  const [callBackAt, setCallBackAt] = useState('')
  const [saving, startSaving] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const extras = useMemo(() => {
    const e: Record<string, string> = {
      contact_first_name: contact.name.split(' ')[0],
      contact_full_name: contact.name,
      caller_name: callerName,
      your_name: callerName,
    }
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
  }, [contact.name, callerName, practiceName, providerName, isProvider])

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

  function handleNicheChange(id: string | null) {
    if (!id) return
    setNicheId(id)
    void setSelectedNiche(id)
  }

  function submit(disposition: CallDisposition, voicemailLeft = false) {
    setError(null)
    startSaving(async () => {
      const formData = new FormData()
      formData.set('contactId', contact.id)
      formData.set('disposition', disposition)
      formData.set('voicemailLeft', String(voicemailLeft))
      formData.set('notes', notes)
      if (disposition === 'spoke_call_back_later' && callBackAt) {
        formData.set('callBackAt', new Date(callBackAt).toISOString())
      }
      const result = await logCall(formData)
      if (result?.error) {
        setError(result.error)
        return
      }
      setVoicemailPromptOpen(false)
      setCallBackOpen(false)
      if (nextContactId) {
        router.push(`/portal/reactivation/call/${nextContactId}`)
      } else {
        router.push('/portal/reactivation')
      }
    })
  }

  function handleDisposition(d: CallDisposition) {
    setPendingDisposition(d)
    if (d === 'no_answer') {
      setVoicemailPromptOpen(true)
    } else if (d === 'spoke_call_back_later') {
      setCallBackOpen(true)
    } else {
      submit(d)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Contact header */}
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
      </div>

      {/* Previous call notes */}
      {callHistory.length > 0 && (
        <section
          className="rounded-lg border border-border bg-card"
          aria-label="Previous call notes"
        >
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <History className="size-4 text-accent" />
            <h2 className="text-sm font-semibold text-foreground">
              Previous calls ({callHistory.length})
            </h2>
          </div>
          <ul className="max-h-56 divide-y divide-border overflow-y-auto">
            {callHistory.map((call) => {
              const callerName_ = call.caller
                ? `${call.caller.first_name} ${call.caller.last_name ?? ''}`.trim()
                : 'Unknown'
              return (
                <li key={call.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {DISPOSITION_LABELS[call.disposition] ?? call.disposition}
                    </span>
                    <span aria-hidden="true">{'\u00b7'}</span>
                    <span>{callerName_}</span>
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
                  </div>
                  {call.notes ? (
                    <p className="mt-1 text-sm leading-relaxed text-foreground">
                      {call.notes}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm italic text-muted-foreground">
                      No notes
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* Interactive branching script */}
      {flowSteps.length > 0 ? (
        <ScriptFlowPlayer
          key={nicheId}
          steps={flowSteps}
          choices={flowChoices}
          nicheId={nicheId || null}
          extras={extras}
          fontSize={FONT_SIZES[sizeIndex]}
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
            No script has been published yet. Ask your administrator to add the
            master script.
          </p>
        )}
      </article>
      )}

      {/* Sticky disposition bar */}
      <div className="sticky bottom-0 z-10 -mx-4 border-t border-border bg-card/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="mx-auto flex max-w-4xl flex-col gap-3">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Call notes — what happened, best time to reach, objections... (saved with this call and shown on the next one)"
            rows={2}
            className="resize-none"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={saving}
              onClick={() => handleDisposition('no_answer')}
            >
              <PhoneMissed className="size-4" />
              No Answer
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={saving}
              onClick={() => handleDisposition('spoke_did_not_schedule')}
            >
              <Calendar className="size-4" />
              {'Spoke \u2014 Didn\u2019t Schedule'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={saving}
              onClick={() => handleDisposition('spoke_call_back_later')}
            >
              <CalendarClock className="size-4" />
              {'Spoke \u2014 Call Back Later'}
            </Button>
            <Button
              size="sm"
              className="gap-2"
              disabled={saving}
              onClick={() => handleDisposition('scheduled')}
            >
              <CheckCircle2 className="size-4" />
              Scheduled
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-destructive hover:text-destructive"
              disabled={saving}
              onClick={() => handleDisposition('do_not_call')}
            >
              <PhoneOff className="size-4" />
              Do Not Call
            </Button>
            {saving && (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            )}
          </div>
        </div>
      </div>

      {/* Voicemail prompt */}
      <Dialog open={voicemailPromptOpen} onOpenChange={setVoicemailPromptOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>No answer</DialogTitle>
            <DialogDescription>
              Did you leave a voicemail for {contact.name}?
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => submit('no_answer', false)}
            >
              No voicemail
            </Button>
            <Button
              className="gap-2"
              disabled={saving}
              onClick={() => submit('voicemail', true)}
            >
              <Voicemail className="size-4" />
              Left a voicemail
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Call back later date picker */}
      <Dialog open={callBackOpen} onOpenChange={setCallBackOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Schedule the callback</DialogTitle>
            <DialogDescription>
              {contact.name} asked to be called back. Pick a date and time.
            </DialogDescription>
          </DialogHeader>
          <Input
            type="datetime-local"
            value={callBackAt}
            onChange={(e) => setCallBackAt(e.target.value)}
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => setCallBackOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={saving || !callBackAt}
              onClick={() => submit('spoke_call_back_later')}
            >
              Save callback
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
