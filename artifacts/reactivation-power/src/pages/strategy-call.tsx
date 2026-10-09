import { CalendarClock, PhoneCall, MessageSquareText, ListChecks } from 'lucide-react'
import { MarketingHeader } from '@/components/marketing/marketing-header'
import { MarketingFooter } from '@/components/marketing/marketing-footer'
import { MarketingWalkthrough } from '@/components/marketing/marketing-walkthrough'
import { StrategyCallButton, StrategyCallProvider } from '@/components/marketing/strategy-call-modal'
import { usePageMeta } from '@/components/marketing/use-page-meta'

const FEATURES = [
  { icon: PhoneCall, title: 'Service-aware calling scripts', body: 'Staff call past patients with scripts written around the service each patient last received.' },
  { icon: CalendarClock, title: 'Reactivate inactive patients', body: 'Work through your inactive patient files one call at a time, with every outcome logged.' },
  { icon: MessageSquareText, title: 'Campaign lead follow-up', body: 'Follow up with new campaign inquiries using a script built for that specific campaign.' },
  { icon: ListChecks, title: 'Both workflows together', body: 'Reactivation and lead follow-up are offered together in one Patient Pipeline launch offer.' },
]

export default function StrategyCallPage() {
  usePageMeta('Patient Pipeline Strategy Call | Reactivate Patients and Follow Up Leads', 'Watch the four-minute walkthrough of Patient Pipeline, then schedule a strategy call to see service-aware calling scripts for your practice.')
  return (
    <StrategyCallProvider>
      <div className="flex min-h-svh flex-col bg-background">
        <MarketingHeader action={<StrategyCallButton />} />
        <main className="flex-1">
          <section className="w-full px-4 pb-10 pt-12 text-center md:px-6 md:pt-20">
            <h1 className="text-balance text-4xl font-bold leading-[1.1] tracking-tight text-foreground md:text-6xl">
              Bring past patients back. Answer new inquiries faster.
            </h1>
            <p className="mx-auto mt-5 max-w-4xl text-pretty text-lg leading-relaxed text-muted-foreground md:text-xl">
              Patient Pipeline gives your staff service-aware calling scripts to reactivate past patients and follow up with new campaign inquiries, both offered together.
            </p>
          </section>
          <section aria-label="Four-minute walkthrough" className="w-full">
            <MarketingWalkthrough />
          </section>
          <div className="flex justify-center px-4 py-10 md:py-14">
            <StrategyCallButton testId="button-schedule-strategy-call-cta" className="px-8 py-3.5 text-base md:text-lg">Schedule Strategy Call</StrategyCallButton>
          </div>
          <section className="mx-auto max-w-6xl px-4 pb-16 md:px-6 md:pb-24">
            <ul className="grid gap-x-12 gap-y-8 sm:grid-cols-2">
              {FEATURES.map((f) => (
                <li key={f.title} className="flex gap-4 border-t border-border pt-5">
                  <f.icon className="mt-1 size-6 shrink-0 text-accent" aria-hidden="true" />
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">{f.title}</h2>
                    <p className="mt-1 leading-relaxed text-muted-foreground">{f.body}</p>
                  </div>
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
