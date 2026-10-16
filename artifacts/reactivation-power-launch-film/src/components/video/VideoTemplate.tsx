import { useEffect, useRef } from 'react'
import { AnimatePresence } from 'framer-motion'
import { VideoCanvas, VideoPausedContext, useVideoAudio, useVideoPlayer, type VideoAspectRatio } from '@/lib/video'
import { Opportunities } from './video_scenes/Opportunities'
import { Reactivation } from './video_scenes/Reactivation'
import { LeadFollowUp } from './video_scenes/LeadFollowUp'
import { TwoTools } from './video_scenes/TwoTools'
import { Offer } from './video_scenes/Offer'

export const SCENE_DURATIONS = { opportunities:5000, reactivation:11000, leads:11000, tools:12000, offer:10000 }
const VIDEO_ASPECT_RATIO: VideoAspectRatio = '16:9'
const SCENES: Record<string, React.ComponentType> = { opportunities:Opportunities, reactivation:Reactivation, leads:LeadFollowUp, tools:TwoTools, offer:Offer }
const START_SEC: Record<string, number> = (() => {
  const result:Record<string,number> = {}
  let ms=0
  for (const [key,duration] of Object.entries(SCENE_DURATIONS)) { result[key]=ms/1000; ms+=duration }
  return result
})()

export default function VideoTemplate({ durations=SCENE_DURATIONS, loop=true, paused:pausedProp=false, muted:mutedProp=false, onSceneChange }: {
  durations?: Record<string,number>; loop?:boolean; paused?:boolean; muted?:boolean; onSceneChange?:(key:string)=>void
} = {}) {
  // The workspace-controlled player (lib/video/controls.tsx) pauses and mutes through the bridge.
  const bridgeAudio = useVideoAudio()
  const paused = pausedProp || bridgeAudio.paused
  const muted = mutedProp || bridgeAudio.muted
  const { currentSceneKey } = useVideoPlayer({ durations, loop, paused })
  const baseKey=currentSceneKey.replace(/_r[12]$/,'')
  const Scene=SCENES[baseKey]
  const audioRef=useRef<HTMLAudioElement>(null)
  const lastKey=useRef<string|null>(null)
  useEffect(() => { onSceneChange?.(currentSceneKey) }, [currentSceneKey,onSceneChange])
  useEffect(() => {
    const audio=audioRef.current
    if (!audio) return
    if (paused) { audio.pause(); return }
    if (lastKey.current !== currentSceneKey) {
      lastKey.current=currentSceneKey
      const target=START_SEC[baseKey] ?? 0
      if (Math.abs(audio.currentTime-target)>.18) audio.currentTime=target
    }
    audio.play().catch(() => {})
  },[currentSceneKey,baseKey,paused,muted])
  return <VideoPausedContext.Provider value={paused}>
    <VideoCanvas aspectRatio={VIDEO_ASPECT_RATIO} style={{ backgroundColor:'#15233c' }}>
      <AnimatePresence mode="sync">{Scene && <Scene key={currentSceneKey} />}</AnimatePresence>
      <audio ref={audioRef} src={`${import.meta.env.BASE_URL}audio/composite_audio.mp3`} preload="auto" autoPlay={!paused} muted={muted} />
    </VideoCanvas>
  </VideoPausedContext.Provider>
}