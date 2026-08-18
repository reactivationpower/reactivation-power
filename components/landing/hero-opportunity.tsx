'use client'

import { useState } from 'react'
import { LeadDialog } from '@/components/landing/lead-dialog'
import {
  SLIDER_MAX,
  SLIDER_MIN,
  SLIDER_STEP,
  reactivatedPatients,
} from '@/lib/opportunity'

const INACTIVE_MIN = 100
const INACTIVE_MAX = 5000
const INACTIVE_STEP = 100

function formatMoney(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US')
}

export function HeroOpportunity() {
  const [inactiveCount, setInactiveCount] = useState(500)
  const [patientValue, setPatientValue] = useState(1000)

  const patients = reactivatedPatients(inactiveCount)
  const revenue = patients * patientValue

  return (
    <div className="flex flex-col gap-5 rounded-xl border border-border bg-card p-6 shadow-sm md:p-8">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">
          Your Revenue Opportunity
        </p>
        <h2 className="text-balance text-xl font-bold text-foreground md:text-2xl">
          See what&apos;s hiding in your inactive patient list
        </h2>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-4">
          <label
            htmlFor="hero-inactive"
            className="text-sm font-medium text-foreground"
          >
            Inactive patients in your list
          </label>
          <span className="text-base font-semibold tabular-nums text-foreground">
            {inactiveCount.toLocaleString('en-US')}
            {inactiveCount >= INACTIVE_MAX ? '+' : ''}
          </span>
        </div>
        <input
          id="hero-inactive"
          type="range"
          min={INACTIVE_MIN}
          max={INACTIVE_MAX}
          step={INACTIVE_STEP}
          value={inactiveCount}
          onChange={(e) => setInactiveCount(Number(e.target.value))}
          className="w-full accent-accent"
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-4">
          <label
            htmlFor="hero-value"
            className="text-sm font-medium text-foreground"
          >
            Average annual patient value
          </label>
          <span className="text-base font-semibold tabular-nums text-foreground">
            {formatMoney(patientValue)}
          </span>
        </div>
        <input
          id="hero-value"
          type="range"
          min={SLIDER_MIN}
          max={SLIDER_MAX}
          step={SLIDER_STEP}
          value={patientValue}
          onChange={(e) => setPatientValue(Number(e.target.value))}
          className="w-full accent-accent"
        />
      </div>

      <div className="flex flex-col items-center gap-1 rounded-lg bg-accent/10 px-6 py-6 text-center">
        <p className="text-sm font-medium text-muted-foreground">
          Estimated additional annual revenue
        </p>
        <p
          className="text-4xl font-bold tabular-nums text-accent md:text-5xl"
          aria-live="polite"
        >
          {formatMoney(revenue)}
        </p>
        <p className="text-sm text-muted-foreground">
          from roughly {patients.toLocaleString('en-US')} reactivated patients
          who already trust you
        </p>
      </div>

      <LeadDialog>
        <button
          type="button"
          className="w-full rounded-md bg-accent px-6 py-3 text-base font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
        >
          Show Me How to Capture This
        </button>
      </LeadDialog>
      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        Conservative estimate — no ad spend, no new leads, just patients you
        already have.
      </p>
    </div>
  )
}
