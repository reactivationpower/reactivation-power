import type { Metadata } from 'next'
import { CalendarCheck, CheckCircle2, ClipboardList } from 'lucide-react'
import { LeadForm } from '@/components/landing/lead-form'
import { SiteFooter } from '@/components/site/site-footer'
import { SiteHeader } from '@/components/site/site-header'

export const metadata: Metadata = {
  title: 'Schedule a Call | Reactivation Power',
  description:
    'Book a free strategy call to see what reactivation could do for your practice.',
}

const EXPECT = [
  'A realistic revenue estimate for your inactive list',
  'A walkthrough of the interactive calling system',
  'The biggest reactivation mistakes to avoid',
]

const STEPS = [
  {
    icon: ClipboardList,
    label: 'Tell us about your practice',
    detail: 'About 30 seconds',
    current: true,
  },
  {
    icon: CalendarCheck,
    label: 'Pick a time on our calendar',
    detail: 'Next screen',
    current: false,
  },
]

/**
 * Booking runs against a CRM contact, so the form has to come first. Once it
 * is submitted the visitor lands on the live calendar to choose a slot.
 */
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
              realistic picture of what your inactive patient list is worth,
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

          <div className="mx-auto mt-12 max-w-xl rounded-xl border border-border bg-card p-6 shadow-sm md:p-8">
            <ol
              aria-label="Booking steps"
              className="mb-6 grid grid-cols-2 gap-3 border-b border-border pb-6"
            >
              {STEPS.map((step, i) => (
                <li
                  key={step.label}
                  aria-current={step.current ? 'step' : undefined}
                  className="flex items-start gap-3"
                >
                  <span
                    className={
                      step.current
                        ? 'flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground'
                        : 'flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground'
                    }
                  >
                    <step.icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="flex flex-col">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Step {i + 1}
                    </span>
                    <span
                      className={
                        step.current
                          ? 'text-sm font-semibold text-foreground'
                          : 'text-sm font-medium text-muted-foreground'
                      }
                    >
                      {step.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {step.detail}
                    </span>
                  </span>
                </li>
              ))}
            </ol>

            <h2 className="text-xl font-semibold text-foreground">
              Tell us about your practice
            </h2>
            <p className="mb-6 mt-1 text-sm leading-relaxed text-muted-foreground">
              Our calendar opens on the next screen so you can pick whatever
              time works best for you.
            </p>
            <LeadForm />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
