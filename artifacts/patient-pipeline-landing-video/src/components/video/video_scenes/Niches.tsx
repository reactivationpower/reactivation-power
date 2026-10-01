import { motion } from 'framer-motion'
import { Scene, Reveal, useBeats, EASE } from '../Motion'
import './Niches.css'

const SERVICES = ['Chiropractic', 'Weight loss', 'Skin tightening', 'Body contouring']

export function Niches() {
  // Source ms: all four examples by 2.1s, connect 5s, resolve 8s.
  const beat = useBeats([450, 900, 1500, 2100, 5000, 8000, 9500])
  const shown = Math.min(beat, 4)
  const connected = beat >= 5
  const resolved = beat >= 6
  return <Scene name="niches" tone="ivory">
    <div className="niches-id"><i />REACTIVATION</div>
    <Reveal className="niches-title"><h1><span>Different services.</span><span>Tailored scripts.</span></h1></Reveal>
    <div className="niches-flow">
      <svg className="niches-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        <motion.line x1="30" y1="50" x2="70" y2="50" stroke="#0b8f89" strokeWidth="0.9" vectorEffect="non-scaling-stroke"
          initial={{ pathLength: 0 }} animate={{ pathLength: connected ? 1 : 0 }} transition={{ duration: 1.2, ease: EASE }} />
      </svg>
      {SERVICES.map((s, i) => <motion.div key={s} className={`niche-chip ${resolved && i === 0 ? 'on' : ''}`}
        style={{ top: `${i * 27}%` }}
        initial={{ opacity: 0, x: -24 }} animate={{ opacity: shown > i ? (connected && i !== 0 && resolved ? .45 : 1) : 0, x: shown > i ? 0 : -24 }}
        transition={{ duration: .6, ease: EASE }}><i />{s}</motion.div>)}
      <motion.div className="niche-node" style={{ left: '50%' }} initial={{ opacity: 0 }} animate={{ opacity: connected ? 1 : 0 }} transition={{ duration: .6 }}>
        <b>The service that patient received</b>decides what the caller sees
      </motion.div>
      <motion.div className="niche-script" initial={{ opacity: 0, x: 30 }} animate={{ opacity: resolved ? 1 : 0, x: resolved ? 0 : 30 }} transition={{ duration: .8, ease: EASE }}>
        <small>REACTIVATION</small>
        <h2>Their caller’s script.</h2>
        <div className="ln" style={{ width: '90%' }} /><div className="ln" style={{ width: '70%' }} />
      </motion.div>
    </div>
    <motion.div className="niches-foot" initial={{ scaleX: 0 }} animate={{ scaleX: beat >= 7 ? 1 : .15 }} transition={{ duration: 1.2, ease: EASE }} />
  </Scene>
}
