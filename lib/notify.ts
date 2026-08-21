'use client'

import { toast } from 'sonner'

/**
 * Toast helpers with a short bell "ding".
 *
 * The chime is synthesized with the Web Audio API rather than loading an
 * audio file — two decaying partials a fifth apart read as a bell, and it
 * costs no network request. Browsers only allow audio after a user
 * gesture, so every call is wrapped defensively: a blocked or
 * unsupported AudioContext must never break the toast itself.
 */

let audioCtx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    if (!Ctor) return null
    audioCtx ??= new Ctor()
    if (audioCtx.state === 'suspended') void audioCtx.resume()
    return audioCtx
  } catch {
    return null
  }
}

/** Play a short two-tone bell chime. */
export function playDing(): void {
  const ctx = getCtx()
  if (!ctx) return
  try {
    const now = ctx.currentTime
    // Fundamental plus a fifth above, both decaying — a simple bell
    const partials: [number, number, number][] = [
      [1318.5, 0.18, 0.9], // E6
      [1975.5, 0.08, 0.6], // B6
    ]
    for (const [freq, peak, length] of partials) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, now)
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(peak, now + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + length)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + length + 0.05)
    }
  } catch {
    // Audio is a nicety — never let it surface as an error
  }
}

/** Success toast with the completion chime. */
export function notifyDone(message: string, description?: string): void {
  playDing()
  toast.success(message, description ? { description } : undefined)
}

/** Error toast — silent, so failures don't sound like completions. */
export function notifyError(message: string, description?: string): void {
  toast.error(message, description ? { description } : undefined)
}

/** Neutral informational toast. */
export function notifyInfo(message: string, description?: string): void {
  toast(message, description ? { description } : undefined)
}
