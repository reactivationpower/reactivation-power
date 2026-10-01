// @ts-nocheck
import { Link } from "wouter";
import {
  BookOpen,
  CalendarCheck,
  LayoutDashboard,
  MessageSquareText,
  PhoneCall,
  Upload,
  UserCheck,
  Megaphone,
} from 'lucide-react'
import { ServicesWeSupport } from '@/components/site/services-we-support'
import { SiteFooter } from '@/components/site/site-footer'
import { SiteHeader } from '@/components/site/site-header'


const INCLUDES = [
  {
    icon: BookOpen,
    title: 'Step-by-step video training',
    body: 'Short, practical lessons help your team learn the reactivation approach before they start calling past patients.',
  },
  {
    icon: MessageSquareText,
    title: 'Word-for-word interactive scripts',
    body: 'Callers follow on-screen conversation paths, with options for objections, hesitations and voicemail. Lead Follow-Up has its own campaign-aware scripts.',
  },
  {
    icon: LayoutDashboard,
    title: 'A complete calling portal',
    body: 'Import past patients into a reactivation queue, or receive leads from a campaign intake form. Call outcomes and follow-ups stay visible in the portal.',
  },
  {
    icon: UserCheck,
    title: 'Scripts built for your services',
    body: 'Choose supported services for your practice and use the relevant conversation paths. Lead campaigns can be set up around a specific offer.',
  },
]

const PROCESS = [
  {
    icon: Upload,
    step: 'Step 1',
    title: 'Load your inactive patient files',
    body: 'Export your inactive patients from your practice software and upload the list. The portal organizes it into a prioritized call queue automatically.',
  },
  {
    icon: PhoneCall,
    step: 'Step 2',
    title: 'Your front desk starts calling',
    body: 'A team member opens the call screen, dials, and follows the on-screen script. The conversation leads with genuine care — checking in, listening, and only then inviting the patient back in.',
  },
  {
    icon: CalendarCheck,
    step: 'Step 3',
    title: 'Appointments get booked and tracked',
    body: 'Log each outcome, see callbacks due, and review activity in the portal. Your team handles the actual calls and scheduling.',
  },
]

export default function HowItWorksPage() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <SiteHeader />
      <main className="flex-1">
        {/* Intro */}
        <section className="mx-auto max-w-3xl px-4 pb-4 pt-14 text-center md:px-6 md:pt-20">
          <p className="mx-auto w-fit rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent">
             Patient Pipeline
          </p>
          <h1 className="mt-5 text-balance text-4xl font-bold leading-tight tracking-tight text-foreground md:text-5xl">
             Two ways to keep conversations moving
          </h1>
          <p className="mt-5 text-pretty text-lg leading-relaxed text-muted-foreground">
             Reactivation starts with inactive patients; Lead Follow-Up starts
             with incoming inquiries from a specific campaign or offer. Both
             staff-led workflows are included together in one Patient Pipeline
             launch offer for one launch price. Your team can call, track
             outcomes and keep follow-ups organized.
          </p>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-12 md:px-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-7">
              <Upload className="size-7 text-accent" aria-hidden="true" />
              <h2 className="mt-4 text-2xl font-bold text-foreground">Reactivation</h2>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                Bring an inactive patient list from your practice software into
                a calling queue. Your team checks in with former patients using
                service-specific scripts, records each outcome, and follows up
                when a callback is due. This path starts with your existing files,
                not an ad campaign.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-7">
              <Megaphone className="size-7 text-accent" aria-hidden="true" />
              <h2 className="mt-4 text-2xl font-bold text-foreground">Lead Follow-Up</h2>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                Set up a campaign around an offer and connect its lead intake.
                New inquiries enter that campaign&apos;s lead queue, where your
                team can call with the offer in context, log dispositions and
                see which leads need another attempt. No inactive patient list
                is needed for this workflow.
              </p>
            </div>
          </div>
        </section>

        {/* What you get */}
        <section className="mx-auto max-w-6xl px-4 py-14 md:px-6 md:py-20">
          <h2 className="text-balance text-center text-3xl font-bold tracking-tight text-foreground md:text-4xl">
             What&apos;s included in both workflows
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2">
            {INCLUDES.map((item) => (
              <div
                key={item.title}
                className="flex gap-4 rounded-xl border border-border bg-card p-6"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent/10">
                  <item.icon
                    className="size-5 text-accent"
                    aria-hidden="true"
                  />
                </span>
                <div className="flex flex-col gap-2">
                  <h3 className="text-lg font-semibold text-foreground">
                    {item.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {item.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* The process */}
        <section className="border-y border-border bg-card">
          <div className="mx-auto max-w-6xl px-4 py-14 md:px-6 md:py-20">
            <h2 className="text-balance text-center text-3xl font-bold tracking-tight text-foreground md:text-4xl">
             What reactivation looks like day to day
            </h2>
            <ol className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
              {PROCESS.map((item) => (
                <li
                  key={item.title}
                  className="flex flex-col gap-4 rounded-xl border border-border bg-background p-6"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-lg bg-accent/10">
                      <item.icon
                        className="size-5 text-accent"
                        aria-hidden="true"
                      />
                    </span>
                    <span className="text-sm font-semibold text-muted-foreground">
                      {item.step}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">
                    {item.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {item.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-14 md:px-6 md:py-20">
          <h2 className="text-center text-3xl font-bold tracking-tight text-foreground md:text-4xl">For new campaign leads</h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {[
              { icon: Megaphone, title: 'Set up your offer', body: 'Create a lead campaign for the service and offer you are promoting, then connect its intake form.' },
              { icon: PhoneCall, title: 'Work the lead queue', body: 'New inquiries appear in the campaign. Callers use the lead follow-up script with that offer in context.' },
              { icon: CalendarCheck, title: 'Log and follow up', body: 'Record call results and booked times; see which leads are due for another attempt.' },
            ].map((item, index) => (
              <li key={item.title} className="rounded-xl border border-border bg-card p-6">
                <item.icon className="size-6 text-accent" aria-hidden="true" />
                <p className="mt-3 text-sm font-semibold text-muted-foreground">Step {index + 1}</p>
                <h3 className="mt-2 text-lg font-semibold text-foreground">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Services we have scripts for */}
        <ServicesWeSupport />

        {/* CTA */}
        <section className="border-t border-border bg-card">
          <div className="mx-auto max-w-3xl px-4 py-16 text-center md:px-6 md:py-20">
            <h2 className="text-balance text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              Wondering if it fits your practice?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
               That&apos;s exactly what the strategy call is for. We&apos;ll
               talk through your services, inactive list and incoming campaign
               inquiries so you can see how both included workflows fit your team.
            </p>
            <Link
              href="/schedule-a-call"
              className="mt-8 inline-block rounded-md bg-accent px-8 py-3.5 text-base font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
            >
              Schedule a Call
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
