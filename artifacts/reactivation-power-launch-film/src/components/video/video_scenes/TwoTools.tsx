import { motion } from 'framer-motion'
import '../Film.css'

export function TwoTools() {
  return <motion.section className="film dark" initial={{ opacity:0, scale:1.08 }} animate={{ opacity:1, scale:1 }} exit={{ opacity:0, scale:.95 }} transition={{ duration:.6 }}>
    <div className="grain" />
    <div className="s4-layout">
      <motion.div className="s4-col" initial={{ opacity:0, rotateY:-25, scale:.85 }} animate={{ opacity:1, rotateY:0, scale:1 }} transition={{ duration:.7 }}>
        <div className="eyebrow accent">01 / REACTIVATION</div>
        <strong>Past<br />patients.</strong>
        <motion.div className="mini" initial={{ rotate:-15 }} animate={{ rotate:-3 }} transition={{ delay:1, duration:.6 }}>A conversation that listens first<br />— and follows the response.</motion.div>
      </motion.div>
      <motion.div className="s4-col" initial={{ opacity:0, rotateY:25, scale:.85 }} animate={{ opacity:1, rotateY:0, scale:1 }} transition={{ delay:2.4, duration:.7 }}>
        <div className="eyebrow accent">02 / LEAD FOLLOW-UP</div>
        <strong>New<br />inquiries.</strong>
        <motion.div className="mini" initial={{ rotate:15 }} animate={{ rotate:3 }} transition={{ delay:4, duration:.6 }}>More chances to connect.<br />No spreadsheet or CRM re-entry.</motion.div>
      </motion.div>
    </div>
    <motion.div className="s4-footer accent" initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:6.1 }}>Your team calls. The software schedules.</motion.div>
  </motion.section>
}