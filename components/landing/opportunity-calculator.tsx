'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import {
  VALUE_MAX,
  VALUE_MIN,
  VALUE_STEP,
  reactivatedPatients,
  sliderFillPercent,
} from '@/lib/opportunity'

interface OpportunityCalculatorProps {
  firstName: string
  contactId?: string
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
  firstName,
  contactId,
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

  if (phase === 'calculating') {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-8 px-4 text-center">
        <div
          className="h-14 w-14 animate-spin rounded-full border-4 border-accent border-t-transparent"
          role="status"
          aria-label="Calculating"
        />
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold text-foreground sm:text-2xl">
            {firstName ? `One moment, ${firstName}...` : 'One moment...'}
          </h1>
          <p
            className="text-base text-muted-foreground"
            aria-live="polite"
          >
            {CALC_STEPS[calcStep]}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-10 px-4 py-12 text-center sm:py-16">
      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-accent">
          Your Reactivation Opportunity
        </p>
        <h1 className="text-balance text-2xl font-bold text-foreground sm:text-3xl">
          {firstName ? `${firstName}, here` : 'Here'}&apos;s what&apos;s
          sitting in your inactive patient list
        </h1>
        <p className="text-pretty text-base leading-relaxed text-muted-foreground">
          Based on your{' '}
          <span className="font-semibold text-foreground">
            {inactiveCount.toLocaleString('en-US')} inactive patient files
          </span>
          , a conservative reactivation effort could bring back around{' '}
          <span className="font-semibold text-foreground">
            {patients.toLocaleString('en-US')} patients
          </span>
          {servicesLabel ? ` to your ${servicesLabel} practice` : ''}.
        </p>
      </div>

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
          practice each year — your number updates as you go.
        </p>
      </div>

      <div className="flex flex-col items-center gap-3">
        <Link
          href={
            contactId
              ? `/healthcare/book-a-call?cid=${encodeURIComponent(contactId)}&name=${encodeURIComponent(firstName)}`
              : '/healthcare/book-a-call'
          }
          className="rounded-md bg-accent px-8 py-3.5 text-base font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
        >
          Book My Free Strategy Call
        </Link>
        <p className="text-sm text-muted-foreground">
          On the call, we&apos;ll map out how to capture this exact
          opportunity for your practice.
        </p>
      </div>
    </div>
  )
}
