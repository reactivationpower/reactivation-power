import { useContext, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSceneTimer } from '@/lib/video'
import { AudioClockContext } from '../AudioClockContext'
import { TutorialCursor, type CursorCue } from '../TutorialCursor'
import { EXAMPLE_CAMPAIGN_NAME, OfferFormOverlay, PriceCampaignName } from '../OfferFormOverlay'
import '../FirstCampaign.css'

const BASE = import.meta.env.BASE_URL
const logo = `${BASE}images/patient-pipeline-logo.png`
const ease = [0.22, 1, 0.36, 1] as const

function Frame({ chapter, children, light = false }: { chapter: string; children: React.ReactNode; light?: boolean }) {
  return <motion.section className="campaign-film" style={{ background:light?'#f8f5ed':'#092a3b',color:light?'#092a3b':'#f8f5ed' }}
    initial={{ opacity:0,scale:1.025 }} animate={{ opacity:1,scale:1 }} exit={{ opacity:0,scale:.985 }}
    transition={{ duration:.55,ease }}>
    <div className="film-grid" /><div className="film-orbit" />
    <header className="film-header"><img src={logo} alt="Patient Pipeline" /><span className="film-kicker">{chapter}</span></header>
    {children}
    <footer className="film-footer"><span>PATIENT PIPELINE / FIRST CAMPAIGN</span><span className="rule"/><span>www.PatientPipeline.app</span></footer>
  </motion.section>
}

type ScreenBeat = { at:number; image:string; label:string; caption:string; note?:string; cues?:CursorCue[] }
function ScreenChapter({ chapter, number, title, intro, beats, light=false, overlay }: {
  chapter:string; number:string; title:string; intro:string; beats:ScreenBeat[]; light?:boolean; overlay?:React.ReactNode
}) {
  const [index,setIndex] = useState(0)
  const [activeCue,setActiveCue] = useState<{ beatIndex:number; cue:CursorCue } | null>(null)
  useSceneTimer(beats.slice(1).map((beat,i)=>({time:beat.at,callback:()=>setIndex(i+1)})))
  useSceneTimer(beats.flatMap((screen,beatIndex)=>(screen.cues??[]).map(cue=>({
    time:cue.at,callback:()=>setActiveCue({beatIndex,cue}),
  }))))
  const beat=beats[index]
  return <Frame chapter={chapter} light={light}>
    <div className="screen-layout">
      <motion.div className="screen-heading" initial={{opacity:0,y:22}} animate={{opacity:1,y:0}} transition={{duration:.65}}>
        <span className="number">{number}</span><h1 className="film-title">{title}</h1><p className="film-copy">{intro}</p>
      </motion.div>
      <AnimatePresence mode="sync">
        <motion.div key={beat.image} className="screen-shell"
          initial={{opacity:0,scale:1.035,filter:'blur(6px)'}} animate={{opacity:1,scale:1,filter:'blur(0px)'}}
          exit={{opacity:0,scale:.985}} transition={{duration:.5,ease}}>
          <img src={`${BASE}images/${beat.image}.png`} alt={`Actual Patient Pipeline demo: ${beat.label}`} />
          {overlay}
          {activeCue?.beatIndex===index && <TutorialCursor key={`${index}-${activeCue.cue.at}`} cue={activeCue.cue}/>}
          <span className="screen-label">{beat.label}</span>
          {beat.note && <div className="editorial-note">{beat.note}</div>}
        </motion.div>
      </AnimatePresence>
    </div>
    <AnimatePresence mode="wait"><motion.div key={beat.caption} className="screen-caption"
      initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:.35}}>{beat.caption}</motion.div></AnimatePresence>
  </Frame>
}

