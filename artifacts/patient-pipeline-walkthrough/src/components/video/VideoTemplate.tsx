import { useEffect, useRef } from 'react'
import { AnimatePresence } from 'framer-motion'
import { VideoCanvas, VideoPausedContext, useVideoPlayer, type VideoAspectRatio } from '@/lib/video'
import { Introduction, ContactUpload, StaffTraining, CallsDue, SharedOpening, FeelingFine, BackToWhereItWas, ServiceSpecific, LeadFollowUp, LeadAfterCall, Resolution } from './video_scenes/WalkthroughScenes'

export const SCENE_DURATIONS = { introduction:20000, contacts:22000, training:18000, queue:24000, opening:20000, feelingFine:21000, backToWhere:18000, services:28000, lead:35000, leadAfterCall:22000, resolution:12000 }
const VIDEO_ASPECT_RATIO: VideoAspectRatio = '16:9'
const SCENES: Record<string, React.ComponentType> = { introduction:Introduction, contacts:ContactUpload, training:StaffTraining, queue:CallsDue, opening:SharedOpening, feelingFine:FeelingFine, backToWhere:BackToWhereItWas, services:ServiceSpecific, lead:LeadFollowUp, leadAfterCall:LeadAfterCall, resolution:Resolution }
const START_SEC: Record<string, number> = (() => { let ms=0; const result:Record<string,number>={}; for(const [key,duration] of Object.entries(SCENE_DURATIONS)){ result[key]=ms/1000; ms+=duration } return result })()

export default function VideoTemplate({ durations=SCENE_DURATIONS, loop=true, paused=false, muted=false, onSceneChange }: {
  durations?: Record<string,number>; loop?:boolean; paused?:boolean; muted?:boolean; onSceneChange?:(key:string)=>void
} = {}) {
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
      <div className={`wf-domain-footer${baseKey === 'resolution' ? ' wf-domain-footer--end' : ''}`}>www.PatientPipeline.app</div>
      <audio ref={audioRef} src={`${import.meta.env.BASE_URL}audio/composite_audio_matilda_services.mp3`} preload="auto" autoPlay muted={muted} />
    </VideoCanvas>
  </VideoPausedContext.Provider>
}
