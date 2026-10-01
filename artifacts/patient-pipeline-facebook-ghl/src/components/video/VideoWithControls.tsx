import { useCallback, useMemo, useState } from 'react'
import VideoTemplate, { LESSON, SCENE_DURATIONS } from './VideoTemplate'

export default function VideoWithControls() {
  const [start, setStart] = useState(0)
  const [active, setActive] = useState(0)
  const [mountKey, setMountKey] = useState(0)
  const [paused, setPaused] = useState(false)
  const [muted, setMuted] = useState(false)
  const [locked, setLocked] = useState(false)
  const [visible, setVisible] = useState(false)
  const durations = useMemo(() => {
    const scenes = LESSON.scenes
    if (locked) return { [`${scenes[start].key}_r1`]: scenes[start].durationMs, [`${scenes[start].key}_r2`]: scenes[start].durationMs }
    return Object.fromEntries([...scenes.slice(start), ...scenes.slice(0, start)].map(s => [s.key, SCENE_DURATIONS[s.key]]))
  }, [start, locked])
  const onSceneChange = useCallback((key: string) => setActive(LESSON.scenes.findIndex(s => s.key === key.replace(/_r[12]$/, ''))), [])
  const jump = (i: number) => {
    setStart(i); setActive(i); setPaused(false); setMountKey(n => n + 1)
    window.parent.postMessage({ type: 'REPLIT_VIDEO_SCENE_SELECTED', payload: {
      sceneIndex: i, sceneCount: LESSON.scenes.length, sceneTitle: LESSON.scenes[i].title,
      filePath: 'src/components/video/video_scenes/TutorialScene.tsx', lineNumber: 1,
    } }, '*')
  }
  if (window.self === window.top || new URLSearchParams(window.location.search).has('frame')) return <VideoTemplate/>
  return <div style={{ height: '100vh', position: 'relative' }} onMouseMove={() => setVisible(true)} onMouseLeave={() => setVisible(false)}>
    <VideoTemplate key={mountKey} durations={durations} paused={paused} muted={muted} onSceneChange={onSceneChange}/>
    <div onTouchStart={() => setVisible(v => !v)} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 24, zIndex: 99 }}/>
    <div style={{ position: 'absolute', zIndex: 100, bottom: 12, left: '5%', right: '5%', padding: 12, background: '#061b27f2', color: '#fff', borderRadius: 8, opacity: visible ? 1 : 0, pointerEvents: visible ? 'auto' : 'none', display: 'flex', alignItems: 'center', gap: 12, font: '13px DM Sans' }}>
      <button onClick={() => setPaused(p => !p)} aria-label={paused ? 'Play' : 'Pause'}>{paused ? 'Play' : 'Pause'}</button>
      <button onClick={() => setMuted(m => !m)} aria-label={muted ? 'Unmute' : 'Mute'}>{muted ? 'Unmute' : 'Mute'}</button>
      <select aria-label="Jump to chapter" value={active} onChange={e => jump(Number(e.target.value))} style={{ flex: 1, background: '#143847', padding: 8 }}>
        {LESSON.scenes.map((s, i) => <option key={s.key} value={i}>{i + 1}. {s.title}</option>)}
      </select>
      <button onClick={() => { setStart(active); setLocked(l => !l); setPaused(false); setMountKey(k => k + 1) }}>{locked ? 'Unlock chapter' : 'Loop chapter'}</button>
      <span>{active + 1} / {LESSON.scenes.length}</span>
    </div>
  </div>
}