export function Opening() {
  const [step,setStep]=useState(0)
  const audioClock=useContext(AudioClockContext)
  const lastStep=useRef(0)
  useEffect(() => {
    let frame:number
    const sync=() => {
      // The first audio file starts 0.75s into the composite. Follow its
      // playback position so loading delay cannot put the visuals ahead of VO.
      const t=audioClock?.current?.currentTime
      if (t !== undefined) {
        const next=t>=15.65?5:t>=11.19?4:t>=8.40?3:t>=5.32?2:t>=4.09?1:0
        if (next!==lastStep.current) {
          lastStep.current=next
          setStep(next)
        }
      }
      frame=requestAnimationFrame(sync)
    }
    frame=requestAnimationFrame(sync)
    return () => cancelAnimationFrame(frame)
  },[audioClock])
  return <Frame chapter="THE BEGINNER'S GUIDE">
    <div className="film-stage" style={{left:'11%',right:'11%'}}>
      <motion.h1 initial={{opacity:0,y:30}} animate={{opacity:1,y:0}} transition={{duration:.7}} style={{fontSize:'9vmin',maxWidth:'100%',marginBottom:'4vmin'}}>Set up your<br/><span style={{color:'#69d7ca'}}>first campaign.</span></motion.h1>
      {step>0 && <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'3vmin',marginTop:'3vmin'}}>
        {['Add the campaign','Connect the actual form','Verify a real submission'].map((s,i)=><motion.div key={s} initial={{opacity:0,y:25}} animate={{opacity:step>=i+1?1:.32,y:0}} className="step-line" style={{display:'block',fontSize:'2.7vmin'}}><b style={{display:'block'}}>{i+1}</b>{s}</motion.div>)}
      </div>}
      {step>=4 && <motion.p initial={{opacity:0}} animate={{opacity:1}} className="lede" style={{color:'#ffcf8f',marginTop:'3vmin'}}>Saving a campaign does not connect its form.</motion.p>}
      {step>=5 && <motion.p initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} className="lede" style={{color:'#74e1d2',marginTop:'1.3vmin',fontWeight:650}}>We’ll show you how to connect it after we add the offer.</motion.p>}
    </div>
  </Frame>
}
export function Preparation() {
  const [count,setCount]=useState(0)
  // Matilda's phrases begin at 1.39, 4.95, 8.77 and 16.36 seconds in vo_02.
  // The composite starts this clip 0.75 seconds into the scene.
  useSceneTimer([2100,5700,9500,17100].map((time,i)=>({time,callback:()=>setCount(i+1)})))
  return <Frame chapter="BEFORE YOU START" light><div className="film-stage" style={{left:'9%',right:'9%'}}>
    <h2>Get these four things ready.</h2>
    <div className="prep-grid">{['The service and a copy of the ad','Offer items and their real price','Access to the form or its manager','Your own name and phone for the test'].map((x,i)=><motion.div key={x} initial={{opacity:0,y:16}} animate={{opacity:count>i?1:.16,y:0}} style={{background:'#e6f0eb'}}><span style={{color:'#0b8f89',marginRight:'1.2vmin'}}>{String(i+1).padStart(2,'0')}</span>{x}</motion.div>)}</div>
    <p className="lede" style={{color:'#496773'}}>Your form manager can help with the connection later.</p>
  </div></Frame>
}
export function OpenCampaigns() { return <ScreenChapter chapter="STEP 01 / OPEN CAMPAIGNS" number="01" title="Find Campaigns" intro="In Patient Pipeline, switch to Lead Follow-Up—not Reactivation."
  beats={[
    {at:0,image:'pp-welcome',label:'Patient Pipeline welcome',caption:'Choose Lead Follow-Up, not Reactivation.',cues:[{at:2300,x:57,y:79}]},
    {at:6200,image:'pp-campaigns',label:'Campaigns',caption:'Open Campaigns, then select New Campaign.',cues:[{at:6500,x:61,y:12},{at:10100,x:91,y:23}]},
    {at:13800,image:'pp-editor-offer',label:'New Campaign',caption:'This is where you enter the offer.'},
  ]} /> }
