import {
  Calendar,
  CalendarClock,
  CheckCircle2,
  NotebookPen,
  PhoneMissed,
  PhoneOff,
} from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

/**
 * Disabled preview of the call-logging controls that sit under the script on
 * a live call. The scripts' coaching notes tell the caller to "add your notes
 * and press the green Scheduled button below"; when someone rehearses with no
 * contact loaded, this shows them exactly where those controls will be so the
 * note never points at nothing. Labels and order mirror the live call screen.
 */
const PREVIEW_BUTTONS: {
  label: string
  icon: typeof PhoneMissed
  tone?: 'primary' | 'danger'
}[] = [
  { label: 'No Answer', icon: PhoneMissed },
  { label: 'Spoke, Didn\u2019t Schedule', icon: Calendar },
  { label: 'Spoke, Call Back Later', icon: CalendarClock },
  { label: 'Scheduled', icon: CheckCircle2, tone: 'primary' },
  { label: 'Do Not Call', icon: PhoneOff, tone: 'danger' },
]

export const PRACTICE_LOG_HINT =
  'Practice mode: nothing is saved here. These buttons and the notes box go live when you open a contact from the dialer.'

export function PracticeLogPreview() {
  return (
    <div
      className="flex flex-col gap-4"
      data-testid="practice-log-preview"
      aria-label="Call logging preview (practice mode)"
    >
      <section
        className="rounded-lg border border-dashed border-border bg-card"
        aria-labelledby="practice-what-happened"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2
            id="practice-what-happened"
            className="text-sm font-semibold text-foreground"
          >
            What happened on this call?
          </h2>
          <p className="text-xs text-muted-foreground">
            Pick one, then log it below
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 p-4">
          {PREVIEW_BUTTONS.map(({ label, icon: Icon, tone }) => (
            <button
              key={label}
              type="button"
              disabled
              aria-disabled="true"
              title={PRACTICE_LOG_HINT}
              className={cn(
                // Same idle look as the live call screen's buttons, dimmed.
                'inline-flex h-10 cursor-not-allowed items-center gap-2 rounded-md border px-3.5 text-sm font-medium opacity-60',
                tone === 'danger'
                  ? 'border-transparent bg-transparent text-destructive'
                  : 'border-input bg-background text-foreground',
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>
        <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
          {PRACTICE_LOG_HINT}
        </p>
      </section>

      <section
        className="rounded-lg border border-dashed border-border bg-card"
        aria-labelledby="practice-call-notes"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <NotebookPen className="size-4 text-accent" />
            <h2
              id="practice-call-notes"
              className="text-sm font-semibold text-foreground"
            >
              Notes for this call
            </h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Saved when you log the call
          </p>
        </div>
        <div className="p-4">
          <Textarea
            disabled
            readOnly
            value=""
            placeholder="On a live call, jot down what happened, best time to reach them, objections..."
            rows={3}
            className="resize-none text-base"
            aria-label="Notes for this call (practice mode, disabled)"
          />
        </div>
      </section>
    </div>
  )
}
