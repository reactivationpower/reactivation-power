'use client'

import { useState } from 'react'
import {
  ChevronDown,
  CircleHelp,
  ClipboardList,
  ListChecks,
  Phone,
  UserRound,
} from 'lucide-react'

function buildSteps(person: string, org: string) {
  return [
    {
      icon: Phone,
      title: `Pick a ${person} and start the call`,
      body: `Work top to bottom through the Calls Due Now list and click Start Call. The ${person}\u2019s phone number is at the top of the call screen \u2014 on a phone or tablet, tapping it dials directly.`,
    },
    {
      icon: UserRound,
      title: 'Check previous calls before dialing',
      body: `If the ${person} was called before, a Previous Calls panel shows each attempt: the outcome, who called, and their notes (like \u201cprefers calls after 3pm\u201d). Read it first so you never go in cold.`,
    },
    {
      icon: ClipboardList,
      title: 'Follow the script on screen',
      body: `The script fills in the ${person}\u2019s name, your name, and the ${org} automatically. Use the dropdown to switch script types and the A+/A\u2212 buttons to enlarge the text while you talk.`,
    },
    {
      icon: ListChecks,
      title: 'Log the result \u2014 every call',
      body: `Type a quick note for the next caller, then click the outcome: No Answer, Spoke \u2014 Didn\u2019t Schedule, Spoke \u2014 Call Back Later (pick a date and they\u2019ll reappear in the queue), Scheduled, or Do Not Call. You\u2019re taken straight to the next ${person}.`,
    },
  ]
}

interface HowItWorksProps {
  /** "patient" for healthcare, "customer" for home services etc. */
  personLabel?: string
  /** "practice" for healthcare, "business" for home services etc. */
  orgLabel?: string
}

export function HowItWorks({
  personLabel = 'patient',
  orgLabel = 'practice',
}: HowItWorksProps) {
  const [open, setOpen] = useState(false)
  const STEPS = buildSteps(personLabel, orgLabel)

  return (
    <section
      className="rounded-lg border border-border bg-card"
      aria-label="How making calls works"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
      >
        <span className="flex items-center gap-2">
          <CircleHelp className="size-4 text-accent" />
          <span className="text-sm font-semibold text-foreground">
            New to making calls? How it works
          </span>
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <ol className="grid gap-4 border-t border-border p-4 sm:grid-cols-2">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/10">
                <step.icon className="size-4 text-accent" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  {i + 1}. {step.title}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
