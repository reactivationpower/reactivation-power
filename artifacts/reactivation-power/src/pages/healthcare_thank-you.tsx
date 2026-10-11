// @ts-nocheck
import { useSearch } from 'wouter'
import { CheckCircle2 } from 'lucide-react'
import { CombinedOpportunity } from '@/components/landing/combined-opportunity'
import { usePageData } from '@/hooks/use-page-data'
import { PageError, PageLoading } from '@/components/page-status'

export default function ThankYouPage() {
  const search = new URLSearchParams(useSearch())
  const query = Object.fromEntries(
    ['bookingRef', 'name', 'services', 'inactive', 'value', 'newMonthly', 'newValue', 'tz', 'slot', 'interest'].map((key) => [
      key,
      search.get(key) ?? undefined,
    ]),
  )
  const { data, loading, error } = usePageData<any>(
    '/healthcare/thank-you',
    query,
  )
  if (loading) return <PageLoading />
  if (error) return <PageError error={error} />
  const {
    firstName, inactiveCount, patientValue, timezoneLabel, bookedFor, servicesLabel, scenario,
  } = data

  return (
    <main className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center px-4 py-4 md:px-6">
          <img
            src="/images/patient-pipeline-logo.png"
            alt="Patient Pipeline"
            width={2172}
            height={724}
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
               ({timezoneLabel}). Check your email for the details
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
          <CombinedOpportunity
            inactiveCount={scenario?.inactivePatients ?? inactiveCount}
            patientValue={scenario?.patientValue ?? patientValue}
            leadsPerMonth={scenario?.additionalPatientsPerMonth}
            leadValue={scenario?.newPatientValue}
            servicesLabel={servicesLabel}
          />
        </div>
      </section>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 px-4 py-8 text-center md:px-6">
          <p className="text-xs text-muted-foreground">
             {`© ${new Date().getFullYear()} Patient Pipeline. All rights reserved.`}
          </p>
        </div>
      </footer>
    </main>
  )
}
