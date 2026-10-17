// @ts-nocheck
import { useState } from 'react'
import { useSearch } from 'wouter'
import { CalendarCheck2, CalendarClock, CheckCircle2, Clock, Laptop, Users } from 'lucide-react'
import { BookingCalendar } from '@/components/landing/booking-calendar'
import { usePageData } from '@/hooks/use-page-data'
import { usePageMeta } from '@/components/marketing/use-page-meta'
import { PageError, PageLoading } from '@/components/page-status'
import { bookOnboardingCall, getOnboardingAvailability } from '@/app/actions/onboarding'
import { timezoneLabel } from '@workspace/shared/us-timezones'

function bookedLabel(slot: string, timezone: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(slot))
}

function Notice({ title, children }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-accent/10">
        <CalendarClock className="size-7 text-accent" aria-hidden="true" />
      </span>
      <p className="text-lg font-semibold text-foreground">{title}</p>
      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  )
}

export default function OnboardingPage() {
  usePageMeta('Schedule Your Patient Pipeline Onboarding', 'Pick a time for your Patient Pipeline onboarding meeting.')
  const ref = new URLSearchParams(useSearch()).get('ref') ?? undefined
  const { data, loading, error } = usePageData<any>('/onboarding', { ref })
  const [justBooked, setJustBooked] = useState<{ slot: string; timezone: string } | null>(null)
  if (loading) return <PageLoading />
  if (error) return <PageError error={error} />
  const booked = justBooked ?? data.booked

  let body
  if (!data.valid) {
    body = <Notice title="Use the link in your onboarding email">{data.message}</Notice>
  } else if (booked) {
    body = (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-card px-6 py-14 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-success/10">
          <CalendarCheck2 className="size-7 text-success" aria-hidden="true" />
        </span>
        <p className="text-lg font-semibold text-foreground">Your onboarding is booked</p>
        <p className="text-2xl font-bold tracking-tight text-foreground">{bookedLabel(booked.slot, booked.timezone)}</p>
        <p className="text-sm text-muted-foreground">{timezoneLabel(booked.timezone)}</p>
        <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
          You will get a calendar confirmation by email. Need a different time? Reply to your onboarding email and we will help.
        </p>
      </div>
    )
  } else if (data.checking) {
    body = <Notice title="We are confirming your booking">We are checking whether your earlier time was saved. Please reload this page in a minute.</Notice>
  } else if (!data.configured) {
    body = <Notice title="Onboarding scheduling opens soon">Please reply to your onboarding email and we will find a time with you.</Notice>
  } else {
    body = (
      <BookingCalendar
        loadAvailability={(tz) => getOnboardingAvailability(ref, tz)}
        book={(slot, tz) => bookOnboardingCall({ ref, slot, timezone: tz })}
        onBooked={(slot, tz) => setJustBooked({ slot, timezone: tz })}
        confirmNoun="onboarding"
        savedNote=""
        unavailableNote="Please retry shortly, or reply to your onboarding email and we will schedule it with you."
      />
    )
  }

  return (
    <main className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center px-4 py-4 md:px-6">
          <img src="/images/patient-pipeline-logo.png" alt="Patient Pipeline" width={2172} height={724}
            fetchPriority="high" className="h-16 w-auto md:h-20" />
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center px-4 py-10 md:px-6 md:py-14">
        <div className="flex items-center gap-2 rounded-full border border-success/40 bg-success/10 px-4 py-1.5">
          <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
          <span className="text-sm font-semibold text-success">
            {booked ? "You're all set" : 'Your account is active'}
          </span>
        </div>

        <h1 className="mt-6 text-balance text-center text-3xl font-bold tracking-tight text-foreground md:text-4xl">
          {data.valid && data.firstName ? `${data.firstName}, schedule your onboarding` : 'Schedule your onboarding'}
        </h1>
        <p className="mt-4 max-w-2xl text-pretty text-center text-lg leading-relaxed text-muted-foreground">
          {data.valid && data.businessName ? <>We&apos;ll get the team at <span className="font-medium text-foreground">{data.businessName}</span> started with Reactivation. </> : null}
          Pick a time far enough out to gather what&apos;s listed in your onboarding email.
        </p>

        <ul className="mt-7 grid w-full gap-3 sm:grid-cols-3">
          {[
            [Clock, 'About 45–60 minutes'],
            [Users, 'You and your caller attend together'],
            [Laptop, 'Each person on a computer'],
          ].map(([Icon, text]) => (
            <li key={text} className="flex items-center gap-2 rounded-lg bg-secondary/50 p-4 text-sm font-medium leading-relaxed">
              <Icon className="size-4 shrink-0 text-accent" aria-hidden="true" />
              {text}
            </li>
          ))}
        </ul>

        <div className="mt-10 w-full">{body}</div>
      </section>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 px-4 py-8 text-center md:px-6">
          <p className="text-xs text-muted-foreground">{`© ${new Date().getFullYear()} Patient Pipeline. All rights reserved.`}</p>
        </div>
      </footer>
    </main>
  )
}
