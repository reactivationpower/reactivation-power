import { useEffect, useState } from 'react'
import { useLocation } from 'wouter'
import { arrive,consent,currentPage,flush,handleMarketingClick,loadRegistry,privacyBlocked,setConsent,track } from '@/lib/marketing-tracker'
export function MarketingAnalytics(){
  const [location]=useLocation(),[choice,setChoice]=useState(consent),[registered,setRegistered]=useState(false)
  useEffect(()=>{
    let live=true
    void (async()=>{await flush();await loadRegistry();await arrive();if(live)setRegistered(Boolean(currentPage()))})()
    return()=>{live=false}
  },[location])
  useEffect(()=>{
    const changed=()=>setChoice(consent())
    const failure=()=>track('runtime_error',{category:'runtime'})
    const exit=()=>void flush(true)
    const visibility=()=>{if(document.hidden)exit()}
    document.addEventListener('click',handleMarketingClick)
    window.addEventListener('error',failure)
    window.addEventListener('unhandledrejection',failure)
    window.addEventListener('pagehide',exit)
    window.addEventListener('marketing-consent',changed)
    window.addEventListener('storage',changed)
    document.addEventListener('visibilitychange',visibility)
    const interval=setInterval(()=>void flush(),10000)
    return()=>{
      clearInterval(interval);document.removeEventListener('click',handleMarketingClick)
      window.removeEventListener('error',failure);window.removeEventListener('unhandledrejection',failure)
      window.removeEventListener('pagehide',exit);window.removeEventListener('marketing-consent',changed)
      window.removeEventListener('storage',changed);document.removeEventListener('visibilitychange',visibility)
    }
  },[])
  if(!registered)return null
  if(choice==='unknown')return <aside aria-label="Optional analytics" className="fixed bottom-3 left-3 right-3 z-50 mx-auto max-w-2xl rounded-xl border bg-card p-4 text-sm shadow-lg">
    <p>With your permission, Patient Pipeline measures page visits, clicks and video playback to understand which sources lead to inquiries and bookings. After you submit, this activity may appear in your contact history. We do not record keystrokes or form contents. You can use the site without tracking.</p>
    <div className="mt-3 flex gap-3"><button type="button" className="rounded border px-4 py-2" onClick={()=>setConsent('denied')}>Decline</button><button type="button" className="rounded bg-primary px-4 py-2 text-primary-foreground" onClick={()=>setConsent('granted')}>Allow analytics</button></div>
  </aside>
  return <button type="button" className="fixed bottom-2 left-2 z-40 rounded border bg-card px-2 py-1 text-xs shadow-sm"
    onClick={()=>{if(!privacyBlocked())setConsent(choice==='granted'?'denied':'granted')}}
    aria-label="Change optional analytics preference">{privacyBlocked()?'Privacy signal honored':`Analytics ${choice==='granted'?'on — disable':'off — enable'}`}</button>
}
