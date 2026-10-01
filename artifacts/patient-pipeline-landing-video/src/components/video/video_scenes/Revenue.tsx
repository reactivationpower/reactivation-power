import { UserRound } from 'lucide-react'
import { motion } from 'framer-motion'
import { Scene, Reveal, useBeats, EASE } from '../Motion'

export function Revenue() {
  const beat = useBeats([4300, 11100, 18500, 22800, 26800, 30600, 32800])
  return <Scene name="revenue">
    <div className="revenue-title">What could one month of better follow-up mean?</div>
    <motion.div className="revenue-groups" animate={{ y: beat >= 4 ? '-9vh' : 0, scale: beat >= 4 ? .8 : 1 }} transition={{ duration: 1.1, ease: EASE }}>
      <div className="revenue-group returning">
        <div className="patient-tokens">{Array.from({ length: 4 }, (_, i) => <motion.span key={i} initial={{ opacity: 0, y: 22, scale: .6 }} animate={{ opacity: beat >= 1 ? 1 : 0, y: beat >= 1 ? 0 : 22, scale: beat >= 1 ? 1 : .6 }} transition={{ delay: i * .3, duration: .5, ease: EASE }}><UserRound /></motion.span>)}</div>
        {beat >= 1 && <Reveal><strong>4</strong><p>additional reactivations</p><small>Above your current reactivation efforts</small></Reveal>}
      </div>
      {beat >= 2 && <Reveal className="revenue-plus">+</Reveal>}
      <div className="revenue-group incoming">
        <div className="patient-tokens">{Array.from({ length: 3 }, (_, i) => <motion.span key={i} initial={{ opacity: 0, y: 22, scale: .6 }} animate={{ opacity: beat >= 2 ? 1 : 0, y: beat >= 2 ? 0 : 22, scale: beat >= 2 ? 1 : .6 }} transition={{ delay: i * .3, duration: .5, ease: EASE }}><UserRound /></motion.span>)}</div>
        {beat >= 2 && <Reveal><strong>3</strong><p>additional leads booked</p><small>Above your current lead bookings</small></Reveal>}
      </div>
    </motion.div>
    {beat >= 3 && <Reveal className={`revenue-assumption ${beat >= 4 ? 'raised' : ''}`}><span>7 additional patients</span><b>×</b><span><strong>$1,500</strong><small>value per patient</small></span></Reveal>}
    {beat >= 4 && <Reveal className="revenue-total"><motion.h2 initial={{ scale: .8 }} animate={{ scale: 1 }} transition={{ duration: .7, ease: EASE }}>$10,500</motion.h2><p>potential additional patient value from one month</p></Reveal>}
    {beat >= 6 && <Reveal className="revenue-ending">Two opportunities. One Patient Pipeline.</Reveal>}
    <div className="revenue-baseline" />
  </Scene>
}