import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import { ChevronDown, ChevronUp, Pause, Play, Repeat, Volume2, VolumeX } from 'lucide-react'
import VideoTemplate, { SCENE_DURATIONS } from './VideoTemplate'
import { useSceneControls } from './useSceneControls'

const DETAILS:Record<string,{title:string,filePath:string}> = {
  opportunities:{title:'Two opportunities',filePath:'src/components/video/video_scenes/Opportunities.tsx'},
  reactivation:{title:'Reactivation',filePath:'src/components/video/video_scenes/Reactivation.tsx'},
  leads:{title:'Lead Follow-Up',filePath:'src/components/video/video_scenes/LeadFollowUp.tsx'},
  tools:{title:'Two tools',filePath:'src/components/video/video_scenes/TwoTools.tsx'},
  offer:{title:'Launch offer',filePath:'src/components/video/video_scenes/Offer.tsx'},
}
function time(ms:number) { const s=Math.max(0,Math.floor(ms/1000));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}` }
function Status({keys,index,duration,start,total,tick,paused,onJump}:{keys:string[],index:number,duration:number,start:number,total:number,tick:number,paused:boolean,onJump:(i:number)=>void}) {
  const [elapsed,setElapsed]=useState(0)
  const base=useRef(0)
  useEffect(()=>{setElapsed(0);base.current=0},[tick])
  useEffect(()=> {
    if (paused) return
    const began=performance.now()
    const id=window.setInterval(()=>setElapsed(base.current+performance.now()-began),60)
    return ()=>{window.clearInterval(id);base.current+=performance.now()-began}
  },[tick,paused])
  return <>
    <div style={{display:'flex',alignItems:'center',gap:5,flex:1}}>{keys.map((k,i)=><button key={k} title={DETAILS[k].title} aria-label={`Jump to scene ${i+1}: ${DETAILS[k].title}`} aria-current={i===index?'true':undefined} onClick={()=>onJump(i)} style={{flex:1,height:14,border:0,borderRadius:20,background:'#ffffff40',padding:0,overflow:'hidden',cursor:'pointer'}}><span style={{display:'block',height:'100%',width:i===index?`${Math.min(100,elapsed/duration*100)}%`:'0%',background:'#e3f7f8'}} /></button>)}</div>
    <span style={{minWidth:40,textAlign:'center'}}>{index+1}/{keys.length}</span><span role="timer" style={{minWidth:100,textAlign:'right'}}>{time(start+Math.min(elapsed,duration))} / {time(total)}</span>
  </>
}
export default function VideoWithControls() {
  const isIframed=typeof window!=='undefined' && window.self!==window.top
  const {sceneKeys,activeIndex,locked,paused,mountKey,tick,durations,activeDuration,activeStartTime,totalDuration,onSceneChange,jumpTo,toggleLock,togglePause}=useSceneControls(SCENE_DURATIONS)
  const [muted,setMuted]=useState(false)
  const [collapsed,setCollapsed]=useState(false)
  const [hovering,setHovering]=useState(false)
  const [tapPinned,setTapPinned]=useState(false)
  const sensor=useRef<HTMLDivElement>(null)
  const handleJump=useCallback((i:number)=>{
    jumpTo(i)
    const d=DETAILS[sceneKeys[i]]
    window.parent.postMessage({type:'REPLIT_VIDEO_SCENE_SELECTED',payload:{sceneIndex:i,sceneCount:sceneKeys.length,sceneTitle:d.title,filePath:d.filePath,lineNumber:1}},'*')
  },[jumpTo,sceneKeys])
  useEffect(()=>{
    if (!paused) return
    const list=document.getAnimations().filter(a=>a.playState==='running')
    list.forEach(a=>a.pause())
    return ()=>list.forEach(a=>a.play())
  },[paused])
  useEffect(()=>{
    if (!(collapsed&&tapPinned)) return
    const onDown=(e:globalThis.PointerEvent)=>{if(e.pointerType!=='mouse'&&sensor.current&&!sensor.current.contains(e.target as Node)) setTapPinned(false)}
    document.addEventListener('pointerdown',onDown)
    return ()=>document.removeEventListener('pointerdown',onDown)
  },[collapsed,tapPinned])
  if (!isIframed) return <VideoTemplate />
  const button:React.CSSProperties={border:0,background:'transparent',color:'white',width:48,height:48,display:'grid',placeItems:'center',cursor:'pointer',flexShrink:0}
  const visible=!collapsed||hovering||tapPinned
  return <div style={{position:'relative',width:'100%',height:'100vh'}}>
    <VideoTemplate key={mountKey} durations={durations} paused={paused} muted={muted} onSceneChange={onSceneChange} />
    <div ref={sensor} onPointerEnter={(e:PointerEvent)=>{if(e.pointerType==='mouse')setHovering(true)}} onPointerLeave={(e:PointerEvent)=>{if(e.pointerType==='mouse')setHovering(false)}} onPointerDown={(e:PointerEvent)=>{if(e.pointerType!=='mouse'&&collapsed)setTapPinned(true)}} style={{position:'absolute',bottom:0,left:0,right:0,height:'25%',zIndex:50,display:'flex',flexDirection:'column',justifyContent:'end'}}>
      <div style={{flex:1}} />
      <div style={{display:'flex',alignItems:'center',gap:12,padding:'12px 18px',font:'500 16px var(--font-body)',color:'white',background:'rgba(5,22,37,.78)',backdropFilter:'blur(10px)',opacity:visible?1:0,transform:visible?'translateY(0)':'translateY(100%)',pointerEvents:visible?'auto':'none',transition:'transform .2s,opacity .2s'}}>
        <button style={button} aria-label={paused?'Play':'Pause'} onClick={togglePause}>{paused?<Play />:<Pause />}</button>
        <button style={button} aria-label={locked?'Loop current scene: on':'Loop current scene: off'} aria-pressed={locked} onClick={toggleLock}><Repeat /></button>
        <button style={button} aria-label={muted?'Unmute':'Mute'} onClick={()=>setMuted(v=>!v)}>{muted?<VolumeX />:<Volume2 />}</button>
        <div style={{width:1,height:28,background:'#ffffff40'}} />
        <Status keys={sceneKeys} index={activeIndex} duration={activeDuration} start={activeStartTime} total={totalDuration} tick={tick} paused={paused} onJump={handleJump} />
        <button style={button} aria-label={collapsed?'Show controls':'Hide controls'} aria-expanded={!collapsed} onClick={()=>{setCollapsed(v=>!v);setHovering(false);setTapPinned(false)}}>{collapsed?<ChevronUp />:<ChevronDown />}</button>
      </div>
    </div>
  </div>
}