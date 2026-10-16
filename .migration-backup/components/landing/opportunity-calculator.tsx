'use client'

import { useEffect, useRef, useState } from 'react'
import {
  VALUE_MAX,
  VALUE_MIN,
  VALUE_STEP,
  reactivatedPatients,
  sliderFillPercent,
} from '@/lib/opportunity'

interface OpportunityCalculatorProps {
  inactiveCount: number
  defaultPatientValue: number
  servicesLabel: string
}

const CALC_STEPS = [
  'Analyzing your patient database size...',
  'Applying conservative reactivation benchmarks...',
  'Calculating your annual revenue opportunity...',
]

function formatMoney(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US')
}

export function OpportunityCalculator({
  inactiveCount,
  defaultPatientValue,
  servicesLabel,
}: OpportunityCalculatorProps) {
  const [phase, setPhase] = useState<'calculating' | 'reveal'>('calculating')
  const [calcStep, setCalcStep] = useState(0)
  const [patientValue, setPatientValue] = useState(defaultPatientValue)
  const [displayRevenue, setDisplayRevenue] = useState(0)
  const rafRef = useRef<number | null>(null)

  const patients = reactivatedPatients(inactiveCount)
  const revenue = patients * patientValue

  // Step through the "calculating" messages, then reveal
  useEffect(() => {
    if (phase !== 'calculating') return
    if (calcStep < CALC_STEPS.length - 1) {
      const t = setTimeout(() => setCalcStep((s) => s + 1), 900)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setPhase('reveal'), 1100)
    return () => clearTimeout(t)
  }, [phase, calcStep])

  // Count-up animation toward the current revenue target
  useEffect(() => {
    if (phase !== 'reveal') return
    const start = displayRevenue
    const target = revenue
    if (start === target) return
    const duration = 900
    const t0 = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplayRevenue(start + (target - start) * eased)
      if (p < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, revenue])

  return (
    <section
      aria-labelledby="opportunity-heading"
      className="mx-auto flex w-full max-w-2xl flex-col items-center gap-8 text-center"
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">
          Your Reactivation Opportunity
        </p>
        <h2
          id="opportunity-heading"
          className="text-balance text-2xl font-bold text-foreground sm:text-3xl"
        >
          Here&apos;s what&apos;s sitting in your inactive patient list
        </h2>
      </div>

      {phase === 'calculating' ? (
        <div className="flex w-full flex-col items-center justify-center gap-5 rounded-xl border border-border bg-card px-6 py-14 shadow-sm">
          <div
            className="h-12 w-12 animate-spin rounded-full border-4 border-accent border-t-transparent"
            role="status"
            aria-label="Calculating"
          />
          <p className="text-base text-muted-foreground" aria-live="polite">
            {CALC_STEPS[calcStep]}
          </p>
        </div>
      ) : (
        <>
          <p className="text-pretty text-base leading-relaxed text-muted-foreground">
            Based on your{' '}
            <span className="font-semibold text-foreground">
              {inactiveCount.toLocaleString('en-US')} inactive patient files
            </span>
            , a conservative reactivation effort that re-engages just 5% of
            your inactive patients could bring back around{' '}
            <span className="font-semibold text-foreground">
              {patients.toLocaleString('en-US')} patients
            </span>
            {servicesLabel ? ` to your ${servicesLabel} practice` : ''} based
            on the numbers you provided.
          </p>

          <div className="flex w-full flex-col items-center gap-2 rounded-xl border border-border bg-card px-6 py-10 shadow-sm">
            <p className="text-sm font-medium text-muted-foreground">
              Estimated additional annual revenue
            </p>
            <p className="text-5xl font-bold tabular-nums text-accent sm:text-6xl">
              {formatMoney(displayRevenue)}
            </p>
            <p className="text-sm text-muted-foreground">
              per year, from patients who already know and trust you
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 rounded-lg border border-border bg-muted/40 px-6 py-5 text-left">
            <div className="flex items-baseline justify-between gap-4">
              <label
                htmlFor="patient-value"
                className="text-sm font-medium text-foreground"
              >
                What&apos;s a patient worth to you per year?
              </label>
              <span className="text-lg font-bold tabular-nums text-accent">
                {formatMoney(patientValue)}
              </span>
            </div>
            <input
              id="patient-value"
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
            <p className="text-xs leading-relaxed text-muted-foreground">
              Drag to match what an average patient is actually worth to your
              practice each year &mdash; your number updates as you go.
            </p>
          </div>

          <p className="max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">
            On your call, we&apos;ll map out how to capture this exact
            opportunity for your practice.
          </p>
        </>
      )}
    </section>
  )
}
