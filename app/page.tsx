import type { Metadata } from 'next'
import Link from 'next/link'
import {
  CalendarCheck,
  DollarSign,
  ListChecks,
  PhoneCall,
  ShieldCheck,
  TrendingUp,
  Users,
} from 'lucide-react'
import { HeroOpportunity } from '@/components/landing/hero-opportunity'
import { OpportunityProvider } from '@/components/landing/opportunity-context'
import { SiteFooter } from '@/components/site/site-footer'
import { SiteHeader } from '@/components/site/site-header'

export const metadata: Metadata = {
  title: 'Reactivation Power — Turn Old Patients Into New Revenue',
  description:
    'Reactivation Power helps healthcare practices recover revenue hiding in their inactive patient files — no ad spend, no new leads, just patients who already know and trust you.',
}

const STATS = [
  { value: '5–7x', label: 'cheaper than acquiring a new patient' },
  { value: '$0', label: 'in ad spend required' },
]

const STEPS = [
  {
    icon: Users,
    title: 'Your inactive patient files',
    body: 'Every practice has hundreds of past patients who drifted away — not because they were unhappy, but because life got busy and nobody checked in.',
  },
  {
    icon: PhoneCall,
    title: 'A proven reactivation system',
    body: 'Your front desk calls with a word-for-word interactive script that leads with genuine care — so patients feel valued, never sold to.',
  },
  {
    icon: CalendarCheck,
    title: 'Recovered revenue',
    body: 'Appointments get booked, follow-ups resurface automatically, and reactivation becomes a repeatable monthly process — not a one-time blitz.',
  },
]

const BENEFITS = [
  {
    icon: DollarSign,
    title: 'Money you already earned',
    body: 'Your inactive patient list is the highest-ROI asset you own. Reactivation taps revenue sitting in your database instead of paying to reach strangers.',
  },
  {
    icon: ShieldCheck,
    title: 'Reputation-safe by design',
    body: 'Most reactivation attempts sound like pushy sales calls. Our scripts are built around genuine care, protecting the trust your practice took years to build.',
  },
  {
    icon: ListChecks,
    title: 'No sales experience needed',
    body: 'The interactive script tells your team exactly what to say at every turn — including every common objection — so anyone at the front desk can do it.',
  },
  {
    icon: TrendingUp,
    title: 'Works for new services too',
    body: 'Launching a new service? Your existing and inactive patients are the easiest people to introduce it to — they already know and trust you.',
  },
]

export default function HomePage() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <SiteHeader />
      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-14 md:px-6 md:pb-24 md:pt-20">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
            <div className="flex flex-col gap-6">
              <p className="w-fit rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent">
                For Healthcare Practices
              </p>
              <h1 className="text-balance text-4xl font-bold leading-tight tracking-tight text-foreground md:text-5xl">
                Turning old business into new business &amp; new money.
              </h1>
              <p className="text-pretty text-lg leading-relaxed text-muted-foreground">
                Reactivation Power helps practices recover the revenue hiding
                in their inactive patient files — without spending a dollar on
                marketing to people who have never heard of you.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/schedule-a-call"
                  className="rounded-md bg-accent px-6 py-3 text-base font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
                >
                  Schedule a Call
                </Link>
                <Link
                  href="/how-it-works"
                  className="rounded-md border border-border bg-card px-6 py-3 text-base font-semibold text-foreground transition-colors hover:bg-muted"
                >
                  How It Works
                </Link>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-4">
                {STATS.map((s) => (
                  <div key={s.label} className="flex flex-col gap-1">
                    <dt className="sr-only">{s.label}</dt>
                    <dd className="text-2xl font-bold text-foreground md:text-3xl">
                      {s.value}
                    </dd>
                    <dd className="text-xs leading-snug text-muted-foreground md:text-sm">
                      {s.label}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <OpportunityProvider>
              <HeroOpportunity />
            </OpportunityProvider>
          </div>
        </section>

        {/* The idea */}
        <section className="border-y border-border bg-card">
          <div className="mx-auto max-w-3xl px-4 py-16 text-center md:px-6 md:py-20">
            <h2 className="text-balance text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              The most profitable patients are the ones you already have
            </h2>
            <p className="mt-5 text-pretty text-lg leading-relaxed text-muted-foreground">
              Acquiring a brand-new patient means paying for ads, clicks,
              leads, and follow-up — with an uncertain outcome. Reactivating a
              past patient takes a phone call. They already know you, already
              trust you, and already said yes to you once. Reactivation Power
              gives your practice the complete system to bring them back the
              right way.
            </p>
          </div>
        </section>

        {/* Three steps */}
        <section className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
          <h2 className="text-balance text-center text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            From dormant files to booked appointments
          </h2>
          <ol className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <li
                key={step.title}
                className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6"
              >
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-accent/10">
                    <step.icon
                      className="size-5 text-accent"
                      aria-hidden="true"
                    />
                  </span>
                  <span className="text-sm font-semibold text-muted-foreground">
                    {`Step ${i + 1}`}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-foreground">
                  {step.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* Benefits */}
        <section className="border-y border-border bg-card">
          <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
            <h2 className="text-balance text-center text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              Why practices choose Reactivation Power
            </h2>
            <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2">
              {BENEFITS.map((b) => (
                <div
                  key={b.title}
                  className="flex gap-4 rounded-xl border border-border bg-background p-6"
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent/10">
                    <b.icon className="size-5 text-accent" aria-hidden="true" />
                  </span>
                  <div className="flex flex-col gap-2">
                    <h3 className="text-lg font-semibold text-foreground">
                      {b.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {b.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="mx-auto max-w-3xl px-4 py-16 text-center md:px-6 md:py-24">
          <h2 className="text-balance text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            See what reactivation could do for your practice
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
            Book a free strategy call. We&apos;ll walk through your practice
            and your inactive list — no pressure, no obligation.
          </p>
          <Link
            href="/schedule-a-call"
            className="mt-8 inline-block rounded-md bg-accent px-8 py-3.5 text-base font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
          >
            Schedule a Call
          </Link>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
