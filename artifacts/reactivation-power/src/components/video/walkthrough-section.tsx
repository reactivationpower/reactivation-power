import { Link } from 'wouter'
import { ClickToPlayVideo } from './click-to-play-video'
import { WALKTHROUGH_VIDEO } from './video-assets'

export function WalkthroughSection() {
  return (
    <section id="full-walkthrough" aria-labelledby="full-walkthrough-title" className="dph-band scroll-mt-24 border-y border-border">
      <div className="mx-auto max-w-4xl px-4 py-16 md:px-6 md:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="dph-eyebrow justify-center">Full walkthrough</p>
          <h2 id="full-walkthrough-title" className="mt-4 text-balance text-3xl font-bold tracking-tight text-foreground md:text-4xl">Watch the full 4-minute walkthrough</h2>
          <p className="mt-5 text-pretty text-lg leading-relaxed text-muted-foreground">See both staff-led workflows, Reactivation and Lead Follow-Up, step by step. No sign-up needed.</p>
        </div>
        <div className="mt-10"><ClickToPlayVideo {...WALKTHROUGH_VIDEO} testId="walkthrough" /></div>
        <div className="mt-8 text-center">
          <Link href="/schedule-a-call" className="inline-block rounded-md bg-accent px-8 py-3.5 text-base font-semibold text-accent-foreground transition-colors hover:bg-accent/90">Schedule a Call</Link>
        </div>
      </div>
    </section>
  )
}
