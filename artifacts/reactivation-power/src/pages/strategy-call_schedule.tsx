// @ts-nocheck
import { LeadForm } from '@/components/landing/lead-form'
import { MarketingHeader } from '@/components/marketing/marketing-header'
import { MarketingFooter } from '@/components/marketing/marketing-footer'
import { usePageMeta } from '@/components/marketing/use-page-meta'
import { CheckCircle2 } from 'lucide-react'

export default function StrategyCallSchedulePage() {
  usePageMeta('Schedule Your Patient Pipeline Strategy Call', 'Tell us about your practice, then pick a time on the calendar for your Patient Pipeline strategy call.')
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <MarketingHeader />
      <main className="flex-1 px-4 pb-16 pt-10 md:px-6 md:pt-16">
        <div className="mx-auto w-full max-w-3xl">
          <h1 className="text-balance text-center text-3xl font-bold tracking-tight text-foreground md:text-5xl">Schedule your strategy call</h1>
          <p className="mx-auto mt-4 max-w-2xl text-center text-lg leading-relaxed text-muted-foreground">
            Tell us about your practice. After you send the form, you will choose a time on our calendar.
          </p>
          <ul className="mt-7 grid gap-3 md:grid-cols-3">
            {['Find opportunities in your inactive patient list', 'See service-aware scripts and campaign follow-up', 'Plan the next step for your practice'].map((item) => (
              <li key={item} className="flex items-start gap-2 rounded-lg bg-secondary/50 p-4 text-sm font-medium leading-relaxed">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
          <div className="mt-10 rounded-xl border border-border bg-card p-6 shadow-sm md:p-10">
            <LeadForm scheduleMode />
          </div>
        </div>
      </main>
      <MarketingFooter />
    </div>
  )
}
