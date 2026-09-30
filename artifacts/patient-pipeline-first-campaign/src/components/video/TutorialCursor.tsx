import { motion } from 'framer-motion'

export type CursorCue = { at: number; x: number; y: number }

const ease = [0.22, 1, 0.36, 1] as const

export function TutorialCursor({ cue }: { cue: CursorCue }) {
  return <motion.div
    className="tutorial-cursor"
    aria-hidden="true"
    initial={{ left: `${Math.max(3, cue.x - 13)}%`, top: `${Math.min(92, cue.y + 12)}%`, opacity: 0 }}
    animate={{ left: `${cue.x}%`, top: `${cue.y}%`, opacity: 1 }}
    transition={{ left: { duration: 1.05, ease, delay: .1 }, top: { duration: 1.05, ease, delay: .1 }, opacity: { duration: .2 } }}
  >
    <motion.svg viewBox="0 0 36 42" animate={{ scale: [1, .74, 1] }} transition={{ delay: 1.18, duration: .32, times: [0, .45, 1] }}>
      <path d="M3 2v32l8-7 6 12 6-3-6-12 12-1L3 2Z" fill="#092a3b" stroke="#ffffff" strokeWidth="3" strokeLinejoin="round" />
    </motion.svg>
    <motion.span className="tutorial-cursor-pulse" initial={{ opacity: 0, scale: .4 }}
      animate={{ opacity: [0, .95, 0], scale: [.4, 2.2, 2.8] }}
      transition={{ delay: 1.19, duration: .75 }} />
  </motion.div>
}