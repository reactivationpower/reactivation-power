import { motion } from 'framer-motion'
import '../Film.css'

export function LeadFollowUp() {
  return <motion.section className="film deep" initial={{ clipPath:'circle(0% at 25% 50%)' }} animate={{ clipPath:'circle(130% at 25% 50%)' }} exit={{ opacity:0, rotateY:8 }} transition={{ duration:.75 }}>
    <div className="s3-orbit" />
    <div className="s3-layout">
      <motion.div className="record s3-card" initial={{ scale:.55, rotate:-17, opacity:0 }} animate={{ scale:1, rotate:-3, opacity:1 }} transition={{ duration:.8 }}>
        <div className="record-head"><span><i className="dot" /> New inquiry</span><span>Campaign</span></div>
        <div className="body">
          <span className="eyebrow" style={{ color:'#537887' }}>Campaign source</span>
          <strong style={{ font:'700 4.5vmin/1.05 var(--font-display)', letterSpacing:'-.04em' }}>Introductory consultation</strong>
          <motion.span className="chip" style={{ justifySelf:'start' }} initial={{ scale:.7, opacity:0 }} animate={{ scale:1, opacity:1 }} transition={{ delay:2.6 }}>Offer context on the call</motion.span>
        </div>
      </motion.div>
      <div>
        <motion.div className="eyebrow accent" initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:.15 }}>02 / LEAD FOLLOW-UP</motion.div>
        <motion.h1 className="film-title" style={{ margin:'3vmin 0' }} initial={{ opacity:0, y:35 }} animate={{ opacity:1, y:0 }} transition={{ delay:1 }}>Start where<br />the ad left off.</motion.h1>
        <motion.p className="film-text" initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:4.3 }}>The first call matches the offer they saw.</motion.p>
        <motion.div className="s3-rail" initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:5.2 }}><div className="rail-step on" /><div className="rail-bar" /><motion.div className="rail-step" animate={{ backgroundColor:'#80d6db', borderColor:'#80d6db' }} transition={{ delay:6.6 }} /><div className="rail-bar" /><div className="rail-step" /></motion.div>
        <motion.p className="film-text accent" style={{ marginTop:'3vmin' }} initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:6.4 }}>Next call scheduled automatically.</motion.p>
      </div>
    </div>
  </motion.section>
}