// @ts-nocheck

import { useEffect, useRef, useState } from 'react'
import { Link } from "wouter";
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRouter } from '@/hooks/use-router'
import { apiUrl } from '@/lib/api'

const HEARTBEAT_INTERVAL = 10 // seconds
const MARK_COMPLETE_THRESHOLD = 75 // % watched before the button enables
const STALL_TIMEOUT = 15_000 // a brief seek or buffer is normal, especially on mobile

function playbackMessage(code?: number) {
  switch (code) {
    case 2: return 'The video connection was interrupted. Check your connection and try again.'
    case 3: return 'Your browser could not play this video. Try again or open it in another browser.'
    case 4: return 'The video could not be loaded. Please try again; if it continues, contact support.'
    default: return 'The video stopped loading. Please try again.'
  }
}

interface Props {
  videoId: string
  courseId: string
  moduleId: string
  videoPathname: string | null
  thumbnailPathname?: string | null
  durationSeconds: number | null
  initialCompleted: boolean
  initialPosition: number
  nextHref: string | null
  courseHref: string
}

export function VideoPlayer({
  videoId,
  courseId,
  moduleId,
  videoPathname,
  thumbnailPathname,
  durationSeconds,
  initialCompleted,
  initialPosition,
  nextHref,
  courseHref,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const watchedRef = useRef(0) // seconds since last heartbeat
  const startedRef = useRef(false)
  const [completed, setCompleted] = useState(initialCompleted)
  const [percent, setPercent] = useState(0)
  const [marking, setMarking] = useState(false)
  const [playbackError, setPlaybackError] = useState<string | null>(null)
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Don't resume at the end of an already-completed lesson: it should replay.
  const resumeAtRef = useRef(initialCompleted ? 0 : initialPosition)
  const router = useRouter()

  function clearStallTimer() {
    if (stallTimerRef.current) clearTimeout(stallTimerRef.current)
    stallTimerRef.current = null
  }

  function onBuffering() {
    clearStallTimer()
    const el = videoRef.current
    if (!el || el.paused || el.ended) return
    stallTimerRef.current = setTimeout(() => {
      const current = videoRef.current
      if (current && !current.paused && !current.ended && current.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
        setPlaybackError('The video is taking too long to load. Check your connection and try again.')
      }
    }, STALL_TIMEOUT)
  }

  function retryPlayback() {
    const el = videoRef.current
    if (!el) return
    clearStallTimer()
    resumeAtRef.current = el.ended ? 0 : el.currentTime
    watchedRef.current = 0
    setPlaybackError(null)
    // Native controls retain the play gesture; never autoplay a retry on iPad.
    el.load()
  }

  function restorePosition() {
    const el = videoRef.current
    const resumeAt = resumeAtRef.current
    resumeAtRef.current = 0
    if (!el || !Number.isFinite(resumeAt) || resumeAt <= 0) return
    const duration = el.duration
    if (Number.isFinite(duration) && resumeAt >= duration - 2) return
    try { el.currentTime = resumeAt } catch { /* Safari may not have a seekable range yet */ }
  }

  async function sendProgress(
    event: 'heartbeat' | 'start' | 'ended',
    positionOverride?: number,
  ) {
    const el = videoRef.current
    const position = positionOverride ?? el?.currentTime ?? 0
    const duration = el?.duration || durationSeconds || 0
    const secondsDelta = watchedRef.current
    watchedRef.current = 0

    try {
      const res = await fetch(apiUrl('/progress'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId,
          courseId,
          moduleId,
          position,
          duration,
          secondsDelta,
          event,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.completed && !completed) {
          setCompleted(true)
          router.refresh()
        }
      }
    } catch {
      // network hiccup — will retry on next heartbeat
    }
  }

  useEffect(() => {
    const el = videoRef.current
    if (!el) return

    let lastTime = 0
    const onTimeUpdate = () => {
      const now = el.currentTime
      if (now > lastTime) clearStallTimer()
      // Only count forward, continuous playback
      if (now > lastTime && now - lastTime < 2) {
        watchedRef.current += now - lastTime
      }
      lastTime = now
      const duration = el.duration || durationSeconds || 0
      if (duration > 0) {
        setPercent(Math.min(100, Math.round((now / duration) * 100)))
      }
    }
    const onPlay = () => {
      setPlaybackError(null)
      if (!startedRef.current) {
        startedRef.current = true
        sendProgress('start')
      }
    }
    const onEnded = () => sendProgress('ended')

    el.addEventListener('timeupdate', onTimeUpdate)
    el.addEventListener('play', onPlay)
    el.addEventListener('ended', onEnded)

    const interval = setInterval(() => {
      if (!el.paused && !el.ended) sendProgress('heartbeat')
    }, HEARTBEAT_INTERVAL * 1000)

    return () => {
      clearStallTimer()
      el.removeEventListener('timeupdate', onTimeUpdate)
      el.removeEventListener('play', onPlay)
      el.removeEventListener('ended', onEnded)
      clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId])

  async function markComplete() {
    setMarking(true)
    await sendProgress('ended')
    setCompleted(true)
    setMarking(false)
    router.refresh()
  }

  const canMarkComplete = completed || percent >= MARK_COMPLETE_THRESHOLD

  return (
    <div>
      {videoPathname ? (
        <video
          ref={videoRef}
          controls
          playsInline
          controlsList="nodownload"
          className="aspect-video w-full rounded-lg border border-border bg-black"
          src={apiUrl(`/media?pathname=${encodeURIComponent(videoPathname)}`)}
          poster={
            thumbnailPathname
              ? apiUrl(`/media?pathname=${encodeURIComponent(thumbnailPathname)}`)
              : undefined
          }
          preload="metadata"
          onLoadedMetadata={restorePosition}
          onError={(event) => {
            clearStallTimer()
            setPlaybackError(playbackMessage(event.currentTarget.error?.code))
          }}
          onWaiting={onBuffering}
          onStalled={onBuffering}
          onPlaying={() => { clearStallTimer(); setPlaybackError(null) }}
          onCanPlay={clearStallTimer}
          onPause={clearStallTimer}
        >
          <track kind="captions" />
        </video>
      ) : (
        <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-border bg-muted">
          <p className="text-muted-foreground">
            Video coming soon — check back later.
          </p>
        </div>
      )}

      {playbackError && videoPathname && (
        <div role="alert" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <p>{playbackError}</p>
          <p className="mt-1 text-xs">If it keeps happening, tell support which lesson you were watching and that playback failed on your device.</p>
          <Button type="button" variant="outline" className="mt-3" onClick={retryPlayback}>Retry video</Button>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {completed ? (
            <p className="flex items-center gap-2 font-medium text-success">
              <CheckCircle2 className="size-5" />
              Video complete
            </p>
          ) : (
            <>
              <p className="font-medium text-foreground">
                Watch the full video to unlock the next one.
              </p>
              <p className="text-sm text-muted-foreground">
                Watch at least {MARK_COMPLETE_THRESHOLD}% to enable &ldquo;Mark
                as complete.&rdquo;
              </p>
            </>
          )}
        </div>
        {completed ? (
          nextHref ? (
            <Button
              className="gap-2"
              nativeButton={false}
              render={<Link href={nextHref} />}
            >
              Proceed to Next Video
              <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={courseHref} />}
            >
              Back to course
            </Button>
          )
        ) : (
          <Button
            variant="outline"
            onClick={markComplete}
            disabled={!canMarkComplete || marking}
            className="border-accent text-accent hover:bg-accent hover:text-accent-foreground disabled:border-input disabled:text-muted-foreground"
          >
            {marking ? 'Saving...' : 'Mark as complete'}
          </Button>
        )}
      </div>
    </div>
  )
}
