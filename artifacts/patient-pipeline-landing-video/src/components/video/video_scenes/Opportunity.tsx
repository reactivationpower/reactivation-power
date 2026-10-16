import { UserRound, Phone, CalendarDays } from 'lucide-react'
import { motion } from 'framer-motion'
import { Scene, Reveal, useBeats, EASE } from '../Motion'

export function Opportunity() {
  const beat = useBeats([4600, 9400, 13600, 22400, 28500])
  return <Scene name="opportunity">
    <div className="small-wordmark">PATIENT PIPELINE</div>
    <div className="opportunity-title"><Reveal><h1>Opportunity<br />is already <em>here.</em></h1></Reveal></div>
    <div className="audience-world">
      <motion.div className="audience-track returning" animate={{ x: beat >= 4 ? -12 : 0, scale: beat >= 5 ? .97 : 1 }} transition={{ duration: 1, ease: EASE }}>
        <div className="track-icon"><UserRound /></div>
        <h2>Past patients</h2><p>They’ve trusted you before.</p>
        <div className="track-tokens">{Array.from({ length: 5 }, (_, i) => <motion.span key={i} initial={{ opacity: 0, scale: .6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: .5 + i * .42, type: 'spring', stiffness: 260, damping: 24 }}><UserRound /></motion.span>)}</div>
        {beat >= 1 && <Reveal className="track-status"><CalendarDays /> 3+ months since their last visit</Reveal>}
        {beat >= 2 && <Reveal className="reactivation-benefit">Often easier to bring back</Reveal>}
        {beat >= 3 && <Reveal className="reactivation-cost"><span>As a rule of thumb:</span>Lower cost than acquiring a new lead</Reveal>}
      </motion.div>
      <motion.div className="audience-track incoming" initial={{ opacity: .25, y: 32 }} animate={{ opacity: beat >= 4 ? 1 : .25, y: beat >= 4 ? 0 : 32 }} transition={{ duration: .75, ease: EASE }}>
        <div className="track-icon"><Phone /></div>
        <h2>New inquiries</h2><p>People who asked about care.</p>
        <div className="track-tokens">{Array.from({ length: 3 }, (_, i) => <motion.span key={i} initial={{ opacity: 0, scale: .6 }} animate={{ opacity: beat >= 4 ? 1 : .2, scale: beat >= 4 ? 1 : .6 }} transition={{ delay: i * .4, type: 'spring', stiffness: 260, damping: 24 }}><UserRound /></motion.span>)}</div>
        {beat >= 4 && <Reveal className="track-status"><CalendarDays /> Haven’t booked yet</Reveal>}
      </motion.div>
    </div>
    {beat >= 5 && <Reveal className="opportunity-conclusion">A consistent way to follow up.</Reveal>}
    <div className="brand-rail" />
  </Scene>
}