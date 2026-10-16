import { useEffect, useRef, useState } from 'react'
export type Field = { label: string; value: string; kind: string }
export type Action = { target: string; at?: number; startMs?: number; clickDelayMs?: number; typingMs?: number; result: string; typing?: boolean }
export type Scene = {
  key: string; title: string; app: string; page: string; narration: string; fields: Field[]; actions: Action[]
  image?: string; screenSequence?: string[]; checkpoint: string; startMs: number; voiceMs: number; durationMs: number
}
export type Lesson = { title: string; number: number; short: string; durationMs: number; audioFile?: string; scenes: Scene[] }
const base = import.meta.env.BASE_URL
const clamp = (n: number) => Math.max(0, Math.min(1, n))
const startAt = (a: Action, s: Scene) => a.startMs ?? (650 + (a.at ?? 0) * s.voiceMs)
const clickAt = (a: Action, s: Scene) => startAt(a, s) + (a.clickDelayMs ?? 1180)
const apps: Record<string, string> = { patient: 'Patient Pipeline', ghl: 'GoHighLevel', zapier: 'Zapier', meta: 'Facebook / Instagram', form: 'Your published form', guide: 'Your browser' }
const navs: Record<string, string[]> = {
  ghl: ['Dashboard', 'Contacts', 'Automation', 'Sites', 'Settings'],
  zapier: ['Zaps', 'App connections', 'Zap History'],
  patient: ['Lead Follow-Up', 'Calls Due Now', 'Leads', 'Campaigns'],
  meta: ['Page', 'Instant Forms', 'Lead Ads Testing Tool'],
  form: [],
  guide: [],
}
function valueFor(field: Field, scene: Scene, time: number) {
  const action = [...scene.actions].reverse().find(a => a.target === field.label && time >= clickAt(a, scene) + 70)
  const dynamic = scene.actions.some(a => a.target === field.label) && ['text', 'private', 'select', 'mapping', 'toggle'].includes(field.kind)
  if (!action) return dynamic ? '' : field.value
  if (!action.typing) return field.value || action.result
  const perCharacter = (action.typingMs ?? action.result.length * 92) / Math.max(1, action.result.length)
  const progress = Math.floor(Math.max(0, time - clickAt(action, scene) - 220) / perCharacter)
  return action.result.slice(0, progress)
}
function FieldRow({ field, scene, time, active }: { field: Field; scene: Scene; time: number; active?: Action }) {
  const focus = active?.target === field.label
  const value = valueFor(field, scene, time)
  const staticKind = ['note', 'legend', 'check', 'waiting', 'preview'].includes(field.kind)
  const done = scene.actions.some(a => a.target === field.label && time > clickAt(a, scene) + 620)
  if (field.kind === 'button') return <div className={`ui-button ${focus ? 'focused' : ''}`} data-target={field.label}>
    {field.label}{done && <span className="button-tick">✓</span>}
  </div>
  if (field.kind === 'price') return <div className="field-row"><label>{field.label}</label><div className="price-options">
    {['Normally X, now Y', 'Just Y', "Don’t mention price"].map(x => <div key={x} data-target={x}
      className={(x === 'Just Y' && time > clickAt(scene.actions[0], scene) + 70) ? 'selected' : ''}>◯ {x}</div>)}
  </div></div>
  return <div className={`field-row ${staticKind ? 'static-field' : ''} ${focus ? 'active-row' : ''}`} data-target={staticKind ? field.label : undefined}>
    <label>{field.kind === 'check' && <i className="empty-check"/>}{field.label}</label>
    <div className={`ui-field ${field.kind} ${focus ? 'focused' : ''}`} data-target={!staticKind ? field.label : undefined}>
      <span className={!value ? 'field-placeholder' : ''}>{value || (field.kind === 'select' || field.kind === 'mapping' ? 'Select…' : field.kind === 'optional' ? 'Optional — leave blank' : 'Click here')}</span>
      {focus && active?.typing && <i className="type-caret"/>}
      {(field.kind === 'select' || field.kind === 'mapping') && <b>⌄</b>}
      {field.kind === 'toggle' && <i className={`toggle ${value ? 'on' : ''}`}/>}
    </div>
    {focus && ['select', 'mapping'].includes(field.kind) && time < clickAt(active!, scene) + 1220 &&
      <div className="select-menu"><small>{field.kind === 'mapping' ? 'Insert data from trigger' : 'Select an option'}</small><div>{field.value}</div></div>}
  </div>
}
function Cursor({ root, scene, time, active }: { root: React.RefObject<HTMLDivElement | null>; scene: Scene; time: number; active?: Action }) {
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null)
  useEffect(() => {
    if (!active || !root.current) { setPoint(null); return }
    const target = [...root.current.querySelectorAll<HTMLElement>('[data-target]')].find(el => el.dataset.target === active.target)
    if (!target) { console.error(`Missing cursor target: ${scene.key}/${active.target}`); setPoint(null); return }
    const rect = target.getBoundingClientRect(), bounds = root.current.getBoundingClientRect()
    setPoint({ x: (rect.left - bounds.left + rect.width * .6) / bounds.width * 100, y: (rect.top - bounds.top + rect.height * .53) / bounds.height * 100 })
  }, [active?.target, scene.key, root])
  if (!point || !active) return null
  const elapsed = (time - startAt(active, scene)) / 1000
  const clickTime = (active.clickDelayMs ?? 1180) / 1000
  if (scene.key === 'campaigns' && elapsed > clickTime + .22) return null
  const travel = 1 - Math.pow(1 - clamp((elapsed - .03) / Math.max(.05, clickTime - .03)), 4)
  const click = clamp((elapsed - clickTime) / .32)
  const scale = 1 - Math.sin(click * Math.PI) * .26
  const pulse = clamp((elapsed - clickTime - .01) / .75)
  return <div className="tutorial-cursor" style={{
    left: `${point.x - 13 * (1 - travel)}%`, top: `${point.y + 12 * (1 - travel)}%`,
    opacity: clamp(elapsed / .2) * (elapsed > 6 ? .4 : 1),
  }}>
    <svg viewBox="0 0 36 42" style={{ transform: `scale(${scale})` }}><path d="M3 2v32l8-7 6 12 6-3-6-12 12-1L3 2Z" fill="#092a3b" stroke="white" strokeWidth="3" strokeLinejoin="round"/></svg>
    <i className="cursor-pulse" style={{ opacity: Math.sin(pulse * Math.PI) * .95, transform: `scale(${.4 + pulse * 2.4})` }}/>
  </div>
}
function Browser({ scene, time, active, connector = 'GoHighLevel' }: { scene: Scene; time: number; active?: Action; connector?: string }) {
  return <div className="browser-tabs">
    <div className={scene.app === 'patient' ? 'current' : ''} data-target="tab-patient">Patient Pipeline</div>
    <div className={!['patient', 'guide', 'form'].includes(scene.app) ? 'current' : ''} data-target="tab-external">{scene.app === 'meta' ? 'Facebook' : connector}</div>
    <div className={scene.app === 'form' ? 'current' : ''}>Published form</div><span data-target="tab-plus">+</span>
    <em>{active?.target === 'tab-plus' && time > clickAt(active, scene) + 120 ? 'New tab' : ''}</em>
  </div>
}
export function TutorialScene({ lesson, scene, time }: { lesson: Lesson; scene: Scene; time: number; paused: boolean }) {
  const root = useRef<HTMLDivElement>(null)
  const index = lesson.scenes.indexOf(scene)
  const active = [...scene.actions].reverse().find(a => time >= startAt(a, scene))
  const isGuide = scene.app === 'guide'
  const isClosing = scene.key === 'finish'
  const light = isGuide && scene.key !== 'intro'
  const focusField = active && scene.fields.find(f => f.label === active.target)
  const showZoom = focusField && ['text', 'private', 'mapping'].includes(focusField.kind) && time > clickAt(active!, scene) + 70 && time < clickAt(active!, scene) + 7820
  const enter = clamp(time / 550)
  let image = scene.image
  if (scene.key === 'campaigns') {
    const step = scene.actions.filter(a => time >= clickAt(a, scene) + 220).length
    image = scene.screenSequence?.[step === 0 ? 0 : step < 3 ? 1 : 2]
  }
  return <section className={`campaign-film ${light ? 'light' : ''}`} data-scene={scene.key}>
    <div className="film-grid"/><div className="film-orbit"/>
    <header className="film-header"><img src={`${base}images/patient-pipeline-logo.png`} alt="Patient Pipeline"/><span className="film-kicker">LESSON {lesson.number} / {lesson.short}</span></header>
    {isGuide ? <div className={`guide-stage ${isClosing ? 'closing' : ''}`} style={{ opacity: .7 + enter * .3, transform: `translateY(${(1 - enter) * 15}px)` }}>
      <span className="guide-eyebrow">{scene.page}</span>
      <h1>{scene.title}</h1>
      <div className="guide-items" ref={root}>
        {scene.key === 'prepare' && <Browser scene={scene} time={time} active={active} connector={lesson.number === 3 ? 'Zapier' : 'GoHighLevel'}/>}
        {scene.fields.map((field, i) => <div key={field.label} data-target={field.label} className={`guide-item ${active?.target === field.label ? 'active' : ''}`} style={{ opacity: time > 800 + i * 1500 ? 1 : .25 }}>
          <span>{isClosing ? <i className="empty-check"/> : String(i + 1).padStart(2, '0')}</span><div><small>{field.label}</small><strong>{field.value}</strong></div>
        </div>)}
        <Cursor root={root} scene={scene} time={time} active={active}/>
      </div>
      <p className="guide-disclosure">{scene.checkpoint}</p>
    </div> : <>
      <div className="screen-heading"><span className="step-number">{String(index + 1).padStart(2, '0')}</span><h1>{scene.title}</h1></div>
      <div ref={root} className={`screen-shell provider-${scene.app}`} style={{ opacity: .8 + enter * .2, transform: `scale(${1.008 - enter * .008})` }}>
        <Browser scene={scene} time={time} active={active} connector={lesson.number === 3 ? 'Zapier' : 'GoHighLevel'}/>
        <div className="disclosure">{scene.app === 'patient' && image ? 'PATIENT PIPELINE DEMO • ILLUSTRATED EXAMPLE ENTRIES' : 'INSTRUCTIONAL UI RECREATION • NOT A LIVE ACCOUNT RECORDING'}</div>
        {scene.key === 'campaigns' ? <div className="navigation-capture"><div className="capture-surface">
          <img src={`${base}images/${image}`} alt="Original Patient Pipeline demo screen"/>
          <div data-target="lead-followup" style={{ left: '49%', top: '73%', width: '18%', height: '10%' }}/>
          <div data-target="campaigns" style={{ left: '55%', top: '7%', width: '10%', height: '8%' }}/>
          <div data-target="new-campaign" style={{ left: '84%', top: '18%', width: '14%', height: '8%' }}/>
        </div></div> : <div className="workspace">
          {image ? <img className="original-screen" src={`${base}images/${image}`} alt="Original Patient Pipeline demo context"/> : <aside className="app-sidebar">
            <strong>{apps[scene.app]}</strong><small>{scene.app === 'ghl' || scene.app === 'meta' ? 'Example Practice' : 'Connection workspace'}</small>
            {(navs[scene.app] ?? []).map(n => <div key={n} data-target={`nav-${n}`} className={active?.target === `nav-${n}` ? 'nav-active' : ''}>{n}</div>)}
          </aside>}
          <main className={`settings-panel ${image ? 'on-capture' : ''} fields-${scene.fields.length}`}>
            <div className="panel-breadcrumb">{apps[scene.app]} <span> / </span> {scene.app === 'patient' ? 'Back Pain Relief — $49 New Patient Special' : 'Example setup'}</div>
            <h2>{scene.page}</h2>
            <div className="settings-fields">{scene.fields.map(field => <FieldRow key={field.label} field={field} scene={scene} time={time} active={active}/>)}</div>
          </main>
        </div>}
        {showZoom && <div className="detail-zoom">
          <small>{focusField.kind === 'private' ? 'PASTE YOUR OWN ADDRESS' : 'FIELD CLOSE-UP'}</small><strong>{focusField.label}</strong>
          <div>{valueFor(focusField, scene, time)}{active?.typing && <i className="type-caret"/>}</div>
          <span>{focusField.kind === 'mapping' ? 'Choose the answer from the trigger.' : focusField.kind === 'private' ? 'Private value hidden in this lesson.' : 'Example entry shown as it is typed.'}</span>
        </div>}
        <Cursor root={root} scene={scene} time={time} active={active}/>
      </div>
      <div className="checkpoint"><span>PAUSE & CHECK</span><p>{scene.checkpoint}</p></div>
    </>}
    <footer className="film-footer"><span>PATIENT PIPELINE / CONNECTION GUIDE</span><i/><span>www.PatientPipeline.app</span><b>{index + 1} / {lesson.scenes.length}</b></footer>
    <div className="chapter-progress" style={{ width: `${clamp(time / scene.durationMs) * 100}%` }}/>
  </section>
}