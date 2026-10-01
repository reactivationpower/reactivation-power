import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import { ChevronDown, ChevronUp, Pause, Play, Repeat, Volume2, VolumeX } from 'lucide-react'
import VideoTemplate, { SCENE_DURATIONS } from './VideoTemplate'
import { useSceneControls } from './useSceneControls'
import { SCENE_DETAILS } from './filmMeta'

function time(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
function Status({ keys, index, duration, start, total, tick, paused, onJump }: {
  keys: string[]; index: number; duration: number; start: number; total: number; tick: number; paused: boolean; onJump: (index: number) => void
}) {
  const [elapsed, setElapsed] = useState(0)
  const base = useRef(0)
  useEffect(() => { setElapsed(0); base.current = 0 }, [tick])
  useEffect(() => {
    if (paused) return
    const began = performance.now()
    const id = window.setInterval(() => setElapsed(base.current + performance.now() - began), 60)
    return () => { window.clearInterval(id); base.current += performance.now() - began }
  }, [tick, paused])
  return <>
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1 }}>{keys.map((key, i) => <button key={key} title={SCENE_DETAILS[key].title}
      aria-label={`Jump to scene ${i + 1}: ${SCENE_DETAILS[key].title}`} aria-current={i === index ? 'true' : undefined} onClick={() => onJump(i)}
      style={{ flex: 1, height: 14, border: 0, borderRadius: 20, background: '#ffffff40', padding: 0, overflow: 'hidden', cursor: 'pointer' }}>
      <span style={{ display: 'block', height: '100%', width: i === index ? `${Math.min(100, elapsed / duration * 100)}%` : '0%', background: '#a3e6d9' }} />
    </button>)}</div>
    <span style={{ minWidth: 36 }}>{index + 1}/{keys.length}</span>
    <span role="timer" style={{ minWidth: 100, textAlign: 'right' }}>{time(start + Math.min(elapsed, duration))} / {time(total)}</span>
  </>
}

export default function VideoWithControls() {
  const isIframed = typeof window !== 'undefined' && window.self !== window.top
  const { sceneKeys, activeIndex, locked, paused, mountKey, tick, durations, activeDuration, activeStartTime, totalDuration,
    onSceneChange, jumpTo, toggleLock, togglePause } = useSceneControls(SCENE_DURATIONS)
  const [muted, setMuted] = useState(false)
  const [collapsed, setCollapsed] = useState(true)
  const [hovering, setHovering] = useState(false)
  const [tapPinned, setTapPinned] = useState(false)
  const sensor = useRef<HTMLDivElement>(null)
  const handleJump = useCallback((index: number) => {
    jumpTo(index)
    const detail = SCENE_DETAILS[sceneKeys[index]]
    window.parent.postMessage({ type: 'REPLIT_VIDEO_SCENE_SELECTED', payload: {
      sceneIndex: index, sceneCount: sceneKeys.length, sceneTitle: detail.title, filePath: detail.filePath, lineNumber: 1,
    } }, '*')
  }, [jumpTo, sceneKeys])
  useEffect(() => {
    if (!paused) return
    const animations = document.getAnimations().filter(animation => animation.playState === 'running')
    animations.forEach(animation => animation.pause())
    return () => animations.forEach(animation => animation.play())
  }, [paused])
  useEffect(() => {
    if (!(collapsed && tapPinned)) return
    const onDown = (event: globalThis.PointerEvent) => {
      if (event.pointerType !== 'mouse' && sensor.current && !sensor.current.contains(event.target as Node)) setTapPinned(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [collapsed, tapPinned])
  if (!isIframed) return <VideoTemplate />
  const button: React.CSSProperties = { border: 0, background: 'transparent', color: 'white', width: 42, height: 44,
    display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0 }
  const visible = !collapsed || hovering || tapPinned
  return <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
    <VideoTemplate key={mountKey} durations={durations} paused={paused} muted={muted} onSceneChange={onSceneChange} />
    {!visible && <div aria-hidden="true" style={{ position: 'absolute', right: 12, bottom: 10, zIndex: 45, padding: '5px 10px',
      borderRadius: 20, font: '500 12px var(--font-body)', color: '#fff', background: '#183c53cc' }}>Controls ↑</div>}
    <div ref={sensor} onPointerEnter={(event: PointerEvent) => { if (event.pointerType === 'mouse') setHovering(true) }}
      onPointerLeave={(event: PointerEvent) => { if (event.pointerType === 'mouse') setHovering(false) }}
      onPointerDown={(event: PointerEvent) => { if (event.pointerType !== 'mouse' && collapsed) setTapPinned(true) }}
      style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '25%', zIndex: 50, display: 'flex', flexDirection: 'column',
        justifyContent: 'end', overflow: 'hidden' }}>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', font: '500 15px var(--font-body)', color: 'white',
        background: 'rgba(5,22,37,.8)', backdropFilter: 'blur(10px)', opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(100%)', pointerEvents: visible ? 'auto' : 'none',
        transition: 'transform .2s,opacity .2s' }}>
        <button style={button} aria-label={paused ? 'Play' : 'Pause'} onClick={togglePause}>{paused ? <Play /> : <Pause />}</button>
        <button style={button} aria-label={locked ? 'Loop current scene: on' : 'Loop current scene: off'} aria-pressed={locked} onClick={toggleLock}><Repeat /></button>
        <button style={button} aria-label={muted ? 'Unmute' : 'Mute'} onClick={() => setMuted(value => !value)}>{muted ? <VolumeX /> : <Volume2 />}</button>
        <div style={{ width: 1, height: 28, background: '#ffffff40' }} />
        <Status keys={sceneKeys} index={activeIndex} duration={activeDuration} start={activeStartTime} total={totalDuration}
          tick={tick} paused={paused} onJump={handleJump} />
        <button style={button} aria-label={collapsed ? 'Show controls' : 'Hide controls'} aria-expanded={!collapsed}
          onClick={() => { setCollapsed(value => !value); setHovering(false); setTapPinned(false) }}>{collapsed ? <ChevronUp /> : <ChevronDown />}</button>
      </div>
    </div>
  </div>
}