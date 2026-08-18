import type { Metadata } from 'next'
import Image from 'next/image'
import {
  CalendarCheck,
  DollarSign,
  Headset,
  ListChecks,
  PhoneCall,
  ShieldCheck,
  TrendingUp,
  Users,
} from 'lucide-react'
import { LeadDialog } from '@/components/landing/lead-dialog'
import { LeadForm } from '@/components/landing/lead-form'
import { TestimonialVideo } from '@/components/landing/testimonial-video'

export const metadata: Metadata = {
  title: 'Reactivation Power Program for Healthcare Practices',
  description:
    'Turn your inactive patient list into tens of thousands in recovered revenue — with proven scripts, an interactive call system, and step-by-step training built for healthcare practices.',
}

const STATS = [
  { value: '5–7x', label: 'cheaper than acquiring a new patient' },
  { value: '20–40%', label: 'of inactive lists typically rebook' },
  { value: '$0', label: 'in ad spend required' },
]

const STEPS = [
  {
    icon: Users,
    title: 'Import your inactive patient list',
    body: 'Upload your patient export and the system automatically builds an organized call queue — who to call, in what order, with full history on every contact.',
  },
  {
    icon: PhoneCall,
    title: 'Call with a word-for-word interactive script',
    body: 'Your team reads exactly what appears on screen. Whatever the patient says, they click the matching response and the script instantly shows the right next words — objections included.',
  },
  {
    icon: CalendarCheck,
    title: 'Book appointments and track everything',
    body: 'Every call is logged with an outcome and notes. Callbacks resurface automatically, and you watch recovered revenue climb on your dashboard.',
  },
]

const BENEFITS = [
  {
    icon: DollarSign,
    title: 'Revenue hiding in plain sight',
    body: 'Your inactive patient list is the highest-ROI asset you own. These patients already know and trust you — they just drifted away.',
  },
  {
    icon: ShieldCheck,
    title: 'Reputation-safe by design',
    body: 'Most reactivation attempts sound like pushy sales calls and damage goodwill. Our scripts lead with genuine care, so patients feel valued — not sold to.',
  },
  {
    icon: ListChecks,
    title: 'No guesswork for your team',
    body: 'Front-desk staff need zero sales experience. The interactive script tells them exactly what to say at every turn, including every common objection.',
  },
  {
    icon: TrendingUp,
    title: 'Compounds month after month',
    body: 'Reactivation is not a one-time blitz. The system keeps surfacing due follow-ups so recovered revenue becomes a repeatable monthly process.',
  },
]

export default function HealthcareTestimonialLandingPage() {
  return (
    <main className="bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 md:px-6">
          <Image
            src="/images/logo-slogan.png"
            alt="Reactivation Power — Turning Old Business Into New Business & New Money!"
            width={1189}
            height={578}
            priority
            className="h-16 w-auto md:h-20"
          />
          <LeadDialog>
            <button
              type="button"
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
            >
              Book a Call
            </button>
          </LeadDialog>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-14 md:px-6 md:pb-24 md:pt-20">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <p className="w-fit rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent">
              For Healthcare Practices
            </p>
            <h1 className="text-balance text-4xl font-bold leading-tight tracking-tight text-foreground md:text-5xl">
              Your inactive patients are worth tens of thousands. We help you
              bring them back.
            </h1>
            <p className="text-pretty text-lg leading-relaxed text-muted-foreground">
              The Reactivation Power Program gives your front desk a proven,
              word-for-word calling system that reactivates lapsed patients —
              without ads, without new leads, and without sounding like a sales
              call.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <LeadDialog>
                <button
                  type="button"
                  className="rounded-md bg-accent px-6 py-3 text-base font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
                >
                  Get My Free Strategy Call
                </button>
              </LeadDialog>
              <a
                href="#how-it-works"
                className="rounded-md border border-border bg-card px-6 py-3 text-base font-semibold text-foreground transition-colors hover:bg-muted"
              >
                See How It Works
              </a>
            </div>
            <dl className="mt-2 grid grid-cols-3 gap-4">
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

          {/* Testimonial video (placeholder until a video is provided) */}
          <figure className="flex flex-col gap-4">
            <TestimonialVideo />
            <figcaption className="text-center text-sm leading-relaxed text-muted-foreground">
              Hear how one practice turned their dormant patient list into
              booked-solid weeks.
            </figcaption>
          </figure>
        </div>
      </section>

      {/* Problem */}
      <section className="border-y border-border bg-card">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center md:px-6 md:py-20">
          <h2 className="text-balance text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Every practice has a goldmine it never touches
          </h2>
          <p className="mt-5 text-pretty text-lg leading-relaxed text-muted-foreground">
            Most practices spend thousands chasing brand-new patients while
            hundreds of past patients — people who already trust you — quietly
            drift away. They didn&apos;t leave because they were unhappy. Life
            got busy. Nobody checked in. And when reactivation is attempted the
            wrong way, it sounds like a pushy sales pitch that damages the very
            trust you built. Done the right way, it books appointments and
            deepens loyalty at the same time.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section
        id="how-it-works"
        className="mx-auto max-w-6xl scroll-mt-8 px-4 py-16 md:px-6 md:py-24"
      >
        <h2 className="text-balance text-center text-3xl font-bold tracking-tight text-foreground md:text-4xl">
          How it works
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-pretty text-center text-lg leading-relaxed text-muted-foreground">
          Three steps, fully systemized — from dormant list to booked
          appointments.
        </p>
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
                  Step {i + 1}
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
            Why practices choose the Reactivation Power Program
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

      {/* Lead capture */}
      <section
        id="get-started"
        className="mx-auto max-w-6xl scroll-mt-8 px-4 py-16 md:px-6 md:py-24"
      >
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
          <div className="flex flex-col gap-5">
            <h2 className="text-balance text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              See what your patient list is really worth
            </h2>
            <p className="text-pretty text-lg leading-relaxed text-muted-foreground">
              Book a free strategy call and we&apos;ll walk through your
              practice, your inactive list, and exactly how the Reactivation
              Power Program would work for you — no pressure, no obligation.
            </p>
            <ul className="flex flex-col gap-3">
              {[
                'A realistic revenue estimate for your inactive list',
                'A walkthrough of the interactive calling system',
                'The biggest reactivation mistakes to avoid',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <Headset
                    className="mt-0.5 size-5 shrink-0 text-accent"
                    aria-hidden="true"
                  />
                  <span className="text-base leading-relaxed text-foreground">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm md:p-8">
            <h3 className="text-xl font-semibold text-foreground">
              Get started — it takes 30 seconds
            </h3>
            <p className="mb-6 mt-1 text-sm text-muted-foreground">
              Fill this out, then pick a time for your call on the next page.
            </p>
            <LeadForm />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-8 text-center md:px-6">
          <Image
            src="/images/logo-slogan.png"
            alt="Reactivation Power — Turning Old Business Into New Business & New Money!"
            width={1189}
            height={578}
            className="h-16 w-auto"
          />
          <p className="text-xs text-muted-foreground">
            {`© ${new Date().getFullYear()} Reactivation Power Program. All rights reserved.`}
          </p>
        </div>
      </footer>
    </main>
  )
}
