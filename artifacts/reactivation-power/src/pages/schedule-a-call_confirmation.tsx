import { useSearch } from 'wouter'
import { CalendarCheck, CircleHelp } from 'lucide-react'
import { usePageData } from '@/hooks/use-page-data'
import { PageError, PageLoading } from '@/components/page-status'
import { ClickToPlayVideo } from '@/components/video/click-to-play-video'
import { WALKTHROUGH_VIDEO } from '@/components/video/video-assets'
import { usePageMeta } from '@/components/marketing/use-page-meta'

type Confirmation = { confirmed: boolean; bookedFor: string | null; timezoneLabel: string | null }

export default function ScheduleACallConfirmationPage() {
  const search = new URLSearchParams(useSearch())
  usePageMeta(
    'Call Confirmation | Patient Pipeline',
    'Review your Patient Pipeline sales call details and watch a short walkthrough before we talk.',
  )
  const { data, loading, error } = usePageData<Confirmation>('/schedule-a-call/confirmation', {
    booking: search.get('booking') ?? undefined,
  })
  if (loading) return <PageLoading />
  if (error) return <PageError error={error} />
  const confirmed = data?.confirmed === true

  return (
    <main className="flex min-h-[100dvh] flex-col bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center px-4 py-4 md:px-6">
          <img
            src={`${import.meta.env.BASE_URL}images/patient-pipeline-logo.png`}
            alt="Patient Pipeline"
            width={2172}
            height={724}
            className="h-16 w-auto md:h-20"
          />
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 md:px-6 md:py-16">
        <section
          aria-labelledby="status-heading"
          className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm md:p-10"
          data-testid={confirmed ? 'status-confirmed' : 'status-unverified'}
        >
          <span
            aria-hidden="true"
            className={`absolute inset-y-0 left-0 w-1.5 ${confirmed ? 'bg-success' : 'bg-accent'}`}
          />
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
            <span
              className={`flex size-14 shrink-0 items-center justify-center rounded-full ${
                confirmed ? 'bg-success/10' : 'bg-accent/10'
              }`}
            >
              {confirmed ? (
                <CalendarCheck className="size-7 text-success" aria-hidden="true" />
              ) : (
                <CircleHelp className="size-7 text-accent" aria-hidden="true" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <h1
                id="status-heading"
                className="text-balance text-3xl font-bold tracking-tight text-foreground md:text-4xl"
              >
                {confirmed
                  ? 'Your call is scheduled. Let’s make it a useful one.'
                  : 'We couldn’t verify this booking.'}
              </h1>
              <p className="mt-4 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground">
                {confirmed
                  ? 'Thank you for choosing a time. We look forward to speaking with you at your scheduled appointment.'
                  : 'This link has no valid booking confirmation, so we can’t show any appointment details here.'}
              </p>
              {confirmed && (data?.bookedFor || data?.timezoneLabel) && (
                <dl className="mt-6 grid gap-4 rounded-xl border border-border bg-secondary p-5 sm:grid-cols-2">
                  {data?.bookedFor && (
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Scheduled for
                      </dt>
                      <dd className="mt-1 text-lg font-semibold text-foreground" data-testid="text-booked-for">
                        {data.bookedFor}
                      </dd>
                    </div>
                  )}
                  {data?.timezoneLabel && (
                    <div>
                      <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Time zone
                      </dt>
                      <dd className="mt-1 text-lg font-semibold text-foreground" data-testid="text-timezone">
                        {data.timezoneLabel}
                      </dd>
                    </div>
                  )}
                </dl>
              )}
            </div>
          </div>
        </section>

        <section aria-labelledby="video-heading" className="mt-12 grid items-center gap-8 md:mt-16 md:grid-cols-5 md:gap-10">
          <div className="md:col-span-2">
            <p className="text-sm font-semibold uppercase tracking-wider text-accent">Optional prep</p>
            <h2
              id="video-heading"
              className="mt-3 text-balance text-2xl font-bold tracking-tight text-foreground md:text-3xl"
            >
              Watch this four-minute walkthrough before our call.
            </h2>
            <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
              See how Patient Pipeline helps your team reconnect with inactive patients and follow up with new
              inquiries—so we can spend our call discussing how it could fit your practice.
            </p>
          </div>
          <div className="md:col-span-3">
            <ClickToPlayVideo {...WALKTHROUGH_VIDEO} testId="booking-walkthrough" />
          </div>
        </section>
      </div>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto max-w-5xl px-4 py-8 text-center md:px-6">
          <p className="text-xs text-muted-foreground">
            {`© ${new Date().getFullYear()} Patient Pipeline. All rights reserved.`}
          </p>
        </div>
      </footer>
    </main>
  )
}
