import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { ChevronDown, ChevronUp, Pause, Play, Repeat, Volume2, VolumeX } from 'lucide-react'
import VideoTemplate, { SCENE_DURATIONS } from './VideoTemplate'
import { useSceneControls } from './useSceneControls'

const DETAILS:Record<string,string>={
  opening:'What you are setting up',preparation:'Before you start',openCampaigns:'Open Campaigns',
  enterOffer:'Enter your offer',priceAndSave:'Price and save',findForm:'Find the form',
  connectForm:'Connect the form',testForm:'Test the actual form',
  practiceScript:'Practice script',findLeads:'Find new leads',checklist:'First-campaign checklist',
}
function format(ms:number){const s=Math.max(0,Math.floor(ms/1000));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`}

function PlaybackStatus({keys,activeIndex,activeDuration,activeStartTime,totalDuration,tick,paused,onJump}:
  {keys:string[];activeIndex:number;activeDuration:number;activeStartTime:number;totalDuration:number;tick:number;paused:boolean;onJump:(i:number)=>void}) {
  const [elapsed,setElapsed]=useState(0)
  const accumulated=useRef(0)
  useEffect(()=>{accumulated.current=0;setElapsed(0)},[tick])
  useEffect(()=>{
    if(paused)return
    const started=performance.now()
    const id=window.setInterval(()=>setElapsed(accumulated.current+performance.now()-started),60)
    return()=>{window.clearInterval(id);accumulated.current+=performance.now()-started}
  },[tick,paused])
  return <>
    <div className="flex flex-1 items-center gap-1.5">{keys.map((key,i)=>
      <button key={key} onClick={()=>onJump(i)} aria-label={`Jump to scene ${i+1}: ${DETAILS[key]}`} title={DETAILS[key]}
        className="relative h-3 min-w-[12px] flex-1 overflow-hidden rounded-full bg-white/25 hover:h-4">
        <span className="absolute inset-y-0 left-0 rounded-full bg-teal-300" style={{width:i===activeIndex?`${Math.min(100,elapsed/activeDuration*100)}%`:'0%'}}/>
      </button>)}
    </div>
    <span className="shrink-0 font-mono text-white/80">{activeIndex+1}/{keys.length}</span>
    <span role="timer" className="min-w-[11ch] shrink-0 text-right font-mono text-white/80">{format(activeStartTime+Math.min(activeDuration,elapsed))} / {format(totalDuration)}</span>
  </>
}

export default function VideoWithControls() {
  const iframe=typeof window!=='undefined' && window.self!==window.top
  const {keys,activeIndex,locked,paused,mountKey,tick,durations,onSceneChange,jumpTo,toggleLock,togglePause,activeDuration,activeStartTime,totalDuration}=useSceneControls(SCENE_DURATIONS)
  const [muted,setMuted]=useState(false)
  const [collapsed,setCollapsed]=useState(false)
  const [hovering,setHovering]=useState(false)
  const [tapPinned,setTapPinned]=useState(false)
  const sensor=useRef<HTMLDivElement>(null)
  useEffect(()=>{
    if(!paused)return
    const running=document.getAnimations().filter(a=>a.playState==='running')
    running.forEach(a=>a.pause())
    return()=>running.forEach(a=>a.play())
  },[paused])
  useEffect(()=>{
    if(!collapsed||!tapPinned)return
    const onOutside=(e:globalThis.PointerEvent)=>{
      if(e.pointerType!=='mouse' && sensor.current && !sensor.current.contains(e.target as Node))setTapPinned(false)
    }
    document.addEventListener('pointerdown',onOutside)
    return()=>document.removeEventListener('pointerdown',onOutside)
  },[collapsed,tapPinned])
  const onJump=useCallback((index:number)=>{
    jumpTo(index)
    const key=keys[index]
    window.parent.postMessage({type:'REPLIT_VIDEO_SCENE_SELECTED',payload:{
      sceneIndex:index,sceneCount:keys.length,sceneTitle:DETAILS[key],
      filePath:'src/components/video/video_scenes/FirstCampaignScenes.tsx',lineNumber:1,
    }},'*')
  },[jumpTo,keys])
  if(!iframe)return <VideoTemplate/>
  const visible=!collapsed||hovering||tapPinned
  const pointerEnter=(e:PointerEvent<HTMLDivElement>)=>{if(e.pointerType==='mouse')setHovering(true)}
  const pointerLeave=(e:PointerEvent<HTMLDivElement>)=>{if(e.pointerType==='mouse')setHovering(false)}
  return <div className="relative h-screen w-full">
    <VideoTemplate key={mountKey} durations={durations} paused={paused} muted={muted} onSceneChange={onSceneChange}/>
    <div ref={sensor} className="absolute bottom-0 left-0 right-0 z-50 flex h-1/4 flex-col justify-end"
      onPointerEnter={pointerEnter} onPointerLeave={pointerLeave}
      onPointerDown={e=>{if(e.pointerType!=='mouse' && collapsed)setTapPinned(true)}}>
      <div className="w-full flex-1"/>
      <div className={`flex items-center gap-3 bg-black/65 px-5 py-4 text-xl backdrop-blur-sm transition-all duration-200 ${visible?'translate-y-0 opacity-100':'pointer-events-none translate-y-full opacity-0'}`} aria-hidden={!visible}>
        <button className="flex size-14 shrink-0 items-center justify-center rounded-lg text-white/75 hover:bg-white/10" aria-label={paused?'Play':'Pause'} onClick={togglePause}>{paused?<Play className="size-8"/>:<Pause className="size-8"/>}</button>
        <button className={`flex size-14 shrink-0 items-center justify-center rounded-lg text-white/75 hover:bg-white/10 ${locked?'bg-white/15':''}`} aria-label="Loop current scene" aria-pressed={locked} onClick={toggleLock}><Repeat className="size-8"/></button>
        <button className="flex size-14 shrink-0 items-center justify-center rounded-lg text-white/75 hover:bg-white/10" aria-label={muted?'Unmute':'Mute'} onClick={()=>setMuted(n=>!n)}>{muted?<VolumeX className="size-8"/>:<Volume2 className="size-8"/>}</button>
        <span className="w-px self-stretch bg-white/20"/>
        <PlaybackStatus keys={keys} activeIndex={activeIndex} activeDuration={activeDuration} activeStartTime={activeStartTime} totalDuration={totalDuration} tick={tick} paused={paused} onJump={onJump}/>
        <button className="flex size-14 shrink-0 items-center justify-center rounded-lg text-white/75 hover:bg-white/10" aria-label={collapsed?'Show controls':'Hide controls'} onClick={()=>{setCollapsed(n=>!n);setHovering(false);setTapPinned(false)}}>{collapsed?<ChevronUp className="size-10"/>:<ChevronDown className="size-10"/>}</button>
      </div>
    </div>
  </div>
}