'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

const HEARTBEAT_INTERVAL = 10 // seconds
const MARK_COMPLETE_THRESHOLD = 75 // % watched before the button enables

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
  const router = useRouter()

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
      const res = await fetch('/api/progress', {
        method: 'POST',
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
          controlsList="nodownload"
          className="aspect-video w-full rounded-lg border border-border bg-black"
          src={`/api/media?pathname=${encodeURIComponent(videoPathname)}`}
          poster={
            thumbnailPathname
              ? `/api/media?pathname=${encodeURIComponent(thumbnailPathname)}`
              : undefined
          }
          preload="metadata"
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
