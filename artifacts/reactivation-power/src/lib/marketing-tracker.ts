import { MARKETING_PAGES, type MarketingEvent, type EventType } from '@workspace/shared/marketing-analytics'
type Page={id:string;path:string;label:string;funnel:string}
let registry:readonly Page[]=MARKETING_PAGES
let page:Page|undefined, ready=false, sending=false, initializing:Promise<void>|null=null
let queue:MarketingEvent[]=[]
let lastActivity=0
let sessionId='',sessionMinutes=30
let capturedReferrer=false
const CONSENT='pp_marketing_consent'
const api='/api/marketing'
export function privacyBlocked() {
  return navigator.doNotTrack==='1'||(navigator as Navigator&{globalPrivacyControl?:boolean}).globalPrivacyControl===true
}
export function consent() {
  if(privacyBlocked())return 'denied'
  try{return localStorage.getItem(CONSENT)??'unknown'}catch{return 'denied'}
}
export function setConsent(value:'granted'|'denied') {
  try{localStorage.setItem(CONSENT,value)}catch{/* storage unavailable: remain disabled */}
  queue=[];ready=false
  if(value==='denied')void fetch(`${api}/forget`,{method:'POST',credentials:'same-origin'}).catch(()=>{})
  else void arrive()
  window.dispatchEvent(new Event('marketing-consent'))
}
function routePath(){
  const base=import.meta.env.BASE_URL.replace(/\/$/,'')
  return window.location.pathname.slice(base.length)||'/'
}
function context(){
  const params=new URLSearchParams(window.location.search)
  let referrer:string|undefined
  let internalReferrer=false
  try{internalReferrer=new URL(document.referrer).origin===window.location.origin}catch{/* direct entry */}
  try{const u=new URL(document.referrer);if(!capturedReferrer&&u.hostname!==window.location.hostname)referrer=u.hostname}catch{/* no referring domain */}
  const source=params.get('ms')
  const utm=Object.fromEntries([...params].filter(([k])=>/^utm_(source|medium|campaign|term|content)$/.test(k)).map(([k,v])=>[k,v.slice(0,60)]))
  return {page:page!.id,entry:!capturedReferrer&&!internalReferrer,...(source&&/^[A-Za-z0-9_-]{16}$/.test(source)?{source}:{}),utm,referrer,
    device:window.matchMedia('(max-width: 767px)').matches?'mobile':window.matchMedia('(max-width: 1023px)').matches?'tablet':'desktop'}
}
export async function loadRegistry(){
  try{const res=await fetch(`${api}/registry`);if(res.ok){const data=await res.json();if(Array.isArray(data.pages))registry=data.pages}}catch{/* tracking is optional */}
}
export function currentPage(){return page?.id}
export async function arrive(){
  if(initializing)await initializing
  ready=false;page=registry.find(p=>p.path===routePath())
  if(consent()!=='granted'||!page)return
  initializing=(async()=>{
    try {
      const response=await fetch(`${api}/context`,{method:'POST',headers:{'Content-Type':'application/json','X-Marketing-Consent':'granted'},body:JSON.stringify(context()),credentials:'same-origin'})
      ready=response.ok
      if(ready){
        const data=await response.json()
        capturedReferrer=true
        if(sessionId!==data.sessionId)queue=[]
        sessionId=data.sessionId;sessionMinutes=data.sessionMinutes
        lastActivity=Date.now();track('page_view');if(page?.id==='calendar')track('calendar_arrival')
        // Retain validated attribution in the server session, not a reusable query on every SPA view.
        const u=new URL(window.location.href)
        for(const key of ['ms','utm_source','utm_medium','utm_campaign','utm_term','utm_content'])u.searchParams.delete(key)
        window.history.replaceState(window.history.state,'',u.pathname+u.search+u.hash)
      }
    }catch{ready=false}
  })()
  await initializing;initializing=null
}
export function track(type:EventType,detail:Partial<Omit<MarketingEvent,'id'|'version'|'at'|'page'|'type'>>={}){
  if(consent()!=='granted'||!page)return
  if(!ready)return
  if(Date.now()-lastActivity>sessionMinutes*60000){void arrive();return}
  lastActivity=Date.now()
  if(queue.length>=200)queue.shift()
  queue.push({id:crypto.randomUUID(),version:1,at:new Date().toISOString(),page:page.id,type,...detail})
  if(queue.length>=30)void flush()
}
export async function flush(exit=false){
  if(sending||!ready||consent()!=='granted'||!queue.length)return
  const batch=queue.slice(0,40);sending=true
  try{
    const response=await fetch(`${api}/events`,{method:'POST',headers:{'Content-Type':'application/json','X-Marketing-Consent':'granted'},
      body:JSON.stringify({sessionId,events:batch}),credentials:'same-origin',keepalive:exit})
    if(response.ok||response.status===400)queue=queue.filter(e=>!batch.some(b=>b.id===e.id))
    else if(response.status===409){queue=[];ready=false}
  }catch{/* bounded in-memory retries use stable event IDs */}
  finally{sending=false}
}
/** Stable page IDs only; labels/text/URLs never leave the browser. */
export function handleMarketingClick(e:MouseEvent){
  const target=e.target instanceof Element?e.target.closest('a,button'):null
  if(!target)return
  const control=target.getAttribute('data-marketing-control')
  if(control&&/^[a-z][a-z0-9-]{0,63}$/.test(control)){track('cta',{control});return}
  if(target instanceof HTMLAnchorElement){
    try{
      const u=new URL(target.href,window.location.href)
      if(u.origin!==window.location.origin){track('link_outbound',{control:'external-link'});return}
      const dest=registry.find(p=>p.path===u.pathname)
      if(dest)track(dest.id==='schedule'||dest.id==='strategy-schedule'?'cta':'link_internal',{control:`to-${dest.id}`})
    }catch{/* invalid link has no event */}
  }
}