export function EnterOffer() {
  const [menuOpen,setMenuOpen]=useState(false)
  const [menuPage,setMenuPage]=useState(0)
  const [typedCharacters,setTypedCharacters]=useState(0)
  const [nameFocusOpen,setNameFocusOpen]=useState(false)
  useSceneTimer([
    {time:2100,callback:()=>setMenuOpen(true)},
    {time:3600,callback:()=>setMenuPage(1)},
    {time:4750,callback:()=>setMenuPage(0)},
    {time:6100,callback:()=>setMenuOpen(false)},
    {time:6500,callback:()=>setNameFocusOpen(true)},
    {time:15500,callback:()=>setNameFocusOpen(false)},
    ...Array.from({length:EXAMPLE_CAMPAIGN_NAME.length},(_,i)=>({
      time:8300+i*105,callback:()=>setTypedCharacters(i+1),
    })),
  ])
  return <ScreenChapter chapter="STEP 02 / ENTER YOUR OFFER" number="02" title="Match the ad" intro="A campaign carries the right offer into the call."
  overlay={<OfferFormOverlay menuOpen={menuOpen} menuPage={menuPage} typedCharacters={typedCharacters} nameFocusOpen={nameFocusOpen}/>}
  beats={[
    {at:0,image:'pp-editor-offer',label:'New campaign · service selection',caption:'Choose the service your ad promotes.',cues:[{at:850,x:35,y:37},{at:4850,x:33,y:47}]},
    {at:6500,image:'pp-editor-offer',label:'Recognizable campaign name',caption:'Type a name your team will recognize.',cues:[{at:7000,x:38,y:48}]},
    {at:16000,image:'pp-editor-offer',label:'What is included',caption:'One actually included item per line.',cues:[{at:16600,x:37,y:61},{at:22500,x:25,y:75}]},
    {at:29000,image:'pp-editor-offer',label:'Compare with your ad',caption:'Only promise what the original ad offers.'},
  ]} />
}
export function PriceAndSave() { return <ScreenChapter chapter="STEP 02 / PRICE AND SAVE" number="02" title="Say it clearly" intro="The price style changes spoken copy, not billing."
  overlay={<PriceCampaignName/>}
  beats={[
    {at:0,image:'pp-editor-price',label:'Price line styles',caption:'Normally X, now Y · Just Y · Don’t mention price',cues:[{at:1700,x:27,y:55},{at:7900,x:31,y:66}]},
    {at:13000,image:'pp-editor-price',label:'On the call preview',caption:'Read the actual spoken-price preview.',cues:[{at:18700,x:37,y:78}]},
    {at:22700,image:'pp-editor-price',label:'Save & Connect Leads',caption:'Use only real deadlines. Check the ad before saving.',cues:[{at:23700,x:28,y:85}]},
  ]} /> }
export function FindForm() { return <ScreenChapter chapter="STEP 03 / FIND THE FORM" number="03" title="Where is the form?" intro="Pick where people enter their name and phone—not just where the ad appears."
  beats={[
    {at:0,image:'pp-connect-closed',label:'Finish connecting your lead form',caption:'A separate saved demo campaign shows the connection steps.',note:'SEPARATE SAVED DEMO CAMPAIGN',cues:[{at:1800,x:90,y:54}]},
    {at:7000,image:'pp-connect-options',label:'Choose the form source',caption:'Facebook / Instagram • GoHighLevel • Website • I’m not sure',cues:[{at:16900,x:17,y:80}]},
    {at:22000,image:'pp-connect-facebook',label:'Facebook / Instagram Instant Form',caption:'A Facebook ad that goes to your website uses “Our website.”'},
  ]} /> }
export function ConnectForm() { return <ScreenChapter chapter="STEP 04 / CONNECT THE FORM" number="04" title="Connect it safely" intro="A private address belongs in your form connector, never in a public ad."
  beats={[{at:0,image:'pp-connect-closed',label:'Campaign overview · private connection link',caption:'Copy the connection link for your own form connector.',cues:[{at:2100,x:10,y:63}]},
    {at:8500,image:'pp-connect-facebook',label:'Facebook Instant Form instructions',caption:'Facebook cannot send directly here. Use GoHighLevel, Zapier or Make.',note:'PRIVATE ADDRESS: HIDDEN IN THIS TUTORIAL'},
    {at:18500,image:'pp-connect-facebook',label:'Outside Patient Pipeline',caption:'Facebook New Lead → Webhooks POST → JSON',note:'Complete these steps in your own connector.'},
    {at:30000,image:'pp-connect-fields',label:'Map the real form answers',caption:'Send at least first_name and phone.'},
    {at:44000,image:'pp-connect-closed',label:'Trusted handoff option',caption:'Copy the instructions, then share them privately with your form manager.',cues:[{at:45200,x:24,y:63}]},
    {at:52000,image:'pp-connect-waiting',label:'Publish or turn on your connector',caption:'A real form submission—not an internal test—confirms the connection.'}]} /> }
