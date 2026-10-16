import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSceneTimer } from '@/lib/video'
import '../Walkthrough.css'

const image = (name: string) => `${import.meta.env.BASE_URL}images/${name}`
const ease = [0.22, 1, 0.36, 1] as const
const enter = { initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 }, transition: { duration: .6, ease } }

function Scene({ children, tone = 'ink' }: { children: React.ReactNode; tone?: 'ink' | 'cream' | 'teal' }) {
  return <motion.section className={`wf wf-${tone}`} initial={{ opacity: 0, scale: 1.025 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .985 }} transition={{ duration: .45, ease }}>{children}</motion.section>
}

function Label({ children }: { children: React.ReactNode }) { return <div className="wf-label">{children}</div> }

function Window({ src, label, className = '' }: { src: string; label: string; className?: string }) {
  return <div className={`wf-window ${className}`}>
    <div className="wf-window-top"><span className="wf-window-dots">● ● ●</span><span>{label}</span><span>SAMPLE DATA</span></div>
    <img src={image(src)} alt={label} />
  </div>
}

function FullCallView({ src, label, cursorTarget, className = '', children }: { src: string; label: string; cursorTarget?: { x: string; y: string }; className?: string; children?: React.ReactNode }) {
  return <div className={`wf-full-call ${className}`}>
    <AnimatePresence mode="sync"><motion.img key={src} src={image(src)} alt={label} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .32 }} /></AnimatePresence>
    {children}
    {cursorTarget && <motion.div className="wf-moving-cursor" initial={{ left: '76%', top: '27%', opacity: 0 }} animate={{ left: cursorTarget.x, top: cursorTarget.y, opacity: 1 }} transition={{ left: { duration: 2.1, ease, delay: .3 }, top: { duration: 2.1, ease, delay: .3 }, opacity: { duration: .2 } }} aria-hidden="true">
      <motion.svg width="36" height="42" viewBox="0 0 36 42" animate={{ scale: [1, .78, 1] }} transition={{ delay: 2.4, duration: .23, times: [0, .45, 1] }}><path d="M3 2v32l8-7 6 12 6-3-6-12 12-1L3 2Z" fill="#15233c" stroke="#ffffff" strokeWidth="2.5" strokeLinejoin="round" /></motion.svg>
      <motion.span className="wf-cursor-pulse" initial={{ opacity: 0, scale: .4 }} animate={{ opacity: [0, .95, 0], scale: [.4, 2.3, 2.7] }} transition={{ delay: 2.4, duration: .75 }} />
    </motion.div>}
  </div>
}

export function Introduction() {
  const [beat, setBeat] = useState(0)
  useSceneTimer([{ time: 1500, callback: () => setBeat(1) }, { time: 4300, callback: () => setBeat(2) }, { time: 10000, callback: () => setBeat(3) }, { time: 13900, callback: () => setBeat(4) }, { time: 17700, callback: () => setBeat(5) }])
  return <Scene>
    <div className="wf-intro-brand"><img src={image('patient-pipeline-logo.png')} alt="Patient Pipeline" /></div>
    <div className="wf-intro-content">
      <Label>PATIENT PIPELINE / PRODUCT WALKTHROUGH</Label>
      <div className="wf-intro-headline">
        <AnimatePresence mode="sync">
          {beat < 3
            ? <motion.h1 key="products" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: .5, ease }}>Two products.<br /><em>One Patient Pipeline.</em></motion.h1>
            : <motion.h1 key="relationship" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: .5, ease }}>The relationship<br /><em>is already there.</em></motion.h1>}
        </AnimatePresence>
      </div>
      {beat < 3
        ? <div className="wf-intro-pair">
            <div className={beat >= 1 ? 'active' : ''}>01 / PAST PATIENTS<strong>Reactivation</strong><small>Reconnect with people who know your practice.</small></div>
            <div className={beat >= 2 ? 'active' : ''}>02 / NEW INQUIRIES<strong>Lead Follow-Up</strong><small>Guide responses to your ads.</small></div>
          </div>
        : <>
            <motion.div className="wf-value-line" {...enter}>Reconnect with people who already know your practice.</motion.div>
            {beat >= 4 && <motion.p className="wf-value-compare" {...enter}>Reactivating a former patient often costs significantly less than attracting a new one through paid ads.</motion.p>}
            {beat >= 5 && <motion.span className="wf-intro-last" {...enter}>Let’s start with Reactivation →</motion.span>}
          </>}
    </div>
  </Scene>
}

