/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { VideoCanvas, VideoPausedContext, useVideoAudio, useVideoPlayer, useSceneTimer } from '@/lib/video'
import rawLesson from './lesson.json'
import { TutorialScene, type Lesson, type Scene } from './video_scenes/TutorialScene'
import './Tutorial.css'

export const LESSON = rawLesson as Lesson
export const SCENE_DURATIONS = Object.fromEntries(LESSON.scenes.map(s => [s.key, s.durationMs]))
const VIDEO_ASPECT_RATIO = '16:9' as const
declare global {
  interface Window {
    __setTutorialTime?: (seconds: number) => Promise<void>
    __tutorialInfo?: { title: string; duration: number; scene: string; time: number }
  }
}
function TimedScene({ scene, audio, paused, forced }: {
  scene: Scene; audio: React.RefObject<HTMLAudioElement | null>; paused: boolean; forced: number | null
}) {
  const [time, setTime] = useState(0)
  useSceneTimer(Array.from({ length: Math.ceil(scene.durationMs / 40) }, (_, i) => ({
    time: i * 40, callback: () => {
      const clock = audio.current
      // Narration is authoritative once it is available; no narration is compressed.
      setTime(clock && clock.readyState >= 2 ? Math.max(0, clock.currentTime * 1000 - scene.startMs) : i * 40)
    },
  })))
  return <TutorialScene lesson={LESSON} scene={scene} time={forced ?? time} paused={paused}/>
}
export default function VideoTemplate({ durations = SCENE_DURATIONS, loop = true, paused: pausedProp = false, muted: mutedProp = false, onSceneChange }: {
  durations?: Record<string, number>; loop?: boolean; paused?: boolean; muted?: boolean; onSceneChange?: (key: string) => void
} = {}) {
  // The workspace-controlled player (lib/video/controls.tsx) pauses and mutes through the bridge.
  const bridgeAudio = useVideoAudio()
  const paused = pausedProp || bridgeAudio.paused
  const muted = mutedProp || bridgeAudio.muted
  const frameQuery = new URLSearchParams(window.location.search).get('frame')
  const frameMode = frameQuery !== null
  const [forced, setForced] = useState<number | null>(frameMode ? Number(frameQuery) * 1000 : null)
  const { currentSceneKey } = useVideoPlayer({ durations, loop, paused: paused || frameMode })
  const baseKey = currentSceneKey.replace(/_r[12]$/, '')
  const scene = forced !== null
    ? [...LESSON.scenes].reverse().find(s => forced >= s.startMs) ?? LESSON.scenes[0]
    : LESSON.scenes.find(s => s.key === baseKey)!
  const audio = useRef<HTMLAudioElement>(null)
  const lastKey = useRef('')
  useEffect(() => { onSceneChange?.(currentSceneKey) }, [currentSceneKey, onSceneChange])
  useEffect(() => {
    const el = audio.current
    if (!el || frameMode) return
    if (lastKey.current !== currentSceneKey) {
      el.currentTime = scene.startMs / 1000
      lastKey.current = currentSceneKey
    }
    if (paused) el.pause()
    else el.play().catch(e => { if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') console.error(e) })
  }, [currentSceneKey, scene.startMs, paused, muted, frameMode])
  useEffect(() => {
    if (!frameMode) return
    window.__setTutorialTime = async seconds => {
      flushSync(() => setForced(Math.min(LESSON.durationMs - 1, Math.max(0, seconds * 1000))))
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    }
    return () => { delete window.__setTutorialTime }
  }, [frameMode])
  window.__tutorialInfo = { title: LESSON.title, duration: LESSON.durationMs / 1000, scene: scene.key, time: forced ?? 0 }
  return <VideoPausedContext.Provider value={paused || frameMode}>
    <VideoCanvas aspectRatio={VIDEO_ASPECT_RATIO} style={{ backgroundColor: '#092a3b' }}>
      <TimedScene key={forced === null ? currentSceneKey : scene.key} scene={scene} audio={audio} paused={paused} forced={forced === null ? null : forced - scene.startMs}/>
      <audio ref={audio} src={`${import.meta.env.BASE_URL}audio/${LESSON.audioFile ?? 'tutorial-mix.mp3'}`} preload="auto" muted={muted || frameMode}/>
    </VideoCanvas>
  </VideoPausedContext.Provider>
}