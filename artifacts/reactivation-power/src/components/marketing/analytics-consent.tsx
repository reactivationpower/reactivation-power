import { useEffect } from 'react'
import { useLocation } from 'wouter'
import { arrive,flush,handleMarketingClick,loadRegistry,track } from '@/lib/marketing-tracker'
export function MarketingAnalytics(){
  const [location]=useLocation()
  useEffect(()=>{
    void (async()=>{await flush();await loadRegistry();await arrive()})()
  },[location])
  useEffect(()=>{
    const failure=()=>track('runtime_error',{category:'runtime'})
    const exit=()=>void flush(true)
    const visibility=()=>{if(document.hidden)exit()}
    document.addEventListener('click',handleMarketingClick)
    window.addEventListener('error',failure)
    window.addEventListener('unhandledrejection',failure)
    window.addEventListener('pagehide',exit)
    document.addEventListener('visibilitychange',visibility)
    const interval=setInterval(()=>void flush(),10000)
    return()=>{
      clearInterval(interval);document.removeEventListener('click',handleMarketingClick)
      window.removeEventListener('error',failure);window.removeEventListener('unhandledrejection',failure)
      window.removeEventListener('pagehide',exit);document.removeEventListener('visibilitychange',visibility)
    }
  },[])
  // Headless: retain opt-in gates and privacy signals, never fabricate consent.
  // New visitors have no opt-in UI and therefore no detailed session tracking.
  return null
}
