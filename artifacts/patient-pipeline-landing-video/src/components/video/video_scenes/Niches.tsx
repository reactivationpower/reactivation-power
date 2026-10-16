import { motion } from 'framer-motion'
import { Scene, Reveal, useBeats, EASE } from '../Motion'
import './Niches.css'

// Full CHIRO_DEMO family, using the public service catalog's display names.
const SERVICES = [
  'Chiropractic', 'Spinal Decompression',
  'Joint Pain', 'Neuropathy',
  'Acupuncture', 'Massage Therapy',
  'SoftWave/shock wave', 'Red Light Body Contouring',
  'Gut Health', 'ChiroThin',
  'In-Office Weight Loss Programs', 'GLP-1 Patients',
]

export function Niches() {
  // Reveal six pairs by 2.1 source seconds; keep the approved narration timing.
  const beat = useBeats([300, 650, 1000, 1350, 1700, 2100, 5000, 8000, 9500])
  const shown = Math.min(beat * 2, SERVICES.length)
  const connected = beat >= 7
  const resolved = beat >= 8
  return <Scene name="niches" tone="ivory">
    <div className="niches-id"><i />REACTIVATION</div>
    <Reveal className="niches-title"><h1><span>Different services.</span><span>Tailored scripts.</span></h1></Reveal>
    <div className="niches-family">Chiropractic &amp; wellness services</div>
    <div className="niches-flow">
      <svg className="niches-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        <motion.path d="M64 50 H68 Q70 50 70 48 V24 Q70 22 72 22 H85" fill="none" stroke="#0b8f89" strokeWidth="1.2" vectorEffect="non-scaling-stroke"
          initial={{ pathLength: 0 }} animate={{ pathLength: connected ? 1 : 0 }} transition={{ duration: 1.2, ease: EASE }} />
        <motion.path d="M85 40 V56" fill="none" stroke="#0b8f89" strokeWidth="1.2" vectorEffect="non-scaling-stroke"
          initial={{ pathLength: 0 }} animate={{ pathLength: resolved ? 1 : 0 }} transition={{ duration: .7, ease: EASE }} />
      </svg>
      <div className="niches-grid">{SERVICES.map((s, i) => <motion.div key={s} className={`niche-chip ${resolved && i === 0 ? 'on' : ''}`}
        initial={{ opacity: 0, x: -24 }} animate={{ opacity: shown > i ? 1 : 0, x: shown > i ? 0 : -24 }}
        transition={{ duration: .6, ease: EASE }}><i />{s}</motion.div>)}
      </div>
      <motion.div className="niche-node" initial={{ opacity: 0 }} animate={{ opacity: connected ? 1 : 0 }} transition={{ duration: .6 }}>
        <b>The service that patient received</b>decides what the caller sees
      </motion.div>
      <motion.div className="niche-script" initial={{ opacity: 0, x: 30, y: '-50%' }} animate={{ opacity: resolved ? 1 : 0, x: resolved ? 0 : 30, y: '-50%' }} transition={{ duration: .8, ease: EASE }}>
        <small>REACTIVATION</small>
        <h2>Their caller’s script.</h2>
        <div className="ln" style={{ width: '90%' }} /><div className="ln" style={{ width: '70%' }} />
      </motion.div>
    </div>
    <motion.div className="niches-foot" initial={{ scaleX: 0 }} animate={{ scaleX: beat >= 9 ? 1 : .15 }} transition={{ duration: 1.2, ease: EASE }} />
  </Scene>
}
