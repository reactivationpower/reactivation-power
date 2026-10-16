'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import {
  ChevronLeft,
  ChevronRight,
  Monitor,
  Pause,
  Play,
  RotateCcw,
} from 'lucide-react'
import { SLIDES, type Slide } from './slides'


const TICK_MS = 100

interface DemoPlayerProps {
  /** Slide deck to play; defaults to the original walkthrough */
  slides?: Slide[]
}

export function DemoPlayer({ slides = SLIDES }: DemoPlayerProps) {
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [recordingMode, setRecordingMode] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const slide = slides[index]
  const isLast = index === slides.length - 1

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!playing) {
      stopTimer()
      return
    }
    timerRef.current = setInterval(() => {
      setElapsed((prev) => prev + TICK_MS)
    }, TICK_MS)
    return stopTimer
  }, [playing, stopTimer])

  useEffect(() => {
    if (elapsed < slide.duration) return
    if (isLast) {
      setPlaying(false)
      return
    }
    setIndex((i) => i + 1)
    setElapsed(0)
  }, [elapsed, slide.duration, isLast])

  const goTo = (i: number) => {
    setIndex(Math.max(0, Math.min(slides.length - 1, i)))
    setElapsed(0)
  }

  const restart = () => {
    setIndex(0)
    setElapsed(0)
    setPlaying(true)
  }

  const progress = Math.min((elapsed / slide.duration) * 100, 100)

  return (
    <section
      aria-label="Guided walkthrough player"
      className="flex flex-col gap-4"
    >
      {/* Step tracker */}
      {!recordingMode && (
        <ol className="flex flex-wrap items-center gap-2" aria-label="Steps">
          {slides.map((s, i) => (
            <li key={s.label}>
              <button
                type="button"
                onClick={() => goTo(i)}
                aria-current={i === index ? 'step' : undefined}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  i === index
                    ? 'bg-primary text-primary-foreground'
                    : i < index
                      ? 'bg-accent/15 text-accent'
                      : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                {i + 1}. {s.label}
              </button>
            </li>
          ))}
        </ol>
      )}

      {/* Slide stage */}
      <figure className="relative overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="relative aspect-[3/2] w-full bg-muted">
          <Image
            key={slide.image + index}
            src={slide.image || "/placeholder.svg"}
            alt={slide.imageAlt}
            fill
            sizes="(max-width: 1024px) 100vw, 960px"
            className="object-contain"
            priority
          />
        </div>

        {/* Caption bar */}
        <figcaption className="border-t border-border bg-primary px-5 py-4">
          <p className="text-pretty text-sm font-medium leading-relaxed text-primary-foreground sm:text-base">
            {slide.caption}
          </p>
        </figcaption>

        {/* Autoplay progress */}
        <div
          className="absolute inset-x-0 top-0 h-1 bg-border/50"
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Slide progress"
        >
          <div
            className="h-full bg-accent transition-[width] duration-100 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      </figure>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => goTo(index - 1)}
            disabled={index === 0}
            className="inline-flex size-10 items-center justify-center rounded-md border border-border bg-card text-foreground transition-colors hover:bg-muted disabled:opacity-40"
            aria-label="Previous step"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            {playing ? (
              <>
                <Pause className="size-4" /> Pause
              </>
            ) : (
              <>
                <Play className="size-4" /> {index === 0 && elapsed === 0 ? 'Play walkthrough' : 'Resume'}
              </>
            )}
          </button>
          <button
            type="button"
            onClick={restart}
            className="inline-flex size-10 items-center justify-center rounded-md border border-border bg-card text-foreground transition-colors hover:bg-muted"
            aria-label="Restart from beginning"
          >
            <RotateCcw className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => goTo(index + 1)}
            disabled={isLast}
            className="inline-flex size-10 items-center justify-center rounded-md border border-border bg-card text-foreground transition-colors hover:bg-muted disabled:opacity-40"
            aria-label="Next step"
          >
            <ChevronRight className="size-5" />
          </button>
          <span className="ml-1 text-sm tabular-nums text-muted-foreground">
            {index + 1} / {slides.length}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setRecordingMode((r) => !r)}
          className={`inline-flex h-10 items-center gap-2 rounded-md border px-4 text-sm font-medium transition-colors ${
            recordingMode
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-border bg-card text-foreground hover:bg-muted'
          }`}
        >
          <Monitor className="size-4" />
          {recordingMode ? 'Exit recording mode' : 'Recording mode'}
        </button>
      </div>

      {/* Narration for the current slide */}
      {!recordingMode && (
        <aside
          className="rounded-lg border border-border bg-muted/40 p-4"
          aria-label="Narration for this step"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Read aloud while this step is on screen
          </p>
          <p className="mt-2 text-pretty text-sm leading-relaxed text-foreground">
            {slide.narration}
          </p>
        </aside>
      )}
    </section>
  )
}

