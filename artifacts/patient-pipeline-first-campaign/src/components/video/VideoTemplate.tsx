import { useEffect, useRef } from 'react'
import { AnimatePresence } from 'framer-motion'
import { VideoCanvas, VideoPausedContext, useVideoPlayer, type VideoAspectRatio } from '@/lib/video'
import { Opening, Preparation, OpenCampaigns, EnterOffer, PriceAndSave, FindForm, ConnectForm, TestForm, PracticeScript, FindLeads, Checklist } from './video_scenes/FirstCampaignScenes'
import { AudioClockContext } from './AudioClockContext'

export const SCENE_DURATIONS = {
  opening:20000, preparation:21000, openCampaigns:21500, enterOffer:34000,
  priceAndSave:27000, findForm:29500, connectForm:55500, testForm:45500,
  practiceScript:18500, findLeads:25500, checklist:26000,
}
const VIDEO_ASPECT_RATIO: VideoAspectRatio = '16:9'
const SCENES: Record<string, React.ComponentType> = {
  opening:Opening, preparation:Preparation, openCampaigns:OpenCampaigns,
  enterOffer:EnterOffer, priceAndSave:PriceAndSave, findForm:FindForm,
  connectForm:ConnectForm, testForm:TestForm, practiceScript:PracticeScript,
  findLeads:FindLeads, checklist:Checklist,
}
const START_SEC: Record<string,number> = (() => {
  let elapsed=0
  const starts:Record<string,number>={}
  for(const [key,duration] of Object.entries(SCENE_DURATIONS)) { starts[key]=elapsed/1000; elapsed+=duration }
  return starts
})()

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
    if(paused) { audio.pause();return }
    if(lastKey.current!==currentSceneKey) {
      lastKey.current=currentSceneKey
      const target=START_SEC[baseKey]??0
      if(Math.abs(audio.currentTime-target)>.18) audio.currentTime=target
    }
    audio.play().catch(() => {})
  },[currentSceneKey,baseKey,paused,muted])
  return <VideoPausedContext.Provider value={paused}>
    <AudioClockContext.Provider value={audioRef}>
    <VideoCanvas aspectRatio={VIDEO_ASPECT_RATIO} style={{backgroundColor:'#092a3b'}}>
      <AnimatePresence mode="sync">{Scene && <Scene key={currentSceneKey}/>}</AnimatePresence>
      <audio ref={audioRef} src={`${import.meta.env.BASE_URL}audio/composite_audio_tightened_v2.mp3`} preload="auto" autoPlay muted={muted}/>
    </VideoCanvas>
    </AudioClockContext.Provider>
  </VideoPausedContext.Provider>
}