import { motion } from 'framer-motion'
import '../Film.css'

export function Offer() {
  return <motion.section className="film light" initial={{ clipPath:'inset(50% 0 50% 0)' }} animate={{ clipPath:'inset(0% 0 0% 0)' }} exit={{ opacity:0 }} transition={{ duration:.75 }}>
    <div className="safe s5">
      <motion.img className="s5-logo" src={`${import.meta.env.BASE_URL}images/patient-pipeline-logo.png`} alt="Patient Pipeline" initial={{ opacity:0, scale:.7 }} animate={{ opacity:1, scale:1 }} transition={{ delay:4.4, duration:.7 }} />
      <motion.div className="s5-frame" initial={{ scaleX:.07, opacity:.25 }} animate={{ scaleX:1, opacity:1 }} transition={{ duration:1.1 }}>
        <motion.div className="s5-title" initial={{ opacity:0, y:22 }} animate={{ opacity:1, y:0 }} transition={{ delay:.5 }}>TWO PRODUCTS.</motion.div>
        <motion.div className="s5-title" style={{ color:'#358598' }} initial={{ opacity:0, y:22 }} animate={{ opacity:1, y:0 }} transition={{ delay:1.65 }}>ONE LAUNCH PRICE.</motion.div>
        <motion.div className="film-text" style={{ marginTop:'2vmin' }} initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:3.1 }}>Reactivation + Lead Follow-Up</motion.div>
      </motion.div>
      <motion.div className="s5-cta" initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay:6.2 }}>Schedule a Call</motion.div>
    </div>
  </motion.section>
}