import type { Metadata } from 'next'
import Image from 'next/image'
import { CheckCircle2 } from 'lucide-react'
import { OpportunityCalculator } from '@/components/landing/opportunity-calculator'
import { parseInactiveCount, parsePatientValue } from '@/lib/opportunity'
import {
  DEFAULT_TIMEZONE,
  isUsTimezone,
  timezoneLabel,
} from '@/lib/us-timezones'

export const metadata: Metadata = {
  title: "You're Booked — Reactivation Power Program",
  description:
    'Your strategy call is confirmed. See what reactivating your inactive patients could add to your practice every year.',
  robots: { index: false },
}

function servicesLabel(services: string[]): string {
  if (services.length === 0) return ''
  if (services.length === 1) return services[0]
  if (services.length === 2) return `${services[0]} and ${services[1]}`
  return `${services[0]}, ${services[1]}, and more`
}

export default async function ThankYouPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const str = (key: string, max: number) => {
    const v = params[key]
    return typeof v === 'string' ? v.slice(0, max) : ''
  }

  const firstName = str('name', 40)
  const services = str('services', 600).split('|').filter(Boolean).slice(0, 30)
  const inactiveCount = parseInactiveCount(str('inactive', 12) || undefined)
  const patientValue = parsePatientValue(str('value', 12) || undefined)

  const tzParam = str('tz', 40)
  const timezone = isUsTimezone(tzParam) ? tzParam : DEFAULT_TIMEZONE
  const slotMs = Date.parse(str('slot', 40))
  const bookedFor = Number.isNaN(slotMs)
    ? null
    : new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        dateStyle: 'full',
        timeStyle: 'short',
      }).format(new Date(slotMs))

  return (
    <main className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center px-4 py-4 md:px-6">
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

      <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center px-4 py-10 md:px-6 md:py-14">
        <span className="flex size-16 items-center justify-center rounded-full bg-success/10">
          <CheckCircle2 className="size-9 text-success" aria-hidden="true" />
        </span>

        {bookedFor ? (
          <>
            <h1 className="mt-6 text-balance text-center text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              {firstName ? `${firstName}, you're booked!` : "You're booked!"}
            </h1>
            <p className="mt-4 max-w-2xl text-pretty text-center text-lg leading-relaxed text-muted-foreground">
              Your strategy call is confirmed for{' '}
              <span className="font-semibold text-foreground">{bookedFor}</span>{' '}
              ({timezoneLabel(timezone)}). Check your email for the details
              &mdash; we look forward to talking with you.
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-6 text-balance text-center text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              {firstName
                ? `Thanks, ${firstName} — we've got your info`
                : "Thanks — we've got your info"}
            </h1>
            <p className="mt-4 max-w-2xl text-pretty text-center text-lg leading-relaxed text-muted-foreground">
              Check your email for next steps &mdash; we look forward to
              talking with you.
            </p>
          </>
        )}

        <div className="mt-14 w-full border-t border-border pt-12 md:mt-16">
          <OpportunityCalculator
            inactiveCount={inactiveCount}
            defaultPatientValue={patientValue}
            servicesLabel={servicesLabel(services)}
          />
        </div>
      </section>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 px-4 py-8 text-center md:px-6">
          <p className="text-xs text-muted-foreground">
            {`© ${new Date().getFullYear()} Reactivation Power Program. All rights reserved.`}
          </p>
        </div>
      </footer>
    </main>
  )
}