export function ContactUpload() {
  const [beat, setBeat] = useState(0)
  useSceneTimer([{time:3700,callback:()=>setBeat(1)},{time:6500,callback:()=>setBeat(2)},{time:10500,callback:()=>setBeat(3)},{time:13300,callback:()=>setBeat(4)},{time:18500,callback:()=>setBeat(5)}])
  const src=beat<2?'patient-contacts.png':beat<4?'patient-upload-drop.png':'patient-upload-preview.png'
  return <Scene tone="cream">
    <div className="wf-capture-note">01 / UPLOAD CONTACTS · ILLUSTRATIVE CSV · ACTUAL COLUMN MATCHING</div>
    <FullCallView src={src} label="Contacts import with fictional patient data" cursorTarget={beat===1?{x:'80%',y:'23%'}:beat===3?{x:'50%',y:'36%'}:undefined}>
      {beat===3 && <motion.div className="wf-upload-file" initial={{left:'73%',top:'60%',rotate:-8,opacity:0,scale:1}} animate={{left:'41%',top:'31%',rotate:0,opacity:[0,1,1,0],scale:.8}} transition={{duration:2.65,ease,opacity:{duration:2.65,times:[0,.1,.82,1]}}} aria-hidden="true">
        <span>CSV ↓</span><strong>ridgeline-patient-export.csv</strong><small>24 fictional contacts · Niche column</small>
      </motion.div>}
    </FullCallView>
    {beat>=5 && <motion.div className="wf-stage-tag" {...enter}>Your export. Matched columns. Service tags.</motion.div>}
  </Scene>
}

export function StaffTraining() {
  const [beat, setBeat] = useState(0)
  useSceneTimer([{time:6500,callback:()=>setBeat(1)},{time:9300,callback:()=>setBeat(2)},{time:13600,callback:()=>setBeat(3)},{time:16400,callback:()=>setBeat(4)}])
  const src=beat===0?'rev-training.png':beat===1?'rev-training-practice.png':beat<4?'rev-practice-open.png':'rev-practice-question.png'
  return <Scene tone="cream">
    <div className="wf-capture-note">02 / TRAIN AT YOUR OWN PACE · PRACTICE BEFORE CALLING</div>
    <FullCallView src={src} label="Training portal and actual practice script" cursorTarget={beat===1?{x:'33%',y:'84%'}:beat===3?{x:'28%',y:'96%'}:undefined} />
  </Scene>
}

export function CallsDue() {
  const [beat, setBeat] = useState(0)
  useSceneTimer([{time:3600,callback:()=>setBeat(1)},{time:7400,callback:()=>setBeat(2)},{time:11600,callback:()=>setBeat(3)},{time:21200,callback:()=>setBeat(4)}])
  return <Scene tone="cream">
    <div className="wf-capture-note">03 / CALLS DUE TODAY · ILLUSTRATIVE DEMO RECORDS</div>
    <FullCallView src="patient-queue.png" label="The actual Calls Due Today queue, with fictional patient names and phone numbers" cursorTarget={beat===4?{x:'88%',y:'69%'}:undefined} />
    {beat>=1 && <motion.div className="wf-queue-topic" {...enter}>Name + number + service <span>— all in one place</span></motion.div>}
    {beat>=2 && <motion.div className="wf-queue-services" {...enter}>Service context stays with every contact.</motion.div>}
  </Scene>
}

export function SharedOpening() {
  const [beat, setBeat] = useState(0)
  useSceneTimer([{ time: 4300, callback: () => setBeat(1) }, { time: 7000, callback: () => setBeat(2) }, {time:13200,callback:()=>setBeat(3)},{time:16000,callback:()=>setBeat(4)}])
  return <Scene tone="cream">
    <div className="wf-capture-note">01 / REACTIVATION · FULL CALL SCREEN · SAMPLE DATA</div>
    <FullCallView src={beat<2?'patient-live-open.png':beat<4?'patient-live-question.png':'patient-live-still-good.png'} label="Caller screen for fictional patient Bill Carter, progressing through the Chiropractic opening" cursorTarget={beat===1?{x:'28%',y:'84%'}:beat===3?{x:'25%',y:'88%'}:undefined} />
  </Scene>
}

