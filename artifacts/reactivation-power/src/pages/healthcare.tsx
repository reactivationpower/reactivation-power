// @ts-nocheck

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
import { HeroOpportunity } from '@/components/landing/hero-opportunity'
import { LeadDialog } from '@/components/landing/lead-dialog'
import { LeadForm } from '@/components/landing/lead-form'
import { OpportunityProvider } from '@/components/landing/opportunity-context'


const STATS = [
  { value: 'Both', label: 'workflows included together' },
  { value: 'Staff-led', label: 'calls guided by scripts' },
]

const STEPS = [
  {
    icon: Users,
    title: 'Add patients and campaign leads',
    body: 'Import your inactive patient list for Reactivation and connect incoming inquiries to their Lead Follow-Up campaign.',
  },
  {
    icon: PhoneCall,
    title: 'Your team calls with guided scripts',
    body: 'Use service-specific wording to check in with past patients and campaign-specific wording to follow up with new leads about the offer they saw.',
  },
  {
    icon: CalendarCheck,
    title: 'Book appointments and track everything',
    body: 'Log outcomes and notes, see callbacks due, and keep both calling queues organized in the portal.',
  },
]

const BENEFITS = [
  {
    icon: DollarSign,
    title: 'Reconnect with past patients',
    body: 'Your team can work through inactive patient files with a conversation tailored to the service each person last received.',
  },
  {
    icon: ShieldCheck,
    title: 'Follow up with new inquiries',
    body: 'Lead Follow-Up gives your staff a script tied to the campaign and offer each new inquiry responded to.',
  },
  {
    icon: ListChecks,
    title: 'Guidance for real conversations',
    body: 'Interactive scripts help your team respond to questions, hesitations, and requests for a callback.',
  },
  {
    icon: TrendingUp,
    title: 'Keep follow-ups organized',
    body: 'See logged call results and due follow-ups across both workflows rather than losing track after a first attempt.',
  },
]

export default function HealthcareLandingPage() {
  return (
    <OpportunityProvider>
    <main className="bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 md:px-6">
          <img
            src="/images/patient-pipeline-logo.png"
            alt="Patient Pipeline"
            width={2172}
            height={724}
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
              Bring past patients back. Follow up with new campaign leads.
            </h1>
            <p className="text-pretty text-lg leading-relaxed text-muted-foreground">
              Patient Pipeline helps your team call inactive patients with
              service-specific Reactivation scripts and incoming inquiries with
              campaign-specific Lead Follow-Up scripts. Both staff-led workflows
              are included together in one launch offer for one launch price.
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

          {/* Revenue opportunity calculator */}
          <HeroOpportunity />
        </div>
      </section>

      {/* Problem */}
      <section className="border-y border-border bg-card">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center md:px-6 md:py-20">
          <h2 className="text-balance text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Two kinds of conversations, one place to manage them
          </h2>
          <p className="mt-5 text-pretty text-lg leading-relaxed text-muted-foreground">
            Inactive patients and new campaign inquiries need different
            follow-up. Patient Pipeline gives your staff a way to check in with
            past patients based on their last service and call new leads about
            the specific campaign or offer they responded to.
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
          Three steps to organize both staff-led calling workflows.
        </p>
        <ol className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <li
              key={step.title}
              className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-lg bg-accent/10">
                  <step.icon className="size-5 text-accent" aria-hidden="true" />
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
            How Patient Pipeline supports your team
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
              Talk through both workflows for your practice
            </h2>
            <p className="text-pretty text-lg leading-relaxed text-muted-foreground">
              Book a strategy call to discuss your inactive patient list,
              incoming campaign leads, and how both included Patient Pipeline
              workflows could fit your team — no pressure, no obligation.
            </p>
            <ul className="flex flex-col gap-3">
              {[
                'How Reactivation handles inactive patient outreach',
                'How Lead Follow-Up handles campaign-specific inquiries',
                'What both workflows in one launch offer look like for your practice',
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
          <img
            src="/images/patient-pipeline-logo.png"
            alt="Patient Pipeline"
            width={2172}
            height={724}
            className="h-16 w-auto"
          />
          <p className="text-xs text-muted-foreground">
            {`© ${new Date().getFullYear()} Patient Pipeline. All rights reserved.`}
          </p>
        </div>
      </footer>
    </main>
    </OpportunityProvider>
  )
}
