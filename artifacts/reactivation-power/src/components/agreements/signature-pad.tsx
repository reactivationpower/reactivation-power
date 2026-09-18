// @ts-nocheck
import { useEffect, useRef, useState } from 'react'
import { Eraser, PenLine, Type } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export type SignatureValue =
  | { type: 'typed'; data: string }
  | { type: 'drawn'; data: string }
  | null

/**
 * Typed or drawn signature. Drawing uses pointer events so it works with a
 * finger on phones/tablets and a mouse or trackpad on desktop; the canvas is
 * scaled for the device pixel ratio and exported as a PNG data URL.
 */
export function SignaturePad({
  defaultName,
  value,
  onChange,
  disabled,
}: {
  defaultName: string
  value: SignatureValue
  onChange: (v: SignatureValue) => void
  disabled?: boolean
}) {
  const [mode, setMode] = useState<'typed' | 'drawn'>('drawn')
  const [typed, setTyped] = useState(defaultName)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawing = useRef(false)
  const hasInk = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)

  // Size the canvas to its CSS box × devicePixelRatio so strokes stay crisp
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => {
      const ratio = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      if (rect.width === 0) return
      const existing = hasInk.current ? canvas.toDataURL('image/png') : null
      canvas.width = Math.round(rect.width * ratio)
      canvas.height = Math.round(rect.height * ratio)
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.lineWidth = 2.2
      ctx.strokeStyle = '#111827'
      if (existing) {
        const img = new Image()
        img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height)
        img.src = existing
      }
    }
    resize()
    const obs = new ResizeObserver(resize)
    obs.observe(canvas)
    return () => obs.disconnect()
  }, [mode])

  useEffect(() => {
    if (mode === 'typed') onChange(typed.trim().length >= 2 ? { type: 'typed', data: typed.trim() } : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, typed])

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    last.current = point(e)
    const ctx = e.currentTarget.getContext('2d')
    if (ctx && last.current) {
      ctx.beginPath()
      ctx.arc(last.current.x, last.current.y, 1.1, 0, Math.PI * 2)
      ctx.fillStyle = '#111827'
      ctx.fill()
      hasInk.current = true
    }
  }
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || disabled) return
    e.preventDefault()
    const ctx = e.currentTarget.getContext('2d')
    const p = point(e)
    if (ctx && last.current) {
      ctx.beginPath()
      ctx.moveTo(last.current.x, last.current.y)
      ctx.lineTo(p.x, p.y)
      ctx.stroke()
      hasInk.current = true
    }
    last.current = p
  }
  const end = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    drawing.current = false
    last.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }
    if (hasInk.current) onChange({ type: 'drawn', data: e.currentTarget.toDataURL('image/png') })
  }
  const clear = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    hasInk.current = false
    onChange(null)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2" role="tablist" aria-label="Signature method">
        <Button
          type="button"
          size="sm"
          variant={mode === 'drawn' ? 'default' : 'outline'}
          role="tab"
          aria-selected={mode === 'drawn'}
          onClick={() => {
            setMode('drawn')
            onChange(null)
          }}
          disabled={disabled}
        >
          <PenLine className="size-4" /> Draw
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === 'typed' ? 'default' : 'outline'}
          role="tab"
          aria-selected={mode === 'typed'}
          onClick={() => setMode('typed')}
          disabled={disabled}
        >
          <Type className="size-4" /> Type
        </Button>
      </div>

      {mode === 'drawn' ? (
        <div className="relative">
          <canvas
            ref={canvasRef}
            data-testid="signature-canvas"
            className="h-40 w-full touch-none rounded-lg border-2 border-dashed border-border bg-white"
            style={{ touchAction: 'none' }}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            onPointerLeave={end}
            aria-label="Draw your signature"
          />
          {!value ? (
            <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs text-muted-foreground">
              Sign here with your finger, stylus or mouse
            </p>
          ) : null}
          <Button type="button" size="sm" variant="ghost" className="absolute right-2 top-2" onClick={clear} disabled={disabled}>
            <Eraser className="size-4" /> Clear
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Type your full name"
            maxLength={120}
            disabled={disabled}
            aria-label="Type your signature"
            data-testid="signature-typed"
          />
          <div className="flex h-24 items-center justify-center rounded-lg border-2 border-dashed border-border bg-white px-4">
            <span className="font-serif text-3xl italic text-foreground" style={{ fontFamily: '"Brush Script MT", "Snell Roundhand", cursive' }}>
              {typed || 'Your signature'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

/** Read-only rendering of a captured signature. */
export function SignatureImage({ type, data, className = '' }: { type: 'typed' | 'drawn'; data: string; className?: string }) {
  if (type === 'drawn') return <img src={data} alt="Signature" className={`h-20 w-auto max-w-full ${className}`} />
  return (
    <span className={`text-3xl italic text-foreground ${className}`} style={{ fontFamily: '"Brush Script MT", "Snell Roundhand", cursive' }}>
      {data}
    </span>
  )
}