export function FeelingFine() {
  const [beat, setBeat] = useState(0)
  useSceneTimer([{ time: 5400, callback: () => setBeat(1) }, { time: 8200, callback: () => setBeat(2) }, {time:15000,callback:()=>setBeat(3)}])
  return <Scene tone="cream">
    <div className="wf-capture-note">LATER QUESTION / WHY DID THEY STOP? · SAMPLE DATA</div>
    <FullCallView src={beat<2?'patient-fine-choice.png':'patient-fine-result.png'} label="Full caller screen before and after the feeling fine response" cursorTarget={beat===1?{x:'31%',y:'88%'}:undefined} />
    {beat>=3 && <motion.div className="wf-stage-tag" {...enter}>Their answer changes the next screen.</motion.div>}
  </Scene>
}

export function BackToWhereItWas() {
  const [beat, setBeat] = useState(0)
  useSceneTimer([{ time: 4200, callback: () => setBeat(1) }, { time: 7000, callback: () => setBeat(2) }, {time:13900,callback:()=>setBeat(3)}])
  return <Scene tone="cream">
    <div className="wf-capture-note">OPENING QUESTION / A DIFFERENT ANSWER · SAMPLE DATA</div>
    <FullCallView src={beat<2?'patient-live-question.png':'patient-live-back-result.png'} label="Full caller screen before and after the back to where I was response" cursorTarget={beat===1?{x:'60%',y:'88%'}:undefined} />
    {beat>=3 && <motion.div className="wf-stage-tag" {...enter}>Different answer. Different next question.</motion.div>}
  </Scene>
}

const niches = [
  { name: 'Chiropractic', number: '01' },
  { name: 'Spinal Decompression', number: '02' },
  { name: 'Neuropathy', number: '03' },
  { name: 'Joint Pain', number: '04' },
  { name: 'SoftWave/ShockWave', number: '05' },
  { name: 'Acupuncture', number: '06' },
  { name: 'Massage Therapy', number: '07' },
  { name: 'Gut Health', number: '08' },
  { name: 'ChiroThin & Weight Loss Programs', number: '09' },
]
export function ServiceSpecific() {
  const [beat, setBeat] = useState(0)
  useSceneTimer([{ time: 4600, callback: () => setBeat(1) }, { time: 9000, callback: () => setBeat(2) }, { time: 14400, callback: () => setBeat(3) }, { time: 20900, callback: () => setBeat(4) }, { time: 25500, callback: () => setBeat(5) }])
  return <Scene>
    <div className="wf-service-head"><Label>ONE FAMILIAR STRUCTURE</Label><h2>Relevant questions<br /><span>for each service.</span></h2></div>
    <div className="wf-service-line" />
    <div className="wf-service-grid">{niches.map((n, i) => <motion.div key={n.name} className={`wf-service-card ${beat >= Math.floor(i / 3) + 1 ? 'lit' : ''}`} initial={{ opacity: 0, y: 20 }} animate={{ opacity: beat >= Math.floor(i / 3) + 1 ? 1 : .16, y: beat >= Math.floor(i / 3) + 1 ? 0 : 20 }} transition={{ duration: .55, ease }}><span>{n.number} / {i === 8 ? 'ALSO OFFERED' : 'CHIROPRACTIC FAMILY'}</span><strong>{n.name}</strong></motion.div>)}</div>
    {beat >= 4 && <motion.div className="wf-service-end" {...enter}>A different reactivation script for every service.</motion.div>}
    {beat >= 5 && <motion.div className="wf-service-bridge" {...enter}>NEXT / LEAD FOLLOW-UP →</motion.div>}
  </Scene>
}