export function TestForm() { return <ScreenChapter chapter="STEP 05 / TEST THE ACTUAL FORM" number="05" title="Prove it arrives" intro="Use the same form a prospective patient will use."
  beats={[{at:0,image:'pp-connect-waiting',label:'Demo waiting for external submission',caption:'Submit the actual form with your own name and phone.',note:'NOT VERIFIED IN THIS DEMO',cues:[{at:16100,x:16,y:55}]},
    {at:18000,image:'pp-connect-internal',label:'Internal test disclosure',caption:'An internal test checks only Patient Pipeline’s side.',note:'INTERNAL TEST ≠ REAL-FORM TEST'},
    {at:35000,image:'pp-campaign-detail',label:'Campaign Leads tab',caption:'After a real submission, confirm your test entry here.',cues:[{at:39000,x:5,y:88}]}]} /> }
export function PracticeScript() { return <ScreenChapter chapter="STEP 06 / PRACTICE SCRIPT" number="06" title="Rehearse first" intro="Check that the service, included items and price match your ad."
  beats={[
    {at:0,image:'pp-campaign-detail',label:'Practice script',caption:'Open the practice script from this campaign.',cues:[{at:2100,x:8,y:41}]},
    {at:6300,image:'pp-practice-open',label:'Actual practice screen',caption:'Read the opening, then try a response button.',cues:[{at:10400,x:30,y:82}]},
    {at:13800,image:'pp-practice-next',label:'Next prompt',caption:'Your team can get comfortable before live calls.'},
  ]} /> }
export function FindLeads() { return <ScreenChapter chapter="STEP 07 / FIND NEW LEADS" number="07" title="Find new leads" intro="These are existing seeded demo leads, not evidence of this form being connected."
  beats={[
    {at:0,image:'pp-lead-due',label:'Calls Due Now · Ready to call',caption:'Use the due queue when your team is ready.',cues:[{at:1200,x:45,y:10},{at:8400,x:89,y:61}]},
    {at:11500,image:'pp-lead-call',label:'Example call screen · separate seeded demo lead',caption:'Call Now opens a guided screen. It does not dial a phone.',cues:[{at:17600,x:54,y:11}]},
    {at:21000,image:'pp-all-leads',label:'All Leads',caption:'Browse everyone, including leads not due right now.',cues:[{at:22500,x:19,y:41}]},
  ]} /> }
export function Checklist() {
  const [count,setCount]=useState(0)
  useSceneTimer([1000,3100,5300,7400,9600,11800,14000,22100].map((time,i)=>({time,callback:()=>setCount(i+1)})))
  const items=['Campaign created','Service, offer and price match the ad','Actual form connected','Real-form test submitted','Test entry visible in campaign Leads','Practice script reviewed','Calls Due Now and All Leads located']
  return <Frame chapter="FIRST-CAMPAIGN CHECKLIST" light><div className="film-stage" style={{left:'12%',right:'12%',justifyContent:'flex-start',paddingTop:'2vmin'}}>
    <h2 style={{fontSize:'5.5vmin',marginBottom:'1vmin'}}>Before you call it ready</h2>
    {items.map((x,i)=><motion.div className="check-row" key={x} initial={{opacity:0,x:-12}} animate={{opacity:count>i?1:.2,x:0}} transition={{duration:.3}}><i/>{x}</motion.div>)}
    <motion.p initial={{opacity:0}} animate={{opacity:count>=7?1:0}} style={{font:'700 3.4vmin Space Grotesk',color:'#0b8f89',marginTop:'2vmin'}}>Ready means a submission from your actual form appears here.</motion.p>
  </div>
  <AnimatePresence>{count>=8 && <motion.div
    initial={{opacity:0,clipPath:'circle(0% at 50% 50%)'}} animate={{opacity:1,clipPath:'circle(100% at 50% 50%)'}}
    transition={{duration:.65,ease}} style={{position:'absolute',inset:0,zIndex:10,background:'#092a3b',color:'#f8f5ed',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:'3vmin'}}>
    <img src={logo} alt="Patient Pipeline" style={{width:'32vmin',padding:'1.2vmin',background:'#fff'}}/>
    <strong style={{font:'600 5vmin Space Grotesk',letterSpacing:'-.04em'}}>Set up. Connect. Verify.</strong>
    <span style={{font:'500 2.5vmin DM Sans',color:'#70d9cd'}}>www.PatientPipeline.app</span>
  </motion.div>}</AnimatePresence></Frame>
}