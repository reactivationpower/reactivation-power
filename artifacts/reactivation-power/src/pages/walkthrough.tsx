import { Link } from 'wouter'
import { ClickToPlayVideo } from '@/components/video/click-to-play-video'
import { WALKTHROUGH_VIDEO } from '@/components/video/video-assets'
import { SiteFooter } from '@/components/site/site-footer'
import { SiteHeader } from '@/components/site/site-header'

export default function WalkthroughPage() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <title>Full Product Walkthrough | Patient Pipeline</title>
      <meta name="description" content="Watch the four-minute Patient Pipeline walkthrough of staff-led patient reactivation and campaign-specific lead follow-up, then schedule a strategy call." />
      <SiteHeader simplified />
      <main className="flex-1">
        <div className="mx-auto max-w-4xl px-4 py-12 md:px-6 md:py-20">
          <p className="text-sm font-semibold uppercase tracking-wide text-accent">Full walkthrough</p>
          <h1 className="mt-3 text-balance text-3xl font-bold tracking-tight text-foreground md:text-5xl">Patient Pipeline, start to finish</h1>
          <p className="mt-4 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground">A four-minute look at how your team makes staff-led calls with guided scripts. Watch it any time; no login required.</p>
          <div className="mt-8"><ClickToPlayVideo {...WALKTHROUGH_VIDEO} testId="walkthrough-page" /></div>
          <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="text-lg font-semibold text-foreground">Patient Reactivation</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Your front desk works through your inactive patient list with scripts written for the service each patient last received.</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="text-lg font-semibold text-foreground">Lead Follow-Up</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Your team calls incoming inquiries with a script built around the campaign or offer they responded to.</p>
            </div>
          </div>
          <div className="mt-10">
            <Link href="/schedule-a-call" className="inline-block rounded-md bg-accent px-8 py-3.5 text-base font-semibold text-accent-foreground transition-colors hover:bg-accent/90" data-testid="link-schedule-walkthrough">Schedule a Call</Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