export function LeadFollowUp() {
  const [beat, setBeat] = useState(0)
  const [showWebhook, setShowWebhook] = useState(false)
  // Matilda's existing VO: webhooks at ~4-7s, leads arrive ~7-10s,
  // "Click Call Now" at ~16-19s, caller choices at ~22-28s.
  useSceneTimer([{time:1000,callback:()=>setShowWebhook(true)},{time:7000,callback:()=>setBeat(1)},{time:12800,callback:()=>setShowWebhook(false)},{time:14500,callback:()=>setBeat(2)},{time:17300,callback:()=>setBeat(3)},{time:21800,callback:()=>setBeat(4)},{time:24600,callback:()=>setBeat(5)},{time:27000,callback:()=>setBeat(6)},{time:29800,callback:()=>setBeat(7)}])
  const src=beat===0?'patient-campaigns.png':beat<3?'rev-lead-queue.png':beat===3?'rev-lead-open.png':beat===4?'rev-lead-choice.png':beat===5?'rev-lead-move-time.png':beat===6?'rev-lead-move-choice.png':'rev-lead-not-sure.png'
  return <Scene tone="cream">
    <div className="wf-capture-note">02 / LEAD FOLLOW-UP · {beat===0?'ACTUAL DEMO CAMPAIGNS':'ACTUAL CALL SCREENS · SAMPLE CAMPAIGN'}</div>
    <FullCallView src={src} label={beat===0?'Campaigns page showing six different sample ads and offers':'Campaign-aware lead due list and caller script in the demo'} cursorTarget={beat===2?{x:'92%',y:'76%'}:beat===4?{x:'32%',y:'90%'}:beat===6?{x:'34%',y:'50%'}:undefined} />
    {showWebhook && <motion.div className="wf-lead-webhook-note" {...enter}>CONNECTED AD FORM <span>→</span> CAMPAIGN WEBHOOK <span>→</span> LEAD QUEUE</motion.div>}
  </Scene>
}

export function LeadAfterCall() {
  const [beat,setBeat]=useState(0)
  useSceneTimer([{time:4800,callback:()=>setBeat(1)},{time:9300,callback:()=>setBeat(2)},{time:15400,callback:()=>setBeat(3)}])
  return <Scene tone="cream">
    <div className="wf-capture-note">AFTER THE CALL / LOG AN ELIGIBLE OUTCOME</div>
    <FullCallView src="rev-lead-outcome.png" label="Real lead-call outcome area, before logging" className={beat>=1?'wf-call-shrunk':''} />
    {beat>=1 && <motion.div className="wf-lead-process" {...enter}><Label>ONE ACTION</Label><h2>Log the<br />outcome.</h2><div className="wf-process-line">Software schedules<br />the next eligible attempt</div><div className="wf-process-line">Back on the call list<br />when due</div></motion.div>}
    {beat>=2 && <motion.div className="wf-lead-benefit wf-process-benefit" {...enter}>More chances to connect.<br /><span>No separate spreadsheet or CRM entry.</span></motion.div>}
    {beat>=3 && <motion.div className="wf-log-footnote" {...enter}>Staff make the calls. Closed and do-not-call outcomes are not retried.</motion.div>}
  </Scene>
}

export function Resolution() {
  const [beat, setBeat] = useState(0)
  useSceneTimer([{ time: 1000, callback: () => setBeat(1) }, { time: 3000, callback: () => setBeat(2) }, { time: 5100, callback: () => setBeat(3) }, { time: 7800, callback: () => setBeat(4) }, { time: 10300, callback: () => setBeat(5) }])
  return <Scene tone="cream">
    <div className="wf-end-lines"><div>REACTIVATION <span>Past patients</span></div><div>LEAD FOLLOW-UP <span>New inquiries</span></div></div>
    {beat >= 1 && <motion.h2 className="wf-end-promise" {...enter}>Your people make the calls.</motion.h2>}
    {beat >= 2 && <motion.img className="wf-end-logo" src={image('patient-pipeline-logo.png')} alt="Patient Pipeline" {...enter} />}
    {beat >= 3 && <motion.p className="wf-end-summary" {...enter}>Patient Pipeline guides the next step.</motion.p>}
    {beat >= 4 && <motion.div className="wf-end-cta" {...enter}>Schedule a Call</motion.div>}
    {beat >= 5 && <motion.div className="wf-end-rule" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: .8 }} />}
  </Scene>
}