import { useEffect, useRef, useState } from 'react'
import { Play } from 'lucide-react'
import { observeMarketingVideo } from '@/lib/marketing-video'

export function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = Math.round(totalSeconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

interface Props {
  src: string
  poster: string
  title: string
  durationSeconds: number
  testId?: string
}

export function ClickToPlayVideo({ src, poster, title, durationSeconds, testId = 'video' }: Props) {
  const [active, setActive] = useState(false)
  const [failed, setFailed] = useState(false)
  const ref = useRef<HTMLVideoElement>(null)
  const duration = formatDuration(durationSeconds)
  useEffect(() => {
    if (ref.current && active && !failed && durationSeconds === 240) return observeMarketingVideo(ref.current, testId)
    return undefined
  }, [active, failed, durationSeconds, testId])

  useEffect(() => {
    if (active && !failed) void ref.current?.play?.()?.catch?.(() => {})
  }, [active, failed])

  return (
    <figure className="m-0 flex flex-col gap-2" data-testid={`figure-${testId}`}>
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-border bg-primary shadow-sm">
        {active && !failed ? (
          <video
            ref={ref}
            className="size-full bg-primary object-contain"
            src={src}
            poster={poster}
            controls
            playsInline
            preload="none"
            aria-label={`${title}, ${duration}`}
            onError={() => setFailed(true)}
            data-testid={`video-${testId}`}
          />
        ) : failed ? (
          <div role="alert" className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center text-primary-foreground">
            <p className="text-sm font-semibold">This video could not be loaded.</p>
            <button
              type="button"
              onClick={() => { setFailed(false); setActive(true) }}
              className="min-h-11 rounded-md bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground hover:bg-accent/90"
              data-testid={`button-retry-${testId}`}
            >
              Try again
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setActive(true)}
            className="group absolute inset-0 size-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            aria-label={`Play video: ${title} (${duration})`}
            data-testid={`button-play-${testId}`}
          >
            <img src={poster} alt="" className="size-full object-cover" loading="lazy" />
            <span className="absolute inset-0 bg-primary/25 transition-colors group-hover:bg-primary/10" aria-hidden="true" />
            <span className="absolute left-1/2 top-1/2 flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg md:size-20" aria-hidden="true">
              <Play className="ml-1 size-7 fill-current" />
            </span>
            <span className="absolute bottom-3 right-3 rounded-md bg-primary/85 px-2 py-1 text-xs font-semibold text-primary-foreground">{duration}</span>
          </button>
        )}
      </div>
      <figcaption className="text-sm text-muted-foreground"><span className="font-semibold text-foreground">{title}</span> &middot; {duration}</figcaption>
    </figure>
  )
}
