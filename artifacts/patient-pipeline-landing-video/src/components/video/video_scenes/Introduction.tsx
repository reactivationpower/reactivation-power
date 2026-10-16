import { UserRound, MessagesSquare } from 'lucide-react'
import { motion } from 'framer-motion'
import { Brand, Scene, Reveal, useBeats, EASE } from '../Motion'

export function Introduction() {
  const beat = useBeats([4600, 6900, 10800, 13300])
  return <Scene name="introduction" tone="ivory">
    <motion.div className="intro-brand" initial={{ scale: 1.12 }} animate={{ scale: 1 }} transition={{ duration: 1, ease: EASE }}><Brand /></motion.div>
    <div className="product-pair">
      <motion.div className="product-block" initial={{ opacity: .2 }} animate={{ opacity: beat >= 1 ? 1 : .2 }} transition={{ duration: .6 }}>
        <UserRound /><span>PAST PATIENTS</span><h2>Reactivation</h2><div className="product-rule teal" />
      </motion.div>
      <div className="pair-plus">+</div>
      <motion.div className="product-block" initial={{ opacity: .2 }} animate={{ opacity: beat >= 2 ? 1 : .2 }} transition={{ duration: .6 }}>
        <MessagesSquare /><span>NEW INQUIRIES</span><h2>Lead Follow-Up</h2><div className="product-rule blue" />
      </motion.div>
    </div>
    {beat >= 3 && <Reveal className="intro-payoff">Guidance that fits the conversation.</Reveal>}
    <motion.div className="intro-bridge" initial={{ scaleX: 0 }} animate={{ scaleX: beat >= 4 ? 1 : 0 }} transition={{ duration: 1, ease: EASE }} />
  </Scene>
}