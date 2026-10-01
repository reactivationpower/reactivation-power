// @ts-nocheck
import { Link } from "wouter";
import { useSearch } from 'wouter'
import { CalendarClock, CheckCircle2 } from 'lucide-react'
import { BookingCalendar } from '@/components/landing/booking-calendar'
import { usePageData } from '@/hooks/use-page-data'
import { PageError, PageLoading } from '@/components/page-status'



export default function BookACallPage() {
  const search = new URLSearchParams(useSearch())
  const query = Object.fromEntries(
    ['cid', 'name', 'inactive', 'value', 'newMonthly', 'newValue', 'services', 'interest'].map((key) => [
      key,
      search.get(key) ?? undefined,
    ]),
  )
  const { data, loading, error } = usePageData<any>(
    '/healthcare/book-a-call',
    query,
  )
  if (loading) return <PageLoading />
  if (error) return <PageError error={error} />
  const { contactId, firstName, thankYouHref } = data

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
        <div className="flex items-center gap-2 rounded-full border border-success/40 bg-success/10 px-4 py-1.5">
          <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
          <span className="text-sm font-semibold text-success">
            You&apos;re in — one last step
          </span>
        </div>

        <h1 className="mt-6 text-balance text-center text-3xl font-bold tracking-tight text-foreground md:text-4xl">
          {firstName
            ? `${firstName}, pick a time for your free strategy call`
            : 'Pick a time for your free strategy call'}
        </h1>
        <p className="mt-4 max-w-2xl text-pretty text-center text-lg leading-relaxed text-muted-foreground">
          Choose whatever time works best. The call takes about 20 minutes,
           and we&apos;ll talk through your inactive patient outreach and incoming
           campaign leads. Patient Pipeline includes Reactivation and Lead
           Follow-Up together in one launch offer.
        </p>

        <div className="mt-10 w-full">
          {contactId ? (
            <BookingCalendar
              contactId={contactId}
              thankYouHref={thankYouHref}
              productInterest={search.get('interest') ?? undefined}
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
                Let&apos;s get your info first
              </p>
              <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                To book your call, start with the 30-second form so we know
                who the call is for.
              </p>
              <Link
                href="/healthcare"
                className="rounded-md bg-accent px-6 py-3 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
              >
                Go to the form
              </Link>
            </div>
          )}
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
