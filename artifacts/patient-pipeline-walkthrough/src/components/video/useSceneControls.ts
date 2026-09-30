import { useCallback, useMemo, useState } from 'react'

export function useSceneControls(baseDurations: Record<string,number>) {
  const sceneKeys=useMemo(() => Object.keys(baseDurations),[baseDurations])
  const [activeIndex,setActiveIndex]=useState(0)
  const [locked,setLocked]=useState(false)
  const [paused,setPaused]=useState(false)
  const [mountKey,setMountKey]=useState(0)
  const [tick,setTick]=useState(0)
  const durations=useMemo(() => {
    const key=sceneKeys[activeIndex]
    if (locked) return { [`${key}_r1`]:baseDurations[key], [`${key}_r2`]:baseDurations[key] }
    const out:Record<string,number>={}
    for (let i=0;i<sceneKeys.length;i++) { const k=sceneKeys[(activeIndex+i)%sceneKeys.length];out[k]=baseDurations[k] }
    return out
  },[activeIndex,locked,baseDurations,sceneKeys])
  const totalDuration=useMemo(() => Object.values(baseDurations).reduce((a,b)=>a+b,0),[baseDurations])
  const activeStartTime=sceneKeys.slice(0,activeIndex).reduce((n,k)=>n+baseDurations[k],0)
  const onSceneChange=useCallback((raw:string) => {
    const index=sceneKeys.indexOf(raw.replace(/_r[12]$/,''))
    if (index>=0) setActiveIndex(index)
    setTick(t=>t+1)
  },[sceneKeys])
  const jumpTo=useCallback((index:number)=>{setActiveIndex(index);setPaused(false);setMountKey(k=>k+1);setTick(t=>t+1)},[])
  const toggleLock=useCallback(()=>{setLocked(v=>!v);setPaused(false);setMountKey(k=>k+1);setTick(t=>t+1)},[])
  return {sceneKeys,activeIndex,locked,paused,mountKey,tick,durations,activeDuration:baseDurations[sceneKeys[activeIndex]],activeStartTime,totalDuration,onSceneChange,jumpTo,toggleLock,togglePause:()=>setPaused(v=>!v)}
}