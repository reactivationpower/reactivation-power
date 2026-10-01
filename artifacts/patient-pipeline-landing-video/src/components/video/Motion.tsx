import { useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { useSceneTimer } from '@/lib/video'
import { NARRATION_TEMPO } from './pacing'

export const EASE = [0.22, 1, 0.36, 1] as const
export const image = (file: string) => `${import.meta.env.BASE_URL}images/${file}`

export function useBeats(times: number[]) {
  const [beat, setBeat] = useState(0)
  useSceneTimer(times.map((time, i) => ({ time: time / NARRATION_TEMPO, callback: () => setBeat(i + 1) })))
  return beat
}

export function Scene({ children, tone = 'navy', name }: { children: ReactNode; tone?: 'navy' | 'ivory' | 'blue'; name: string }) {
  return <motion.section data-scene={name} className={`landing-scene tone-${tone}`}
    initial={{ opacity: 0.15, scale: 1.035 }} animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 1.06, transition: { duration: .4 } }}
    transition={{ duration: .65, ease: EASE }}>{children}</motion.section>
}

export function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return <motion.div className={className} initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .65, delay, ease: EASE }}>{children}</motion.div>
}

export function Brand({ className = '' }: { className?: string }) {
  return <img className={`brand-mark ${className}`} src={image('patient-pipeline-logo.png')} alt="Patient Pipeline" />
}

export function Cursor({ x, y, fromX = 75, fromY = 25 }: { x: number; y: number; fromX?: number; fromY?: number }) {
  return <motion.div className="virtual-cursor" data-cursor-target={`${x},${y}`} aria-hidden="true"
    initial={{ left: `${fromX}%`, top: `${fromY}%`, opacity: 0 }}
    animate={{ left: `${x}%`, top: `${y}%`, opacity: 1 }}
    transition={{ left: { duration: 1.15, ease: EASE }, top: { duration: 1.15, ease: EASE }, opacity: { duration: .15 } }}>
    <motion.svg viewBox="0 0 36 42" animate={{ scale: [1, .76, 1] }} transition={{ delay: 1.25, duration: .25 }}>
      <path d="M3 2v32l8-7 6 12 6-3-6-12 12-1L3 2Z" fill="#092a3b" stroke="#fff" strokeWidth="2.5" strokeLinejoin="round" />
    </motion.svg>
    <motion.span className="click-ring" initial={{ opacity: 0, scale: .3 }}
      animate={{ opacity: [0, .85, 0], scale: [.3, 1.8, 2.2] }} transition={{ delay: 1.25, duration: .6 }} />
  </motion.div>
}

export function CallFrame({ src, alt, children, zoom = 1, focus = '50% 50%' }: { src: string; alt: string; children?: ReactNode; zoom?: number; focus?: string }) {
  return <motion.div className="real-screen" animate={{ scale: zoom }} style={{ transformOrigin: focus }}
    transition={{ duration: 1.2, ease: EASE }}>
    <img src={image(src)} alt={alt} />
    {children}
  </motion.div>
}

export function TypedNote({ text = 'Asked for a callback.' }: { text?: string }) {
  const [length, setLength] = useState(0)
  useSceneTimer(Array.from(text, (_, i) => ({ time: 90 + i * 105, callback: () => setLength(i + 1) })))
  return <div className="typed-note" data-typed-note>{text.slice(0, length)}<span className="text-caret" /></div>
}