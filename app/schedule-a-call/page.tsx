import type { Metadata } from 'next'
import { CalendarClock, CheckCircle2 } from 'lucide-react'
import { LeadForm } from '@/components/landing/lead-form'
import { SiteFooter } from '@/components/site/site-footer'
import { SiteHeader } from '@/components/site/site-header'

export const metadata: Metadata = {
  title: 'Schedule a Call — Reactivation Power',
  description:
    'Book a free strategy call to see what reactivation could do for your practice.',
}

/**
 * Set this to your scheduler embed URL (Calendly, Cal.com, etc.)
 * e.g. 'https://calendly.com/your-handle/strategy-call'
 */
const SCHEDULER_URL: string | null = null

const EXPECT = [
  'A realistic revenue estimate for your inactive list',
  'A walkthrough of the interactive calling system',
  'The biggest reactivation mistakes to avoid',
]

export default function ScheduleACallPage() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <SiteHeader />
      <main className="flex-1">
        <section className="mx-auto w-full max-w-4xl px-4 pb-16 pt-14 md:px-6 md:pt-20">
          <div className="text-center">
            <h1 className="text-balance text-4xl font-bold leading-tight tracking-tight text-foreground md:text-5xl">
              Schedule your free strategy call
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground">
              The call takes about 20 minutes. You&apos;ll leave with a
              realistic picture of what your inactive patient list is worth —
              whether or not we ever work together.
            </p>
          </div>

          <ul className="mx-auto mt-8 flex max-w-md flex-col gap-3">
            {EXPECT.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <CheckCircle2
                  className="mt-0.5 size-5 shrink-0 text-accent"
                  aria-hidden="true"
                />
                <span className="text-base leading-relaxed text-foreground">
                  {item}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-10 w-full">
            {SCHEDULER_URL ? (
              <iframe
                src={SCHEDULER_URL}
                title="Schedule your strategy call"
                className="h-[720px] w-full rounded-xl border border-border bg-card"
              />
            ) : (
              <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
                <span className="flex size-14 items-center justify-center rounded-full bg-accent/10">
                  <CalendarClock
                    className="size-7 text-accent"
                    aria-hidden="true"
                  />
                </span>
                <p className="text-lg font-semibold text-foreground">
                  Online scheduling coming soon
                </p>
                <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                  Until our calendar is live, fill out the form below and
                  we&apos;ll reach out within one business day to set up your
                  call.
                </p>
              </div>
            )}
          </div>

          <div className="mx-auto mt-12 max-w-xl rounded-xl border border-border bg-card p-6 shadow-sm md:p-8">
            <h2 className="text-xl font-semibold text-foreground">
              Prefer we reach out to you?
            </h2>
            <p className="mb-6 mt-1 text-sm text-muted-foreground">
              Tell us about your practice and we&apos;ll be in touch within one
              business day.
            </p>
            <LeadForm />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
