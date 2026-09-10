'use client'

import { LeadDialog } from '@/components/landing/lead-dialog'
import { useOpportunity } from '@/components/landing/opportunity-context'
import {
  INACTIVE_MAX,
  INACTIVE_MIN,
  INACTIVE_STEP,
  VALUE_MAX,
  VALUE_MIN,
  VALUE_STEP,
  reactivatedPatients,
  sliderFillPercent,
} from '@/lib/opportunity'

function formatMoney(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US')
}

export function HeroOpportunity() {
  const calc = useOpportunity()
  if (!calc) {
    throw new Error(
      'HeroOpportunity must be rendered inside <OpportunityProvider>',
    )
  }
  const { inactiveCount, setInactiveCount, patientValue, setPatientValue } =
    calc

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
        <p className="text-pretty text-sm text-muted-foreground">
          Drag the sliders to match your practice.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <label
            htmlFor="hero-inactive"
            className="text-sm font-medium text-foreground"
          >
            How many inactive patient files do you have?
          </label>
          <span className="text-lg font-bold tabular-nums text-accent">
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
          className="range-slider"
          style={{
            ['--range-pct' as string]: sliderFillPercent(
              inactiveCount,
              INACTIVE_MIN,
              INACTIVE_MAX,
            ),
          }}
        />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <label
            htmlFor="hero-value"
            className="text-sm font-medium text-foreground"
          >
            What&apos;s a patient worth to you per year?
          </label>
          <span className="text-lg font-bold tabular-nums text-accent">
            {formatMoney(patientValue)}
          </span>
        </div>
        <input
          id="hero-value"
          type="range"
          min={VALUE_MIN}
          max={VALUE_MAX}
          step={VALUE_STEP}
          value={patientValue}
          onChange={(e) => setPatientValue(Number(e.target.value))}
          className="range-slider"
          style={{
            ['--range-pct' as string]: sliderFillPercent(
              patientValue,
              VALUE_MIN,
              VALUE_MAX,
            ),
          }}
        />
      </div>

      <div className="flex flex-col items-center gap-1 rounded-lg bg-accent/10 px-6 py-6 text-center">
        <p className="text-sm font-medium text-muted-foreground">
          Estimated additional annual revenue
        </p>
        <p
          className="text-4xl font-bold tabular-nums text-accent transition-all duration-200 md:text-5xl"
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
        Based on just 5% of your inactive files reactivating — practices
        typically see 20&ndash;40%. No ad spend, no new leads, just patients
        you already have.
      </p>
    </div>
  )
}
