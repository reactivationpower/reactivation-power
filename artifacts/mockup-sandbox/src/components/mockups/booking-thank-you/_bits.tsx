import { CheckCircle2 } from 'lucide-react'

// Sample data standing in for the /healthcare/thank-you page loader.
export const SAMPLE = {
  firstName: 'Sarah',
  bookedFor: 'Tuesday, October 13 at 2:00 PM',
  timezoneLabel: 'Eastern Time',
  inactiveCount: 1000,
  patientValue: 2000,
  servicesLabel: 'dental',
}

// Same bounds as @workspace/shared/opportunity and the homepage combined calculator.
export const REACTIVATION_RATE = 0.05
export const INACTIVE_MIN = 100
export const INACTIVE_MAX = 5000
export const INACTIVE_STEP = 100
export const VALUE_MIN = 1000
export const VALUE_MAX = 5000
export const VALUE_STEP = 100
export const COMBINED_VALUE_MAX = 10000
export const LEADS_MIN = 1
export const LEADS_MAX = 40
export const LEADS_DEFAULT = 5

export const reactivatedPatients = (n: number) => Math.max(1, Math.round(n * REACTIVATION_RATE))
export const sliderFillPercent = (v: number, min: number, max: number) => `${((v - min) / (max - min)) * 100}%`
export const formatMoney = (n: number) => '$' + Math.round(n).toLocaleString('en-US')

export function PageHeader() {
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-5xl items-center px-4 py-4 md:px-6">
        <img src="/__mockup/images/patient-pipeline-logo.png" alt="Patient Pipeline" width={2172} height={724} className="h-16 w-auto md:h-20" />
      </div>
    </header>
  )
}

export function BookedBlock() {
  return (
    <>
      <span className="flex size-16 items-center justify-center rounded-full bg-[hsl(var(--success)/0.1)]">
        <CheckCircle2 className="size-9 text-[hsl(var(--success))]" aria-hidden="true" />
      </span>
      <h1 className="mt-6 text-balance text-center text-3xl font-bold tracking-tight text-foreground md:text-4xl">
        {SAMPLE.firstName}, you&apos;re booked!
      </h1>
      <p className="mt-4 max-w-2xl text-pretty text-center text-lg leading-relaxed text-muted-foreground">
        Your strategy call is confirmed for{' '}
        <span className="font-semibold text-foreground">{SAMPLE.bookedFor}</span> ({SAMPLE.timezoneLabel}). Check your email for the details
        &mdash; we look forward to talking with you.
      </p>
    </>
  )
}

export function PageFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 px-4 py-8 text-center md:px-6">
        <p className="text-xs text-muted-foreground">{`© ${new Date().getFullYear()} Patient Pipeline. All rights reserved.`}</p>
      </div>
    </footer>
  )
}
