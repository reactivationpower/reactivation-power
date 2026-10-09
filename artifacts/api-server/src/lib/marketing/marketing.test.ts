import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { batchSchema, contextSchema, cleanContext, approvedPath } from './validation'
import { contentSeconds, unionIntervals } from '@workspace/shared/marketing-analytics'
const fixture=vi.hoisted(()=>({pool:null as any}))
vi.mock('@workspace/db',()=>({pool:{query:(...a:any[])=>fixture.pool.query(...a),connect:()=>fixture.pool.connect()}}))
import { establish, ingest, associate, identity, rateLimit, trustedConversion } from './store'
import { cleanupMarketing, reconcileMarketing, eraseMarketingHistory } from './reconcile'
import { marketingReport } from './report'
describe('closed telemetry contract',()=>{
  const event={id:randomUUID(),version:1,at:new Date().toISOString(),page:'home',type:'page_view'}
  it('rejects trusted outcomes and unknown payload properties',()=>{
    for(const type of ['booking_confirmed','payment','customer','lead']) expect(batchSchema.safeParse({sessionId:randomUUID(),events:[{...event,type}]}).success).toBe(false)
    for(const key of ['email','url','stack','token','formValues'])expect(batchSchema.safeParse({sessionId:randomUUID(),events:[{...event,[key]:'secret'}]}).success).toBe(false)
  })
  it('bounds batches and video intervals',()=>{
    expect(batchSchema.safeParse({sessionId:randomUUID(),events:Array(41).fill(event)}).success).toBe(false)
    for(const intervals of [[[0,241]],[[10,1]],[[0,20]]])expect(batchSchema.safeParse({sessionId:randomUUID(),events:[{...event,type:'video_progress',video:'walkthrough',placement:'test',intervals}]}).success).toBe(false)
  })
  it('sanitizes campaign labels/referrers without accepting URLs or personal values',()=>{
    const result=cleanContext(contextSchema.parse({page:'home',utm:{utm_source:'Newsletter',utm_campaign:'test@example.com',email:'private'},referrer:'https://example.com/private'}))
    expect(result).toEqual({utm:{utm_source:'Newsletter'},referrer:null})
    expect(cleanContext({page:'home',device:'desktop',referrer:'www.example.com'}).referrer).toBe('www.example.com')
  })
  it('rejects redirect traversal, protocol URLs and protected pages',()=>{
    for(const path of ['//evil.com','/../admin','/%2e%2e/admin','/admin','/api/actions','/portal','/hello?next=x','/a\\b'])expect(approvedPath(path)).toBe(false)
    expect(approvedPath('/strategy-call')).toBe(true)
  })
  it('unions overlapping/replayed content and caps duration, never substitutes furthest position',()=>{
    expect(contentSeconds([[0,5],[100,105],[0,5],[4,7]])).toBe(12)
    expect(contentSeconds([[-5,260],[0,240]])).toBe(240)
    expect(unionIntervals([[10,12],[1,2],[2,4]])).toEqual([[1,4],[10,12]])
  })
})
describe('marketing persistence in isolated schema',()=>{
  let adminPool:any,schema:string,leadA:string,leadB:string
  beforeAll(async()=>{
    const actual=await vi.importActual<any>('@workspace/db')
    const config={...actual.pool.options,max:2}
    adminPool=new actual.pool.constructor(config)
    schema=`marketing_test_${randomUUID().replaceAll('-','')}`
    await adminPool.query(`CREATE SCHEMA "${schema}"`)
    fixture.pool=new actual.pool.constructor({...config,options:`-c search_path=${schema}`})
    await fixture.pool.query('CREATE TABLE sales_leads(id text PRIMARY KEY,assignee_id text,first_name text,last_name text)')
    await fixture.pool.query('CREATE TABLE customers(id text PRIMARY KEY,created_by_id text)')
    await fixture.pool.query(`ALTER TABLE sales_leads ADD COLUMN customer_id text;
      CREATE TABLE sales_submissions(lead_id text,historical boolean,dedupe_key text,context jsonb,submitted_at timestamptz);
      CREATE TABLE sales_activities(id text,lead_id text,kind text,status text,provider_id text,occurred_at timestamptz);
      CREATE TABLE payment_link_terms(customer_id text,completed_at timestamptz);
      CREATE TABLE payment_history(id text,customer_id text,kind text,status text,amount_cents bigint,currency text,stripe_refund_id text,
        stripe_charge_id text,stripe_payment_intent_id text,stripe_invoice_id text,occurred_at timestamptz);
      CREATE TABLE affiliate_disputes(id text,charge_key text,amount_cents bigint,status text,occurred_at timestamptz,updated_event_at timestamptz,cash_loss boolean);`)
    await fixture.pool.query(readFileSync(new URL('../../../../../lib/db/migrations/0032_marketing_analytics.sql',import.meta.url),'utf8'))
  },60000)
  beforeEach(async()=>{
    await fixture.pool.query('TRUNCATE marketing_conversions,marketing_audit,marketing_daily_totals,marketing_limits,marketing_visitors,sales_leads,sales_submissions,sales_activities,payment_link_terms,payment_history,affiliate_disputes CASCADE')
    leadA=randomUUID();leadB=randomUUID()
    await fixture.pool.query('INSERT INTO sales_leads(id,assignee_id,first_name,last_name) VALUES($1,$3,$4,$5),($2,$6,$4,$5)',[leadA,leadB,'rep-a','Fixture','Lead','rep-b'])
  })
  afterAll(async()=>{
    await fixture.pool?.end()
    if(adminPool){await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await adminPool.end()}
  })
  const open=()=>establish(null,{page:'home',device:'desktop'},'test')
  const event=(type='page_view',extra={})=>({id:randomUUID(),version:1 as const,at:new Date().toISOString(),page:'home',type,...extra}) as any
  it('rejects forged visitor secrets and stale identities',async()=>{
    const first=await open()
    expect(await identity(first.cookie)).toBeTruthy()
    expect(await identity(first.cookie!.slice(0,-1)+'!')).toBeNull()
    await fixture.pool.query("UPDATE marketing_visitors SET expires_at=now()-interval '1 second'")
    expect(await identity(first.cookie)).toBeNull()
  })
  it('deduplicates concurrent/out-of-order events and refuses another browser session',async()=>{
    const first=await open(),other=await open(),e=event()
    await Promise.all([ingest(first.cookie,first.sessionId,[e]),ingest(first.cookie,first.sessionId,[e])])
    expect(await ingest(other.cookie,first.sessionId,[event()])).toBe(false)
    expect((await fixture.pool.query('SELECT count(*) FROM marketing_events')).rows[0].count).toBe('1')
  })
  it('links anonymous sessions only to authoritative lead and rotates on a different identity',async()=>{
    const first=await open()
    await associate(first.cookie,leadA,'submission-a')
    const rotated=await associate(first.cookie,leadB,'submission-b')
    expect(rotated).toBeTruthy()
    const sessions=(await fixture.pool.query('SELECT lead_id FROM marketing_sessions')).rows
    expect(sessions).toEqual([{lead_id:leadA}])
    const b=(await fixture.pool.query('SELECT * FROM marketing_conversions WHERE lead_id=$1',[leadB])).rows[0]
    expect(b.session_id).toBeNull()
    expect(b.first_touch.source).toBe('unknown')
    expect(await ingest(rotated,first.sessionId,[event()])).toBe(false)
  })
  it('preserves source snapshots after edits/archive and includes new direct sessions',async()=>{
    const source=randomUUID(),link=randomUUID(),code=randomUUID().replaceAll('-','').slice(0,16)
    await fixture.pool.query('INSERT INTO marketing_sources(id,name) VALUES($1,$2)',[source,'Original'])
    await fixture.pool.query("INSERT INTO marketing_links(id,source_id,code,campaign,channel,page_id) VALUES($1,$2,$3,'Launch','Email','home')",[link,source,code])
    const first=await establish(null,{page:'home',device:'desktop',source:code},'test')
    await associate(first.cookie,leadA,'submission')
    await fixture.pool.query("UPDATE marketing_sources SET name='Changed',active=false WHERE id=$1",[source])
    await fixture.pool.query("UPDATE marketing_sessions SET last_at=now()-interval '31 minutes' WHERE id=$1",[first.sessionId])
    await establish(first.cookie,{page:'home',device:'desktop'},'test')
    await trustedConversion(fixture.pool,{id:'booking:one',kind:'booking',leadId:leadA,at:new Date()})
    const lead=(await fixture.pool.query("SELECT * FROM marketing_conversions WHERE kind='lead'")).rows[0]
    const booked=(await fixture.pool.query("SELECT * FROM marketing_conversions WHERE kind='booking'")).rows[0]
    expect(lead.first_touch.source).toBe('Original')
    expect(lead.last_touch.source).toBe('Original')
    expect(booked.first_touch.source).toBe('Original')
    expect(booked.last_touch.source).toBe('direct')
  })
  it('internal page navigation is not a new direct acquisition',async()=>{
    const first=await open()
    await establish(first.cookie,{page:'schedule',device:'desktop'},'test')
    expect((await fixture.pool.query('SELECT count(*) FROM marketing_touches')).rows[0].count).toBe('1')
    await establish(first.cookie,{page:'home',device:'desktop',entry:true},'test')
    expect((await fixture.pool.query('SELECT count(*) FROM marketing_touches')).rows[0].count).toBe('2')
  })
  it('separates strategy funnel while shared calendar keeps strategy context',async()=>{
    const first=await open()
    const strategy=await establish(first.cookie,{page:'strategy',device:'desktop'},'test')
    const calendar=await establish(first.cookie,{page:'calendar',device:'desktop'},'test')
    expect(strategy.sessionId).not.toBe(first.sessionId)
    expect(calendar.sessionId).toBe(strategy.sessionId)
  })
  it('limits persist across callers',async()=>{
    expect(await rateLimit('fixture',2)).toBe(true);expect(await rateLimit('fixture',2)).toBe(true)
    expect(await rateLimit('fixture',2)).toBe(false)
  })
  it('retention aggregates once without deleting conversion/financial evidence',async()=>{
    const first=await open()
    await ingest(first.cookie,first.sessionId,[event()])
    await associate(first.cookie,leadA,'retained')
    await fixture.pool.query("UPDATE marketing_events SET received_at=now()-interval '181 days'")
    await cleanupMarketing();await cleanupMarketing()
    expect((await fixture.pool.query('SELECT sum(events) FROM marketing_daily_totals')).rows[0].sum).toBe('1')
    expect((await fixture.pool.query('SELECT count(*) FROM marketing_conversions')).rows[0].count).toBe('1')
  })
  it('excludes test visitors by default and scopes rep reports to assigned leads',async()=>{
    const first=await open()
    await associate(first.cookie,leadA,'one')
    const root={role:'super_admin',userId:'root'}
    expect((await marketingReport(root,{})).totals.visitors).toBe(0)
    expect((await marketingReport(root,{includeExcluded:true})).totals.visitors).toBe(1)
    expect((await marketingReport({role:'sales_rep',userId:'rep-b'},{includeExcluded:true})).totals.visitors).toBe(0)
  })
  for(const operation of ['remove','expire']){
    it(`${operation} scrubs behavioral attribution but preserves reportable money`,async()=>{
      const first=await open()
      await associate(first.cookie,leadA,'privacy')
      await trustedConversion(fixture.pool,{id:'payment:privacy',kind:'payment',leadId:leadA,amount:1000,currency:'usd',at:new Date()})
      if(operation==='remove')await eraseMarketingHistory(leadA,'fixture')
      else{
        await fixture.pool.query("UPDATE marketing_sessions SET last_at=now()-interval '181 days'")
        await fixture.pool.query("UPDATE marketing_visitors SET expires_at=now()-interval '1 day'")
        await cleanupMarketing()
      }
      const rows=(await fixture.pool.query('SELECT * FROM marketing_conversions WHERE lead_id=$1',[leadA])).rows
      for(const row of rows)expect(row).toMatchObject({visitor_id:null,session_id:null,funnel:null,first_touch:{source:'unattributed'},last_touch:{source:'unattributed'}})
      expect((await fixture.pool.query('SELECT count(*) FROM marketing_sessions WHERE lead_id=$1',[leadA])).rows[0].count).toBe('0')
      const report=await marketingReport({role:'super_admin',userId:'root'},{includeExcluded:true})
      expect(report.revenue[0].net).toBe(1000)
      expect(report.totals.leads).toBe(1)
    })
  }
  it('deduplicates business IDs and keeps currencies and refunds separate',async()=>{
    const first=await open()
    await associate(first.cookie,leadA,'one')
    for(const id of ['customer:one','customer:one'])await trustedConversion(fixture.pool,{id,kind:'customer',leadId:leadA,customerId:'one',at:new Date()})
    for(const [id,kind,amount,currency] of [['paid','payment',10000,'usd'],['refund','refund',2000,'usd'],['euro','payment',5000,'eur']] as const)
      await trustedConversion(fixture.pool,{id,kind,leadId:leadA,customerId:'one',at:new Date(),amount,currency})
    const report=await marketingReport({role:'super_admin',userId:'root'},{includeExcluded:true})
    expect(report.totals.customers).toBe(1)
    expect(report.revenue.find(r=>r.currency==='usd')?.net).toBe(8000)
    expect(report.revenue.find(r=>r.currency==='eur')?.net).toBe(5000)
  })
  it('recovers durable business outcomes exactly once including dispute recovery',async()=>{
    const first=await open(),visitor=await identity(first.cookie)
    await fixture.pool.query("INSERT INTO sales_submissions VALUES($1,false,'landing:recover',$2,now())",[leadA,JSON.stringify({marketingVisitorId:visitor.id})])
    await fixture.pool.query("INSERT INTO sales_activities VALUES('a',$1,'appointment','confirmed','provider-confirmed',now())",[leadA])
    await fixture.pool.query("UPDATE sales_leads SET customer_id='customer-fixture' WHERE id=$1",[leadA])
    await fixture.pool.query("INSERT INTO payment_link_terms VALUES('customer-fixture',now())")
    await fixture.pool.query(`INSERT INTO payment_history VALUES
      ('payment','customer-fixture','invoice_paid','succeeded',10000,'usd',null,'charge','intent','invoice',now()),
      ('duplicate','customer-fixture','invoice_paid','succeeded',10000,'usd',null,'charge','intent','invoice',now()),
      ('pending','customer-fixture','invoice_failed','failed',10000,'usd',null,'pending','pending','pending',now()),
      ('refund','customer-fixture','refund','refunded',2000,'usd','refund-one','charge','intent',null,now())`)
    await fixture.pool.query("INSERT INTO affiliate_disputes VALUES('d','charge',1000,'lost',now(),now(),true)")
    await reconcileMarketing();await reconcileMarketing()
    const result=await marketingReport({role:'super_admin',userId:'root'},{includeExcluded:true})
    expect(result.totals.bookings).toBe(1);expect(result.totals.customers).toBe(1)
    expect(result.revenue[0]).toMatchObject({gross:10000,refunded:2000,disputed:1000,net:7000})
    await fixture.pool.query("UPDATE affiliate_disputes SET status='won',updated_event_at=now()")
    await reconcileMarketing();await reconcileMarketing()
    expect((await marketingReport({role:'super_admin',userId:'root'},{includeExcluded:true})).revenue[0].net).toBe(8000)
  })
})
