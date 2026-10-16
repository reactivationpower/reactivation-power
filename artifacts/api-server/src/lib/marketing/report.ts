import { pool } from '@workspace/db'
import { z } from 'zod'
import { contentSeconds, type ReportInput } from '@workspace/shared/marketing-analytics'
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
/** Report reads never update idle-session activity. Models are mutually exclusive. */
export async function marketingReport(admin:{role:string;userId:string},input:ReportInput) {
  const f=z.object({from:date.optional(),to:date.optional(),timezone:z.string().max(80).default('America/New_York'),
    source:z.string().max(100).optional(),campaign:z.string().max(100).optional(),channel:z.string().max(100).optional(),
    page:z.string().max(64).optional(),funnel:z.string().max(64).optional(),model:z.enum(['first','last']).default('first'),
    observationDays:z.number().int().min(1).max(365).default(90),includeExcluded:z.boolean().default(false)}).strict().parse(input)
  try { new Intl.DateTimeFormat('en-US',{timeZone:f.timezone}).format() } catch {throw new Error('Invalid reporting timezone')}
  const to=f.to??new Date().toISOString().slice(0,10),from=f.from??new Date(Date.now()-30*86400000).toISOString().slice(0,10)
  if(!Number.isFinite(Date.parse(from))||!Number.isFinite(Date.parse(to))||from>to||Date.parse(to)-Date.parse(from)>366*86400000) throw new Error('Choose a date range of at most one year')
  const params=[from,to,f.timezone,admin.role==='super_admin',admin.userId,f.includeExcluded,f.funnel??'',f.page??'']
  // Cohort entry is computed BEFORE date filtering, separately for each funnel.
  const sessions=(await pool.query(`WITH eligible AS (
    SELECT s.*,v.classification FROM marketing_sessions s JOIN marketing_visitors v ON v.id=s.visitor_id
    LEFT JOIN sales_leads l ON l.id=s.lead_id WHERE v.removed_at IS NULL
    AND ($4::boolean OR l.assignee_id=$5) AND ($6::boolean OR v.classification='observed')
    AND ($7='' OR s.funnel=$7)
  ), cohort AS (SELECT visitor_id,funnel,min(started_at) AS cohort_at FROM eligible GROUP BY visitor_id,funnel)
  SELECT e.*,c.cohort_at FROM eligible e JOIN cohort c USING(visitor_id,funnel)
  WHERE (c.cohort_at AT TIME ZONE $3)::date BETWEEN $1::date AND $2::date
  AND ($8='' OR EXISTS(SELECT 1 FROM marketing_events ev WHERE ev.session_id=e.id AND ev.page_id=$8))
  ORDER BY e.started_at LIMIT 20001`,params)).rows
  if(sessions.length>20000) throw new Error('Too many sessions for this report. Narrow the date range or funnel.')
  const ids=sessions.map(s=>s.id),visitors=[...new Set(sessions.map(s=>s.visitor_id))]
  const [eventResult,touchResult,conversionResult]=await Promise.all([
    pool.query('SELECT * FROM marketing_events WHERE session_id=ANY($1::uuid[]) ORDER BY occurred_at,id LIMIT 100001',[ids]),
    pool.query('SELECT * FROM marketing_touches WHERE visitor_id=ANY($1::uuid[]) ORDER BY occurred_at,id',[visitors]),
    pool.query(`WITH canonical AS (SELECT *,row_number() OVER(PARTITION BY kind,
      CASE WHEN kind IN ('lead','booking') THEN lead_id::text WHEN kind='customer' THEN customer_id ELSE id END
      ORDER BY occurred_at,id) AS rank FROM marketing_conversions)
      SELECT c.*,l.first_name,l.last_name FROM canonical c LEFT JOIN sales_leads l ON l.id=c.lead_id
      LEFT JOIN customers customer ON customer.id=c.customer_id
      WHERE c.rank=1 AND (c.visitor_id=ANY($1::uuid[]) OR (c.visitor_id IS NULL AND (c.occurred_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date))
      AND ($5::boolean OR l.assignee_id=$6 OR (c.lead_id IS NULL AND customer.created_by_id=$6))
      AND ($7::boolean OR c.classification='observed')`,[visitors,f.timezone,from,to,admin.role==='super_admin',admin.userId,f.includeExcluded]),
  ])
  if(eventResult.rows.length>100000)throw new Error('Too many events. Narrow the report date range.')
  const attributionFor=(visitor:string)=>{
    const cohort=sessions.find(s=>s.visitor_id===visitor)
    const end=cohort?Math.min(Date.now(),new Date(cohort.cohort_at).getTime()+f.observationDays*86400000):Date.now()
    const ts=touchResult.rows.filter(t=>t.visitor_id===visitor&&new Date(t.occurred_at).getTime()<=end)
    return (f.model==='first'?ts[0]:ts.at(-1))?.attribution??{source:'unknown'}
  }
  const matches=(a:any)=>(!f.source||a.sourceId===f.source||a.source===f.source)&&(!f.campaign||a.campaign===f.campaign)&&(!f.channel||a.channel===f.channel)
  const selected=sessions.filter(s=>matches(attributionFor(s.visitor_id)))
  const selectedIds=new Set(selected.map(s=>s.id)),selectedVisitors=new Set(selected.map(s=>s.visitor_id))
  const events=eventResult.rows.filter(e=>selectedIds.has(e.session_id))
  const within=(s:any,at:any)=>new Date(at).getTime()>=new Date(s.cohort_at).getTime()&&new Date(at).getTime()<=Math.min(Date.now(),new Date(s.cohort_at).getTime()+f.observationDays*86400000)
  const conversions=conversionResult.rows.filter(c=>{
    const a=f.model==='first'?c.first_touch:c.last_touch
    return matches(a)&&(!f.funnel||c.funnel===f.funnel)&&(!c.visitor_id||sessions.some(s=>s.visitor_id===c.visitor_id&&s.funnel===c.funnel&&within(s,c.occurred_at)))
  })
  const stages=['Visitors','CTA visitors','Form starts','Successful leads','Confirmed bookings','Customers']
  const sets=stages.map(()=>new Set<string>())
  const cohorts=new Map<string,any>()
  for(const s of selected) cohorts.set(`${s.visitor_id}:${s.funnel}`,s)
  for(const [key,s] of cohorts) {
    sets[0].add(key)
    const ownSessions=new Set(selected.filter(x=>x.visitor_id===s.visitor_id&&x.funnel===s.funnel).map(x=>x.id))
    const ownEvents=events.filter(e=>ownSessions.has(e.session_id)&&within(s,e.occurred_at))
    let after=new Date(s.cohort_at).getTime()
    for(const [index,kind] of ['cta','form_start','lead','booking','customer'].entries()){
      const candidates=index<2?ownEvents.filter(e=>e.kind===kind):conversions.filter(c=>c.kind===kind&&c.visitor_id===s.visitor_id&&c.funnel===s.funnel)
      const next=candidates.map(e=>new Date(e.occurred_at).getTime()).filter(t=>t>=after).sort((a,b)=>a-b)[0]
      if(next===undefined) break
      sets[index+1].add(key);after=next
    }
  }
  const funnel=stages.map((label,i)=>({label,count:sets[i].size,denominator:i?sets[i-1].size:sets[0].size,
    precedingRate:(i?sets[i-1].size:sets[0].size)?sets[i].size/(i?sets[i-1].size:sets[0].size):null,
    overallRate:sets[0].size?sets[i].size/sets[0].size:null,dropoff:i?sets[i-1].size-sets[i].size:0}))
  // Repeat submissions and bookings remain in activity; allocate each unique
  // lead/customer once, at its earliest confirmed milestone.
  const canonical=new Map<string,any>()
  for(const c of conversions.sort((a,b)=>new Date(a.occurred_at).getTime()-new Date(b.occurred_at).getTime())){
    const key=['lead','booking','customer'].includes(c.kind)?`${c.kind}:${c.kind==='customer'?c.customer_id:c.lead_id}`:c.id
    if(!canonical.has(key))canonical.set(key,c)
  }
  const allocations=[...canonical.values()]
  const unique=(kind:string)=>new Set(allocations.filter(c=>c.kind===kind).map(c=>kind==='customer'?c.customer_id:c.lead_id)).size
  const currency:Record<string,{currency:string;gross:number;refunded:number;disputed:number;net:number}>={}
  for(const c of allocations.filter(c=>['payment','refund','dispute'].includes(c.kind))){
    const row=currency[c.currency]??={currency:c.currency,gross:0,refunded:0,disputed:0,net:0}
    const amount=Number(c.amount_cents)
    if(c.kind==='payment')row.gross+=amount
    if(c.kind==='refund')row.refunded+=amount
    if(c.kind==='dispute')row.disputed+=amount
    row.net=row.gross-row.refunded-row.disputed
  }
  const sourceMap=new Map<string,any>()
  for(const v of selectedVisitors){
    const a=attributionFor(v),key=JSON.stringify([a.sourceId??'',a.source,a.campaign??'',a.channel??''])
    if(!sourceMap.has(key))sourceMap.set(key,{source:a.source??'unknown',sourceId:a.sourceId??null,campaign:a.campaign??'',channel:a.channel??'',visitors:0,leads:0,bookings:0,customers:0})
    sourceMap.get(key).visitors++
  }
  for(const c of allocations){
    const a=f.model==='first'?c.first_touch:c.last_touch,key=JSON.stringify([a.sourceId??'',a.source,a.campaign??'',a.channel??''])
    if(!sourceMap.has(key))sourceMap.set(key,{source:a.source??'unattributed',sourceId:a.sourceId??null,campaign:a.campaign??'',channel:a.channel??'',visitors:0,leads:0,bookings:0,customers:0})
  }
  for(const row of sourceMap.values()){
    const own=allocations.filter(c=>{const a=f.model==='first'?c.first_touch:c.last_touch;return(a.sourceId??null)===row.sourceId&&(a.source??'unattributed')===row.source&&(a.campaign??'')===row.campaign&&(a.channel??'')===row.channel})
    for(const [field,kind] of [['leads','lead'],['bookings','booking'],['customers','customer']])row[field]=new Set(own.filter(c=>c.kind===kind).map(c=>kind==='customer'?c.customer_id:c.lead_id)).size
    const money=new Map<string,any>()
    for(const c of own.filter(c=>['payment','refund','dispute'].includes(c.kind))){
      const r=money.get(c.currency)??{currency:c.currency,gross:0,refunded:0,disputed:0,net:0}
      r[c.kind==='payment'?'gross':c.kind==='refund'?'refunded':'disputed']+=Number(c.amount_cents)
      r.net=r.gross-r.refunded-r.disputed;money.set(c.currency,r)
    }
    row.revenue=[...money.values()]
  }
  const videoMap=new Map<string,any>()
  for(const e of events.filter(e=>e.kind.startsWith('video_'))){
    const key=`${e.session_id}:${e.detail.video}:${e.detail.placement}`
    const row=videoMap.get(key)??{sessionId:e.session_id,video:e.detail.video,placement:e.detail.placement,intervals:[],elapsed:0,furthest:0,plays:0,errors:0}
    row.intervals.push(...(e.detail.intervals??[]));row.elapsed+=e.detail.elapsed??0;row.furthest=Math.max(row.furthest,e.detail.position??0)
    if(e.kind==='video_play')row.plays++
    if(e.kind==='video_error')row.errors++
    videoMap.set(key,row)
  }
  const videos=[...videoMap.values()].map(({intervals,...r})=>({...r,uniqueSeconds:contentSeconds(intervals),percent:contentSeconds(intervals)/240*100,
    repeatSeconds:Math.max(0,intervals.reduce((sum:number,[a,b]:[number,number])=>sum+b-a,0)-contentSeconds(intervals))}))
  const perViewer=new Map<string,any>()
  for(const row of videoMap.values()){
    const visitor=selected.find(s=>s.id===row.sessionId)?.visitor_id
    const key=`${visitor}:${row.video}:${row.placement}`
    const value=perViewer.get(key)??{video:row.video,placement:row.placement,intervals:[],elapsed:0}
    value.intervals.push(...row.intervals);value.elapsed+=row.elapsed;perViewer.set(key,value)
  }
  const videoAggregates=new Map<string,any>()
  for(const row of perViewer.values()){
    const key=`${row.video}:${row.placement}`
    const value=videoAggregates.get(key)??{video:row.video,placement:row.placement,viewers:0,uniqueSeconds:0,elapsed:0}
    value.viewers++;value.uniqueSeconds+=contentSeconds(row.intervals);value.elapsed+=row.elapsed;videoAggregates.set(key,value)
  }
  const pages=[...new Set(events.map(e=>e.page_id))].map(page=>({page,views:events.filter(e=>e.page_id===page&&e.kind==='page_view').length,clicks:events.filter(e=>e.page_id===page&&['cta','link_internal','link_outbound'].includes(e.kind)).length}))
  const watched=new Set<string>()
  for(const e of events.filter(e=>e.kind==='video_progress'&&contentSeconds(e.detail.intervals??[])>0)){
    const s=selected.find(s=>s.id===e.session_id)
    if(!s)continue
    const booking=conversions.filter(c=>c.kind==='booking'&&c.visitor_id===s.visitor_id).sort((a,b)=>new Date(a.occurred_at).getTime()-new Date(b.occurred_at).getTime())[0]
    if(e.page_id!=='confirmation'&&e.page_id!=='strategy-confirmation'&&(!booking||new Date(e.occurred_at)<new Date(booking.occurred_at)))watched.add(s.visitor_id)
  }
  const videoAssociation=[true,false].map(watch=>{
    const members=[...selectedVisitors].filter(id=>watched.has(id)===watch)
    const booked=new Set(conversions.filter(c=>c.kind==='booking'&&members.includes(c.visitor_id)).map(c=>c.visitor_id)).size
    return {label:watch?'Observed viewing before booking':'No observed viewing before booking',visitors:members.length,booked,rate:members.length?booked/members.length:null,smallSample:members.length<30}
  })
  const observedLeads=new Set(conversions.filter(c=>c.kind==='lead').map(c=>c.lead_id))
  const convertedLeads=new Set(conversions.filter(c=>c.kind==='customer'&&observedLeads.has(c.lead_id)).map(c=>c.lead_id))
  return {freshAt:new Date().toISOString(),lastOutcomeAt:conversionResult.rows.reduce((max:string|null,c)=>!max||new Date(c.recorded_at)>new Date(max)?new Date(c.recorded_at).toISOString():max,null),filters:{...f,from,to},totals:{visitors:selectedVisitors.size,sessions:selected.length,pageViews:events.filter(e=>e.kind==='page_view').length,
    ctaClicks:events.filter(e=>e.kind==='cta').length,ctaVisitors:new Set(events.filter(e=>e.kind==='cta').map(e=>selected.find(s=>s.id===e.session_id)?.visitor_id)).size,
    formStarts:new Set(events.filter(e=>e.kind==='form_start').map(e=>selected.find(s=>s.id===e.session_id)?.visitor_id)).size,
    leads:unique('lead'),bookings:unique('booking'),customers:unique('customer'),
    visitorToBookedRate:selectedVisitors.size?new Set(conversions.filter(c=>c.kind==='booking'&&selectedVisitors.has(c.visitor_id)).map(c=>c.visitor_id)).size/selectedVisitors.size:null,
    leadToCustomerRate:observedLeads.size?convertedLeads.size/observedLeads.size:null},
    funnel,sources:[...sourceMap.values()],pages,videos,videoAggregates:[...videoAggregates.values()],videoAssociation,revenue:Object.values(currency),
    contacts:[...new Map(conversions.filter(c=>c.lead_id).map(c=>[c.lead_id,{id:c.lead_id,name:`${c.first_name??''} ${c.last_name??''}`.trim()}])).values()],
    limitations:'Observed browsers, not verified people. First/last models are separate; last includes direct. Funnel uses ordered steps in the same entry cohort and observation window. Missing telemetry reduces totals. Video is diagnostic, not a required funnel step. Association is not causation; small samples are unreliable.'}
}
