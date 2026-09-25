'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Mic, MicOff } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface AssistContext {
  stepKey: string
  stepTitle: string
  stepText: string
  choices: { id: string; label: string }[]
  concerns: string[]
}

export interface AssistSuggestion {
  stepKey: string
  choiceId: string | null
  concern: string | null
}

interface Props {
  context: AssistContext
  onSuggestion: (s: AssistSuggestion) => void
}

// Minimal typing for the browser Speech Recognition API (not in lib.dom yet).
interface RecognitionResult {
  isFinal: boolean
  0: { transcript: string }
}
interface RecognitionEvent {
  resultIndex: number
  results: ArrayLike<RecognitionResult>
}
interface Recognition {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  onresult: ((e: RecognitionEvent) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
}

function getRecognitionCtor(): (new () => Recognition) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: new () => Recognition
    webkitSpeechRecognition?: new () => Recognition
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const TRANSCRIPT_WINDOW = 1500
const ASK_DELAY_MS = 600

export function LiveAssist({ context, onSuggestion }: Props) {
  const [supported, setSupported] = useState<boolean | null>(null)
  const [listening, setListening] = useState(false)
  const [heard, setHeard] = useState('')
  const [interim, setInterim] = useState('')
  const [thinking, setThinking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Speech heard since landing on this screen; a new screen starts clean so
  // the suggestion only judges the reply to what's on screen now.
  const [heardFor, setHeardFor] = useState(context.stepKey)
  if (heardFor !== context.stepKey) {
    setHeardFor(context.stepKey)
    setHeard('')
    setInterim('')
  }

  const recognitionRef = useRef<Recognition | null>(null)
  const wantListeningRef = useRef(false)
  const heardRef = useRef('')
  const contextRef = useRef(context)
  const onSuggestionRef = useRef(onSuggestion)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (contextRef.current.stepKey !== context.stepKey) {
      heardRef.current = ''
      abortRef.current?.abort()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    contextRef.current = context
    onSuggestionRef.current = onSuggestion
  })

  useEffect(() => {
    setSupported(getRecognitionCtor() !== null)
    return () => {
      wantListeningRef.current = false
      recognitionRef.current?.stop()
      abortRef.current?.abort()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  async function ask() {
    const ctx = contextRef.current
    const transcript = heardRef.current.slice(-TRANSCRIPT_WINDOW)
    if (!transcript.trim()) return
    if (ctx.choices.length === 0 && ctx.concerns.length === 0) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setThinking(true)
    try {
      const res = await fetch('/api/script-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          stepTitle: ctx.stepTitle,
          stepText: ctx.stepText,
          choices: ctx.choices,
          concerns: ctx.concerns,
          transcript,
        }),
      })
      if (!res.ok) throw new Error(String(res.status))
      const data = (await res.json()) as {
        choiceId: string | null
        concern: string | null
      }
      if (contextRef.current.stepKey !== ctx.stepKey) return
      setError(null)
      onSuggestionRef.current({ stepKey: ctx.stepKey, ...data })
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError('Couldn\u2019t reach the listening assistant. Keep tapping as usual.')
      }
    } finally {
      if (abortRef.current === controller) setThinking(false)
    }
  }

  function start() {
    const Ctor = getRecognitionCtor()
    if (!Ctor) return
    const rec = new Ctor()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = 'en-US'
    rec.onresult = (e) => {
      let interimText = ''
      let gotFinal = false
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        const text = r[0].transcript.trim()
        if (!text) continue
        if (r.isFinal) {
          heardRef.current = `${heardRef.current} ${text}`.trim()
          gotFinal = true
        } else {
          interimText += ` ${text}`
        }
      }
      setInterim(interimText.trim())
      if (gotFinal) {
        setHeard(heardRef.current)
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(ask, ASK_DELAY_MS)
      }
    }
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        wantListeningRef.current = false
        setListening(false)
        setError('Microphone access was blocked. Allow the mic in your browser settings to use listening.')
      }
    }
    // Browsers end recognition after a stretch of silence; keep it going
    // until the caller turns listening off.
    rec.onend = () => {
      if (wantListeningRef.current) {
        try {
          rec.start()
        } catch {
          setListening(false)
        }
      } else {
        setListening(false)
      }
    }
    recognitionRef.current = rec
    wantListeningRef.current = true
    setError(null)
    try {
      rec.start()
      setListening(true)
    } catch {
      setError('Couldn\u2019t start the microphone. Try again.')
    }
  }

  function stop() {
    wantListeningRef.current = false
    recognitionRef.current?.stop()
    setListening(false)
    setInterim('')
  }

  if (supported === false) {
    return (
      <div className="border-b border-border bg-muted/40 px-5 py-3 text-sm text-muted-foreground sm:px-8">
        Listening needs Chrome, Edge, or Safari. You can still practice by tapping.
      </div>
    )
  }

  const live = `${heard} ${interim}`.trim()

  return (
    <div className="flex flex-col gap-2 border-b border-border bg-primary/5 px-5 py-3 sm:px-8">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={listening ? stop : start}
          disabled={supported === null}
          aria-pressed={listening}
          className={cn(
            'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors disabled:opacity-50',
            listening
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-primary/40 bg-card text-foreground hover:bg-primary/10',
          )}
        >
          {listening ? (
            <>
              <span className="relative flex size-2.5" aria-hidden="true">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary-foreground/70" />
                <span className="relative inline-flex size-2.5 rounded-full bg-primary-foreground" />
              </span>
              Listening
              <MicOff className="size-4" aria-hidden="true" />
            </>
          ) : (
            <>
              <Mic className="size-4" aria-hidden="true" />
              Listen
            </>
          )}
        </button>
        <p className="min-w-0 text-xs leading-relaxed text-muted-foreground">
          {listening
            ? 'Read the script out loud and have a coworker answer as the patient. The best-matching button lights up.'
            : 'Practice with the mic on. It suggests the button to tap; you still tap it.'}
        </p>
        {thinking && (
          <Loader2
            className="ml-auto size-4 shrink-0 animate-spin text-primary"
            aria-label="Checking what was heard"
          />
        )}
      </div>
      {listening && (
        <p
          className="line-clamp-2 min-h-5 text-sm leading-relaxed text-foreground"
          aria-live="polite"
        >
          {live ? (
            <>
              <span className="text-muted-foreground">Heard: </span>
              {live.length > 220 ? `\u2026${live.slice(-220)}` : live}
            </>
          ) : (
            <span className="text-muted-foreground">Waiting for speech\u2026</span>
          )}
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
