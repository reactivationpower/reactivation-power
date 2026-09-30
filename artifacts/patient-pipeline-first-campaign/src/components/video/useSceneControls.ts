import { useCallback, useMemo, useState } from 'react'

export function useSceneControls(baseDurations:Record<string,number>) {
  const keys=useMemo(()=>Object.keys(baseDurations),[baseDurations])
  const [activeIndex,setActiveIndex]=useState(0)
  const [locked,setLocked]=useState(false)
  const [paused,setPaused]=useState(false)
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
  const jumpTo=useCallback((index:number)=>{setActiveIndex(index);setPaused(false);setMountKey(n=>n+1);setTick(n=>n+1)},[])
  const toggleLock=useCallback(()=>{setLocked(n=>!n);setPaused(false);setMountKey(n=>n+1);setTick(n=>n+1)},[])
  const togglePause=useCallback(()=>setPaused(n=>!n),[])
  return {
    keys,activeIndex,locked,paused,mountKey,tick,durations,onSceneChange,jumpTo,toggleLock,togglePause,
    activeDuration:baseDurations[keys[activeIndex]],activeStartTime:keys.slice(0,activeIndex).reduce((t,k)=>t+baseDurations[k],0),
    totalDuration:Object.values(baseDurations).reduce((t,d)=>t+d,0),
  }
}