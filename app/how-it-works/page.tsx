import type { Metadata } from 'next'
import Link from 'next/link'
import {
  BookOpen,
  CalendarCheck,
  LayoutDashboard,
  MessageSquareText,
  PhoneCall,
  Upload,
  UserCheck,
} from 'lucide-react'
import { SiteFooter } from '@/components/site/site-footer'
import { SiteHeader } from '@/components/site/site-header'

export const metadata: Metadata = {
  title: 'How It Works — Reactivation Power',
  description:
    'What the Reactivation Power Program includes: step-by-step training, a word-for-word interactive calling system, and a complete portal for your front-desk team.',
}

const INCLUDES = [
  {
    icon: BookOpen,
    title: 'Step-by-step video training',
    body: 'Your team learns the reactivation approach through short, practical video courses — the mindset, the method, and the exact process, with nothing left to guess.',
  },
  {
    icon: MessageSquareText,
    title: 'Word-for-word interactive scripts',
    body: 'Callers read exactly what appears on screen. Whatever the patient says, one tap shows the right next words — objections, hesitations, and voicemail included. Zero sales experience required.',
  },
  {
    icon: LayoutDashboard,
    title: 'A complete calling portal',
    body: 'Import your patient list and the portal builds an organized call queue with full history on every contact, automatic follow-up reminders, and a dashboard tracking recovered revenue.',
  },
  {
    icon: UserCheck,
    title: 'Scripts built for your services',
    body: 'The system covers more than twenty service niches across chiropractic, dental, med spa, and wellness — each with scripting written specifically for that service and that patient.',
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
    body: 'Every call is logged with an outcome. Callbacks resurface on schedule, the pipeline updates itself, and you watch recovered revenue accumulate month after month.',
  },
]

const NICHES = [
  'Chiropractic',
  'Decompression',
  'Neuropathy',
  'Joint Pain',
  'Acupuncture',
  'Massage Therapy',
  'Gut Health',
  'Botox',
  'Skin Tightening',
  'Cellulite Reduction',
  'Laser Hair Removal',
  'Teeth Whitening',
  'Clear Aligners',
  'Orthodontics',
  'Dental Implants',
  'Weight Loss',
  'And more',
]

export default function HowItWorksPage() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <SiteHeader />
      <main className="flex-1">
        {/* Intro */}
        <section className="mx-auto max-w-3xl px-4 pb-4 pt-14 text-center md:px-6 md:pt-20">
          <p className="mx-auto w-fit rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent">
            The Program
          </p>
          <h1 className="mt-5 text-balance text-4xl font-bold leading-tight tracking-tight text-foreground md:text-5xl">
            A complete system, not just advice
          </h1>
          <p className="mt-5 text-pretty text-lg leading-relaxed text-muted-foreground">
            Reactivation Power is training and software together. Your team
            learns the approach, then works inside a portal that tells them
            exactly who to call and exactly what to say — from the first hello
            to the booked appointment.
          </p>
        </section>

        {/* What you get */}
        <section className="mx-auto max-w-6xl px-4 py-14 md:px-6 md:py-20">
          <h2 className="text-balance text-center text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            What&apos;s included
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
              What it looks like day to day
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

        {/* Niches */}
        <section className="mx-auto max-w-4xl px-4 py-14 text-center md:px-6 md:py-20">
          <h2 className="text-balance text-3xl font-bold tracking-tight text-foreground md:text-4xl">
            Built for the services you actually offer
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground">
            Every niche gets its own scripting — because a lapsed chiropractic
            patient and a past Botox client need very different conversations.
          </p>
          <ul className="mt-8 flex flex-wrap justify-center gap-2">
            {NICHES.map((niche) => (
              <li
                key={niche}
                className="rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium text-foreground"
              >
                {niche}
              </li>
            ))}
            <li className="rounded-full border border-accent bg-accent/10 px-4 py-1.5 text-sm font-semibold text-accent">
              {"Don't see your niche? We'll build it for you."}
            </li>
          </ul>
        </section>

        {/* CTA */}
        <section className="border-t border-border bg-card">
          <div className="mx-auto max-w-3xl px-4 py-16 text-center md:px-6 md:py-20">
            <h2 className="text-balance text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              Wondering if it fits your practice?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
              That&apos;s exactly what the strategy call is for. We&apos;ll
              look at your services, your inactive list, and give you a
              realistic picture — whether or not we ever work together.
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
