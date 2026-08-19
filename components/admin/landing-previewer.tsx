'use client'

import { useState } from 'react'
import { ExternalLink, Monitor, Smartphone } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LandingPage {
  id: string
  name: string
  path: string
  description: string
}

const LANDING_PAGES: LandingPage[] = [
  {
    id: 'website-home',
    name: 'Website — Home',
    path: '/',
    description:
      'The main website at reactivationpower.com — brand hero with the revenue calculator, the reactivation story, benefits, and Schedule a Call CTAs. This is what visitors see when they type in the domain.',
  },
  {
    id: 'website-how-it-works',
    name: 'Website — How It Works',
    path: '/how-it-works',
    description:
      'The program page — what is included (training, interactive scripts, the portal), what it looks like day to day, and the niches covered. Answers "is this legit and does it fit my practice?"',
  },
  {
    id: 'website-schedule',
    name: 'Website — Schedule a Call',
    path: '/schedule-a-call',
    description:
      'The booking page every website CTA leads to. Calendar embed placeholder (add your scheduler URL when ready) with the lead form as a fallback.',
  },
  {
    id: 'healthcare',
    name: 'Healthcare Main Landing Page',
    path: '/healthcare',
    description:
      'The primary lead-generation page — stats, the interactive revenue opportunity calculator, how it works, benefits, and the lead form. This is the page the marketing emails link to.',
  },
  {
    id: 'healthcare-testimonial',
    name: 'Healthcare Landing — Testimonial Version',
    path: '/healthcare/testimonial',
    description:
      'Variant of the main landing page with a video testimonial in the hero instead of the revenue calculator. Currently shows a placeholder until a testimonial video is added.',
  },
  {
    id: 'your-opportunity',
    name: 'Your Opportunity Calculator',
    path: '/healthcare/your-opportunity',
    description:
      'Post-opt-in page that shows the prospect a personalized estimate of what reactivating their inactive patients could be worth.',
  },
  {
    id: 'book-a-call',
    name: 'Book a Strategy Call',
    path: '/healthcare/book-a-call',
    description:
      'Scheduling page where prospects pick a time for their free strategy call with the sales team.',
  },
]

export function LandingPreviewer() {
  const [selected, setSelected] = useState<LandingPage>(LANDING_PAGES[0])
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 lg:flex-row">
      {/* Left: page list */}
      <div className="flex w-full shrink-0 flex-col gap-2 lg:w-80">
        {LANDING_PAGES.map((page) => (
          <button
            key={page.id}
            type="button"
            onClick={() => setSelected(page)}
            className={cn(
              'rounded-lg border px-4 py-3 text-left transition-colors',
              selected.id === page.id
                ? 'border-primary bg-accent'
                : 'border-border bg-card hover:bg-muted',
            )}
          >
            <p className="text-sm font-semibold text-foreground">
              {page.name}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {page.description}
            </p>
            <p className="mt-2 font-mono text-xs text-muted-foreground">
              {page.path}
            </p>
          </button>
        ))}
      </div>

      {/* Right: live preview */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <p className="min-w-0 truncate text-sm font-medium text-foreground">
            Live preview — {selected.name}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <div className="flex items-center rounded-md border border-input p-0.5">
              <button
                type="button"
                onClick={() => setDevice('desktop')}
                aria-pressed={device === 'desktop'}
                className={cn(
                  'flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors',
                  device === 'desktop'
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Monitor className="size-3.5" />
                Desktop
              </button>
              <button
                type="button"
                onClick={() => setDevice('mobile')}
                aria-pressed={device === 'mobile'}
                className={cn(
                  'flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors',
                  device === 'mobile'
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Smartphone className="size-3.5" />
                Mobile
              </button>
            </div>
            <a
              href={selected.path}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-md border border-input bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              <ExternalLink className="size-3.5" />
              Open in new tab
            </a>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 justify-center overflow-hidden bg-muted/50 p-4">
          <iframe
            key={`${selected.id}-${device}`}
            src={selected.path}
            title={`Preview of ${selected.name}`}
            className={cn(
              'h-full rounded-md border border-border bg-background shadow-sm',
              device === 'mobile' ? 'w-[390px] max-w-full' : 'w-full',
            )}
          />
        </div>
      </div>
    </div>
  )
}
