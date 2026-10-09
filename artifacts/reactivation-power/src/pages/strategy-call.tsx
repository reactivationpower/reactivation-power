import { CalendarClock, PhoneCall, MessageSquareText, ListChecks } from 'lucide-react'
import { MarketingHeader } from '@/components/marketing/marketing-header'
import { MarketingFooter } from '@/components/marketing/marketing-footer'
import { MarketingWalkthrough } from '@/components/marketing/marketing-walkthrough'
import { StrategyCallButton, StrategyCallProvider } from '@/components/marketing/strategy-call-modal'
import { usePageMeta } from '@/components/marketing/use-page-meta'

const FEATURES = [
  { icon: PhoneCall, title: 'Scripts that fit the visit', body: 'Your team calls with words written around the service each patient last had, so it sounds personal, not scripted.' },
  { icon: CalendarClock, title: 'Wake up inactive files', body: 'Work through patients who drifted away, one call at a time, with every outcome logged.' },
  { icon: MessageSquareText, title: 'Faster lead follow-up', body: 'Give new campaign inquiries a prompt, on-message call built for that exact campaign.' },
  { icon: ListChecks, title: 'Offered together', body: 'Reactivation and Lead Follow-Up come as one Patient Pipeline launch offer.' },
]

export default function StrategyCallPage() {
  usePageMeta('Patient Pipeline Strategy Call | Reactivate Patients and Follow Up Leads', 'Watch the four-minute walkthrough of Patient Pipeline, then schedule a strategy call to see service-aware calling scripts for your practice.')
  return (
    <StrategyCallProvider>
      <div className="flex min-h-svh flex-col bg-background">
        <MarketingHeader action={<StrategyCallButton />} />
        <main className="flex-1">
          <div className="mx-auto flex max-w-3xl flex-col items-center px-4 pb-8 pt-8 text-center md:px-6 md:pt-14">
            <h1 className="text-balance text-3xl font-bold leading-[1.1] tracking-tight text-foreground sm:text-4xl md:text-5xl">
              Your best patients are already in your files. Call them back.
            </h1>
            <p className="mt-4 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">
              Past patients go quiet, and new inquiries cool off while the front desk is busy. Patient Pipeline puts a service-aware script in front of your staff, so each call they make sounds like it came from someone who remembers the patient.
            </p>
            <section aria-label="Four-minute walkthrough" className="mt-7 w-full overflow-hidden rounded-xl shadow-lg ring-1 ring-border">
              <MarketingWalkthrough />
            </section>
            <StrategyCallButton testId="button-schedule-strategy-call-cta" className="mt-7 w-full justify-center px-8 py-5 text-lg font-semibold shadow-md md:text-xl">
              Schedule Strategy Call
            </StrategyCallButton>
            <p className="mt-3 text-sm text-muted-foreground">
              Walk through how it would work for your practice, with your services and your campaigns.
            </p>
          </div>
          <section aria-label="What you get" className="mx-auto max-w-6xl px-4 pb-12 pt-4 md:px-6 md:pb-16">
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((f) => (
                <li key={f.title} className="rounded-lg border border-border bg-card/60 p-4">
                  <f.icon className="size-5 text-accent" aria-hidden="true" />
                  <h2 className="mt-2 text-base font-semibold text-foreground">{f.title}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
                </li>
              ))}
            </ul>
          </section>
        </main>
        <MarketingFooter />
      </div>
    </StrategyCallProvider>
  )
}
