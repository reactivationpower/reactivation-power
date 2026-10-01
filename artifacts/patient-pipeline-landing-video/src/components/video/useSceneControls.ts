import { useCallback, useMemo, useState } from 'react'

export function useSceneControls(baseDurations: Record<string, number>) {
  const sceneKeys = useMemo(() => Object.keys(baseDurations), [baseDurations])
  const [activeIndex, setActiveIndex] = useState(0)
  const [locked, setLocked] = useState(false)
  const [paused, setPaused] = useState(false)
  const [mountKey, setMountKey] = useState(0)
  const [tick, setTick] = useState(0)
  const durations = useMemo(() => {
    const key = sceneKeys[activeIndex]
    if (locked) return { [`${key}_r1`]: baseDurations[key], [`${key}_r2`]: baseDurations[key] }
    const result: Record<string, number> = {}
    for (let i = 0; i < sceneKeys.length; i++) {
      const key = sceneKeys[(activeIndex + i) % sceneKeys.length]
      result[key] = baseDurations[key]
    }
    return result
  }, [activeIndex, locked, baseDurations, sceneKeys])
  const totalDuration = Object.values(baseDurations).reduce((sum, ms) => sum + ms, 0)
  const activeStartTime = sceneKeys.slice(0, activeIndex).reduce((sum, key) => sum + baseDurations[key], 0)
  const onSceneChange = useCallback((raw: string) => {
    const index = sceneKeys.indexOf(raw.replace(/_r[12]$/, ''))
    if (index >= 0) setActiveIndex(index)
    setTick(value => value + 1)
  }, [sceneKeys])
  const jumpTo = useCallback((index: number) => {
    setActiveIndex(index); setPaused(false); setMountKey(value => value + 1); setTick(value => value + 1)
  }, [])
  const toggleLock = useCallback(() => {
    setLocked(value => !value); setPaused(false); setMountKey(value => value + 1)
  }, [])
  return { sceneKeys, activeIndex, locked, paused, mountKey, tick, durations, activeDuration: baseDurations[sceneKeys[activeIndex]],
    activeStartTime, totalDuration, onSceneChange, jumpTo, toggleLock, togglePause: () => setPaused(value => !value) }
}