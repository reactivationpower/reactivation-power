import { useCallback, useMemo, useState } from 'react'
import { useEmbeddedStartHold } from '@/lib/video'

export function useSceneControls(baseDurations:Record<string,number>) {
  const keys=useMemo(()=>Object.keys(baseDurations),[baseDurations])
  const [activeIndex,setActiveIndex]=useState(0)
  const [locked,setLocked]=useState(false)
  // Embedded previews load paused and silent until the first Play.
  const {held,release}=useEmbeddedStartHold()
  const [paused,setPaused]=useState(held)
  const [mountKey,setMountKey]=useState(0)
  const [tick,setTick]=useState(0)
  const durations=useMemo(()=>{
    if(locked) return {[`${keys[activeIndex]}_r1`]:baseDurations[keys[activeIndex]],[`${keys[activeIndex]}_r2`]:baseDurations[keys[activeIndex]]}
    const result:Record<string,number>={}
    for(let i=0;i<keys.length;i++){const key=keys[(activeIndex+i)%keys.length];result[key]=baseDurations[key]}
    return result
  },[keys,activeIndex,locked,baseDurations])
  const onSceneChange=useCallback((rawKey:string)=>{
    const index=keys.indexOf(rawKey.replace(/_r[12]$/,''))
    if(index>=0) setActiveIndex(index)
    setTick(n=>n+1)
  },[keys])
  const jumpTo=useCallback((index:number)=>{release();setActiveIndex(index);setPaused(false);setMountKey(n=>n+1);setTick(n=>n+1)},[release])
  const toggleLock=useCallback(()=>{release();setLocked(n=>!n);setPaused(false);setMountKey(n=>n+1);setTick(n=>n+1)},[release])
  // The first Play remounts the held player so the scene, animations and narration start from the first frame.
  const togglePause=useCallback(()=>{
    if(held){release();setPaused(false);setMountKey(n=>n+1);setTick(n=>n+1);return}
    setPaused(n=>!n)
  },[held,release])
  return {
    keys,activeIndex,locked,paused,mountKey,tick,durations,onSceneChange,jumpTo,toggleLock,togglePause,
    activeDuration:baseDurations[keys[activeIndex]],activeStartTime:keys.slice(0,activeIndex).reduce((t,k)=>t+baseDurations[k],0),
    totalDuration:Object.values(baseDurations).reduce((t,d)=>t+d,0),
  }
}