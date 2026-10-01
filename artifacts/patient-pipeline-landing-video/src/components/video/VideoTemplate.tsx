import { useEffect, useRef, useState, type ComponentType } from 'react'
import { AnimatePresence } from 'framer-motion'
import { VideoCanvas, VideoPausedContext, useVideoPlayer, type VideoAspectRatio } from '@/lib/video'
import { Opportunity } from './video_scenes/Opportunity'
import { Introduction } from './video_scenes/Introduction'
import { Niches } from './video_scenes/Niches'
import { Reactivation } from './video_scenes/Reactivation'
import { Lead } from './video_scenes/Lead'
import { Workflow } from './video_scenes/Workflow'
import { Revenue } from './video_scenes/Revenue'
import { Invitation } from './video_scenes/Invitation'
import './LandingFilm.css'

export const SCENE_DURATIONS = {
  opportunity: 29900, introduction: 12750, niches: 11100, reactivation: 21000,
  lead: 16083, workflow: 11750, revenue: 28583, invitation: 14833,
}
const VIDEO_ASPECT_RATIO: VideoAspectRatio = '16:9'
const SCENES: Record<string, ComponentType> = {
  opportunity: Opportunity, introduction: Introduction, niches: Niches, reactivation: Reactivation,
  lead: Lead, workflow: Workflow, revenue: Revenue, invitation: Invitation,
}
const START_SEC = (() => {
  let offset = 0
  const result: Record<string, number> = {}
  for (const [key, duration] of Object.entries(SCENE_DURATIONS)) {
    result[key] = offset / 1000; offset += duration
  }
  return result
})()

export default function VideoTemplate({ durations = SCENE_DURATIONS, loop = true, paused = false, muted = false, onSceneChange }: {
  durations?: Record<string, number>; loop?: boolean; paused?: boolean; muted?: boolean; onSceneChange?: (key: string) => void
} = {}) {
  const { currentSceneKey } = useVideoPlayer({ durations, loop, paused })
  const baseKey = currentSceneKey.replace(/_r[12]$/, '')
  const SceneComponent = SCENES[baseKey]
  const audioRef = useRef<HTMLAudioElement>(null)
  const lastKey = useRef<string | null>(null)
  const [audioBlocked, setAudioBlocked] = useState(false)
  useEffect(() => { onSceneChange?.(currentSceneKey) }, [currentSceneKey, onSceneChange])
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (paused) { audio.pause(); return }
    if (lastKey.current !== currentSceneKey) {
      lastKey.current = currentSceneKey
      const target = START_SEC[baseKey] ?? 0
      if (Math.abs(audio.currentTime - target) > .18) audio.currentTime = target
    }
    audio.play().then(() => setAudioBlocked(false)).catch(() => setAudioBlocked(true))
  }, [currentSceneKey, baseKey, paused, muted])
  return <VideoPausedContext.Provider value={paused}>
    <VideoCanvas className="landing-film" data-audio-blocked={audioBlocked} data-current-scene={baseKey}
      aspectRatio={VIDEO_ASPECT_RATIO} style={{ backgroundColor: '#092a3b' }}>
      <AnimatePresence mode="sync">{SceneComponent && <SceneComponent key={currentSceneKey} />}</AnimatePresence>
      <audio ref={audioRef} src={`${import.meta.env.BASE_URL}audio/landing-composite-reactivation-120.mp3`} preload="auto" muted={muted} />
    </VideoCanvas>
  </VideoPausedContext.Provider>
}
