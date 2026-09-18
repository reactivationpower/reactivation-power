import type { Metadata } from 'next'
import { DemoPlayer } from '@/components/training-demo/demo-player'
import { NarrationScript } from '@/components/training-demo/narration-script'

export const metadata: Metadata = {
  title: 'Training Video Kit — Getting Into the Calling System',
  description:
    'Guided walkthrough, screenshots, and narration script for producing the office training video.',
  robots: { index: false, follow: false },
}

export default function TrainingDemoPage() {
  return (
    <main className="min-h-svh bg-background">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <header className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">
            Training video kit
          </p>
          <h1 className="mt-2 text-balance text-3xl font-bold text-foreground sm:text-4xl">
            Accessing &amp; Using the Calling System
          </h1>
          <p className="mt-3 max-w-2xl text-pretty leading-relaxed text-muted-foreground">
            Everything you need to record the office training video: an
            auto-playing walkthrough of the real screens, the narration to read
            over each step, and a shot list. Press{' '}
            <strong className="font-semibold text-foreground">
              Play walkthrough
            </strong>
            , start your screen recorder, and read the narration as each step
            appears. Use{' '}
            <strong className="font-semibold text-foreground">
              Recording mode
            </strong>{' '}
            to hide everything except the slides.
          </p>
        </header>

        <DemoPlayer />

        <NarrationScript />
      </div>
    </main>
  )
}
