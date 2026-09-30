import { motion } from 'framer-motion'
import '../Film.css'

export function Opportunities() {
  return <motion.section className="film dark" initial={{ opacity: 1 }} exit={{ opacity: 0, scale: 1.2 }} transition={{ duration: .55 }}>
    <div className="grain" /><motion.div className="s1-number" initial={{ scale: .3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 350, damping: 28 }}>2</motion.div>
    <div className="s1-content">
      <motion.div className="s1-block" initial={{ opacity: 0, y: 70 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .2, duration: .45 }}>
        <div className="eyebrow accent">01 / Reconnect</div><strong>PAST<br />PATIENTS</strong><p className="film-text muted">The people who know you.</p>
      </motion.div>
      <motion.div className="s1-block" initial={{ opacity: 0, scale: .75, rotateY: -20 }} animate={{ opacity: 1, scale: 1, rotateY: 0 }} transition={{ delay: 1.1, duration: .55 }}>
        <div className="eyebrow accent">02 / Respond</div><strong>NEW<br />INQUIRIES</strong><p className="film-text muted">The people who just reached out.</p>
      </motion.div>
    </div>
    <motion.div className="s1-note" initial={{ opacity: 0, clipPath: 'inset(0 100% 0 0)' }} animate={{ opacity: 1, clipPath: 'inset(0 0% 0 0)' }} transition={{ delay: 2.3, duration: .7 }}>Two conversations. One team.</motion.div>
    <motion.div className="rule" style={{ position:'absolute', left:'6%', bottom:'5%', width:'88%' }} initial={{ scaleX:0 }} animate={{ scaleX:1 }} transition={{ delay:3.7, duration:1.1 }} />
  </motion.section>
}