import type { Metadata } from 'next'
import { DemoPlayer } from '@/components/training-demo/demo-player'
import { NarrationScript } from '@/components/training-demo/narration-script'
import { VIDEO2_SLIDES } from '@/components/training-demo/video2-slides'

export const metadata: Metadata = {
  title: 'Training Video Kit — Video 2: How to Log In and Use the System',
  description:
    'Simulated screen recording, screenshots, and narration script for producing Video 2 of the Reactivation Power Program.',
  robots: { index: false, follow: false },
}

export default function TrainingDemoVideo2Page() {
  return (
    <main className="min-h-svh bg-background">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <header className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">
            Training video kit — Video 2
          </p>
          <h1 className="mt-2 text-balance text-3xl font-bold text-foreground sm:text-4xl">
            How to Log In and Use the System
          </h1>
          <p className="mt-3 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
            The simulated screen recording for Video 2 of the Reactivation
            Power Program. Every slide is a real capture of the portal, timed
            to match the HeyGen narration beat-for-beat. Press{' '}
            <strong className="font-semibold text-foreground">
              Play walkthrough
            </strong>
            , start your screen recorder, and the on-screen steps will line up
            with the voiceover. Use{' '}
            <strong className="font-semibold text-foreground">
              Recording mode
            </strong>{' '}
            to hide everything except the slides.
          </p>
        </header>

        <DemoPlayer slides={VIDEO2_SLIDES} />

        <NarrationScript slides={VIDEO2_SLIDES} runtime="3 and a half minutes" />
      </div>
    </main>
  )
}
