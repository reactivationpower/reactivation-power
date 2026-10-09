import { useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { WALKTHROUGH_VIDEO } from '@/components/video/video-assets'
import { observeMarketingVideo } from '@/lib/marketing-video'

const PREVIEW = `${import.meta.env.BASE_URL}videos/patient-pipeline-walkthrough-preview.mp4`

export function MarketingWalkthrough() {
  const [playing, setPlaying] = useState(false)
  const [paused, setPaused] = useState(false)
  const [visible, setVisible] = useState(true)
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [failed, setFailed] = useState(false)
  const prev = useRef<HTMLVideoElement>(null)
  const full = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (playing && !failed && full.current) return observeMarketingVideo(full.current, 'strategy-walkthrough')
    return undefined
  }, [playing, failed])
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const h = () => setReduced(mq.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [])

  useEffect(() => {
    const el = box.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.25 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const shouldRun = !playing && !paused && !reduced && visible
  useEffect(() => {
    const v = prev.current
    if (!v) return
    if (shouldRun) v.play().catch(() => {})
    else v.pause()
  }, [shouldRun])

  return (
    <div ref={box} className="relative aspect-video w-full overflow-hidden bg-slate-900" data-testid="marketing-walkthrough">
      {failed ? (
        <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-5 text-center text-white">
          <p>The walkthrough couldn’t load. Please try again.</p>
          <button type="button" onClick={() => setFailed(false)} className="rounded-md bg-accent px-5 py-3 font-semibold text-accent-foreground">Retry video</button>
        </div>
      ) : playing ? (
        <video ref={full} src={WALKTHROUGH_VIDEO.src} poster={WALKTHROUGH_VIDEO.poster} controls autoPlay playsInline preload="auto" onError={() => setFailed(true)}
          aria-label={WALKTHROUGH_VIDEO.title} className="absolute inset-0 size-full bg-slate-900 object-contain" data-testid="video-walkthrough-full" />
      ) : (
        <>
          <video ref={prev} src={PREVIEW} poster={WALKTHROUGH_VIDEO.poster} muted loop playsInline preload="metadata" aria-hidden="true" tabIndex={-1}
            className="absolute inset-0 size-full object-cover" />
          <div className="absolute inset-0 bg-slate-950/55" aria-hidden="true" />
          <button type="button" onClick={() => setPlaying(true)} data-testid="button-play-walkthrough"
            className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-white focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-white">
            <span className="flex size-20 items-center justify-center rounded-full bg-accent shadow-lg transition-transform hover:scale-105 md:size-24">
              <Play className="ml-1 size-9 fill-current md:size-10" aria-hidden="true" />
            </span>
            <span className="text-lg font-semibold md:text-2xl">Watch the 4-minute walkthrough</span>
            <span className="text-sm text-white/80">Plays with sound</span>
          </button>
          {!reduced && (
            <button type="button" onClick={() => setPaused((p) => !p)} aria-pressed={paused} data-testid="button-toggle-preview"
              className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-md bg-slate-950/70 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-950/90 focus-visible:outline-2 focus-visible:outline-white">
              {paused ? <Play className="size-3.5" aria-hidden="true" /> : <Pause className="size-3.5" aria-hidden="true" />}
              {paused ? 'Resume preview' : 'Pause preview'}
            </button>
          )}
        </>
      )}
    </div>
  )
}
