'use client'

import { useState } from 'react'
import { Play } from 'lucide-react'

interface TestimonialVideoProps {
  /** Path or URL to the testimonial video; null shows the placeholder */
  videoSrc?: string | null
  /** Optional poster image for the video */
  posterSrc?: string | null
}

export function TestimonialVideo({
  videoSrc = null,
  posterSrc = null,
}: TestimonialVideoProps) {
  const [playing, setPlaying] = useState(false)

  if (!videoSrc) {
    return (
      <div
        className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl border border-border bg-primary"
        aria-label="Video testimonial coming soon"
      >
        <div className="flex flex-col items-center gap-4 px-6 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-accent">
            <Play
              className="ml-1 size-7 text-accent-foreground"
              aria-hidden="true"
            />
          </span>
          <p className="text-sm font-medium text-primary-foreground/80">
            Video testimonial — coming soon
          </p>
        </div>
      </div>
    )
  }

  if (!playing) {
    return (
      <button
        type="button"
        onClick={() => setPlaying(true)}
        className="group relative block aspect-video w-full overflow-hidden rounded-xl border border-border bg-primary"
        aria-label="Play video testimonial"
      >
        {posterSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={posterSrc || '/placeholder.svg'}
            alt=""
            className="absolute inset-0 size-full object-cover"
          />
        ) : null}
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-accent shadow-lg transition-transform group-hover:scale-110">
            <Play
              className="ml-1 size-7 text-accent-foreground"
              aria-hidden="true"
            />
          </span>
        </span>
      </button>
    )
  }

  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <video
      src={videoSrc}
      controls
      autoPlay
      playsInline
      className="aspect-video w-full rounded-xl border border-border bg-black"
    />
  )
}
