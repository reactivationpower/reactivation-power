import { motion } from 'framer-motion'
import '../Film.css'

export function Reactivation() {
  return <motion.section className="film dark" initial={{ clipPath:'circle(0% at 23% 50%)' }} animate={{ clipPath:'circle(130% at 23% 50%)' }} exit={{ opacity:0, scale:1.08 }} transition={{ duration:.65 }}>
    <div className="grain" />
    <div className="safe s2-layout">
      <div>
        <motion.div className="eyebrow accent" initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:.12 }}>01 / REACTIVATION</motion.div>
        <motion.p className="film-text muted" initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ delay:.8 }}>A past patient says…</motion.p>
        <motion.h1 className="s2-quote" initial={{ scale:1.5, opacity:0, filter:'blur(14px)' }} animate={{ scale:1, opacity:1, filter:'blur(0px)' }} transition={{ delay:1.9, duration:.7 }}>“I’m feeling<br /><span className="accent">fine.</span>”</motion.h1>
        <motion.p className="film-text" initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:5.1 }}>The conversation adapts.</motion.p>
      </div>
      <motion.div className="record s2-record" initial={{ opacity:0, scale:.83, rotate:6 }} animate={{ opacity:1, scale:1, rotate:0 }} transition={{ duration:.8 }}>
        <div className="record-head"><span><i className="dot" /> Reactivation</span><span>Past patient</span></div>
        <div className="s2-body">
          <div className="prompt">A guided conversation</div>
          <div className="reply">How have you been feeling?</div>
          <motion.div className="chip" style={{ justifySelf:'start' }} initial={{ scale:.7, opacity:0 }} animate={{ scale:1, opacity:1 }} transition={{ delay:2.2 }}>“I’m feeling fine”</motion.div>
          <motion.div className="s2-branch" initial={{ opacity:0, x:-20 }} animate={{ opacity:1, x:0 }} transition={{ delay:3.65 }}>Listen first. Then offer a thoughtful check-in.</motion.div>
          <motion.div className="chip" style={{ justifySelf:'end', background:'#edf3ee', color:'#2d6958' }} initial={{ opacity:0, y:20 }} animate={{ opacity:1, y:0 }} transition={{ delay:6.45 }}>A thoughtful check-in</motion.div>
        </div>
      </motion.div>
    </div>
    <motion.div className="rule" style={{ position:'absolute', right:0, bottom:'4%', width:'52%' }} initial={{ scaleX:0 }} animate={{ scaleX:1 }} transition={{ delay:7.6, duration:1.1 }} />
  </motion.section>
}