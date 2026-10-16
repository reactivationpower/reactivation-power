import { useContext, useEffect, useRef } from 'react'
import { AudioClockContext } from './AudioClockContext'
import timing from './narration-timing.json'

export type NarrationScene = keyof typeof timing
type Cue = { time: number; callback: () => void }

/** Follow the actual soundtrack, including its intentional punctuation pauses. */
export function useNarrationTimer(scene: NarrationScene, cues: Cue[]) {
  const audio = useContext(AudioClockContext)
  const latest = useRef(cues)
  latest.current = cues
  useEffect(() => {
    const fired = new Set<number>()
    let frame: number
    const tick = () => {
      const element = audio?.current
      if (element) {
        const local = element.currentTime * 1000 - timing[scene].startMs
        // A scene jump can mount before the parent's audio seek effect runs.
        if (local >= 0 && local < timing[scene].durationMs) {
          latest.current.forEach((cue, index) => {
            if (!fired.has(index) && local >= cue.time) {
              fired.add(index)
              cue.callback()
            }
          })
        }
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [audio, scene])
}