import type { Metadata } from 'next'
import Image from 'next/image'
import { CalendarClock, CheckCircle2 } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Book Your Strategy Call — Reactivation Power Program',
  description:
    'Pick a time for your free reactivation strategy call for your healthcare practice.',
}

/**
 * Set this to your scheduler embed URL (Calendly, Cal.com, etc.)
 * e.g. 'https://calendly.com/your-handle/strategy-call'
 */
const SCHEDULER_URL: string | null = null

export default function BookACallPage() {
  return (
    <main className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-4xl items-center px-4 py-4 md:px-6">
          <Image
            src="/images/logo-slogan.png"
            alt="Reactivation Power — Turning Old Business Into New Business & New Money!"
            width={1189}
            height={578}
            priority
            className="h-16 w-auto md:h-20"
          />
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center px-4 py-14 md:px-6">
        <div className="flex items-center gap-2 rounded-full border border-success/40 bg-success/10 px-4 py-1.5">
          <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
          <span className="text-sm font-semibold text-success">
            You&apos;re in — one last step
          </span>
        </div>

        <h1 className="mt-6 text-balance text-center text-3xl font-bold tracking-tight text-foreground md:text-4xl">
          Pick a time for your free strategy call
        </h1>
        <p className="mt-4 max-w-2xl text-pretty text-center text-lg leading-relaxed text-muted-foreground">
          Choose whatever time works best. The call takes about 20 minutes, and
          you&apos;ll leave with a realistic picture of what your inactive
          patient list is worth — whether or not we ever work together.
        </p>

        <div className="mt-10 w-full">
          {SCHEDULER_URL ? (
            <iframe
              src={SCHEDULER_URL}
              title="Schedule your strategy call"
              className="h-[720px] w-full rounded-xl border border-border bg-card"
            />
          ) : (
            <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-card px-6 py-20 text-center">
              <span className="flex size-14 items-center justify-center rounded-full bg-accent/10">
                <CalendarClock
                  className="size-7 text-accent"
                  aria-hidden="true"
                />
              </span>
              <p className="text-lg font-semibold text-foreground">
                Scheduler coming soon
              </p>
              <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                Your calendar booking tool (Calendly, Cal.com, etc.) will be
                embedded here. Until then, we&apos;ve received your information
                and will reach out within one business day to set up your call.
              </p>
            </div>
          )}
        </div>
      </section>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-2 px-4 py-8 text-center md:px-6">
          <p className="text-xs text-muted-foreground">
            {`© ${new Date().getFullYear()} Reactivation Power Program. All rights reserved.`}
          </p>
        </div>
      </footer>
    </main>
  )
}
