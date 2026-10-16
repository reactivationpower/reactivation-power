import express from 'express'
import type { Server } from 'node:http'
import { afterAll,afterEach,beforeAll,expect,it,vi } from 'vitest'
const f=vi.hoisted(()=>({worker:vi.fn(async(_o?:unknown)=>{}),wake:vi.fn(async()=>{}),vercelWake:vi.fn(async()=>{}),notifications:vi.fn(async()=>({})),leadEmails:vi.fn(async(_a?:unknown,_b?:unknown)=>{}),invitations:vi.fn(async(_o?:unknown)=>{}),onboarding:vi.fn(async(_o?:unknown)=>({})),marketing:vi.fn(async()=>({})),runCronJob:vi.fn(async(..._a:unknown[])=>({ok:true,skipped:true,existing:null,reason:'already ran'})),texting:vi.fn(async(..._a:unknown[])=>({processed:0}))}))
vi.mock('@/lib/sales-leads/wake',()=>({NATIVE_WAKE_HEADER:'x-patient-pipeline-scheduler',NATIVE_WAKE_MARKER:'supabase-sales-v1',recordNativeWake:f.wake,recordVercelCronWake:f.vercelWake}))
vi.mock('@/lib/sales-leads/worker',()=>({runSalesWorker:f.worker}))
vi.mock('@/lib/billing/notifications',()=>({retryFailedNotifications:f.notifications}))
vi.mock('@/lib/lead-followup/notifications',()=>({deliverLeadEmails:f.leadEmails}))
vi.mock('@/lib/agreements/enrollment-invitation',()=>({retryPendingEnrollmentInvitations:f.invitations}))
vi.mock('@/lib/affiliates/onboarding-invitations',()=>({retryOnboardingInvitations:f.onboarding}))
vi.mock('@/lib/marketing/reconcile',()=>({reconcileMarketing:f.marketing,cleanupMarketing:vi.fn()}))
vi.mock('@/lib/patient-texting/worker',()=>({reconcileTextIntents:f.texting}))
vi.mock('@/lib/cron/jobs',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/cron/jobs')>(),currentDueKey:vi.fn(()=>'2026-09-22'),runCronJob:f.runCronJob}))
vi.mock('@/lib/request-context',()=>({runWithRequestContext:async(_req:unknown,_res:unknown,fn:()=>Promise<void>)=>fn()}))
const {default:router}=await import('../cron')
let server:Server,url:string
const auth={authorization:'Bearer sales-cron-test-only'}
beforeAll(async()=>{
  const app=express();app.use('/api',router);server=app.listen(0)
  await new Promise<void>(resolve=>server.on('listening',resolve))
  url=`http://127.0.0.1:${(server.address() as {port:number}).port}`
})
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks()})
afterAll(async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()))})
it.each([undefined,'wrong'])('rejects a missing/incorrect worker trigger secret (%s)',async token=>{
  vi.stubEnv('CRON_SECRET','sales-cron-test-only')
  const res=await fetch(url+'/api/cron/sales-leads',{headers:token?{authorization:`Bearer ${token}`}:{}})
  expect(res.status).toBe(401);expect(f.worker).not.toHaveBeenCalled()
})
it('rejects triggers when no server secret is configured',async()=>{
  vi.stubEnv('CRON_SECRET','')
  expect((await fetch(url+'/api/cron/sales-leads',{headers:auth})).status).toBe(401)
  expect(f.worker).not.toHaveBeenCalled()
})
it.each(['/api/cron/workers','/api/cron/sales-leads','/api/cron/lead-emails'])('runs the five-minute pass through the protected route %s',async path=>{
  vi.stubEnv('CRON_SECRET','sales-cron-test-only')
  const res=await fetch(url+path,{headers:auth})
  expect(res.status).toBe(200)
  const body=await res.json()
  expect(body).toMatchObject({ok:true,trigger:'http',steps:{leadEmails:'ok',enrollmentInvitations:'ok',onboardingInvitations:'ok',salesWorker:'ok',marketing:'ok'}})
  expect(f.worker).toHaveBeenCalledTimes(1)
  // Every worker gets a deadline inside the function limit; the daily slots are claimed with the leftover budget.
  expect(f.worker.mock.calls[0]?.[0]).toMatchObject({deadline:expect.any(Number)})
  expect(f.runCronJob).toHaveBeenCalledTimes(3)
  expect(f.runCronJob.mock.calls[0]?.[1]).toMatchObject({trigger:'http',dueKey:expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)})
})
it('records a Vercel Cron call as the vercel-cron trigger and a Vercel scheduler wake',async()=>{
  vi.stubEnv('CRON_SECRET','sales-cron-test-only');vi.stubEnv('VERCEL','1');vi.stubEnv('VERCEL_ENV','production');vi.stubEnv('SCHEDULED_JOBS','on')
  const headers={...auth,'user-agent':'vercel-cron/1.0'}
  const res=await fetch(url+'/api/cron/workers',{headers})
  expect(res.status).toBe(200);expect(await res.json()).toMatchObject({ok:true,trigger:'vercel-cron'})
  expect(f.runCronJob.mock.calls[0]?.[1]).toMatchObject({trigger:'vercel-cron'})
  expect(f.vercelWake).toHaveBeenCalledTimes(1);expect(f.wake).not.toHaveBeenCalled()
  f.runCronJob.mockResolvedValueOnce({ok:true,run:{id:'r1'},summary:{customers:0},incomplete:false} as never)
  expect(await (await fetch(url+'/api/cron/billing-retry',{headers})).json()).toMatchObject({ok:true,runId:'r1',incomplete:false})
  expect(f.runCronJob.mock.calls[3]).toMatchObject(['billing-retry',{trigger:'vercel-cron',dueKey:'2026-09-22'}])
})
it('a Vercel user-agent outside Vercel is just an external cron and never verifies the Vercel scheduler',async()=>{
  vi.stubEnv('CRON_SECRET','sales-cron-test-only')
  expect((await fetch(url+'/api/cron/workers',{headers:{...auth,'user-agent':'vercel-cron/1.0'}})).status).toBe(200)
  expect(f.vercelWake).not.toHaveBeenCalled()
})
it('a failing worker step does not fail the pass, and a scheduler wake is still recorded',async()=>{
  vi.stubEnv('CRON_SECRET','sales-cron-test-only')
  const headers={...auth,'x-patient-pipeline-scheduler':'supabase-sales-v1'}
  expect((await fetch(url+'/api/cron/sales-leads',{headers})).status).toBe(200)
  expect(f.wake).toHaveBeenCalledTimes(1)
  f.wake.mockClear()
  f.worker.mockRejectedValueOnce(new Error('Mock worker failure'))
  const res=await fetch(url+'/api/cron/sales-leads',{headers})
  expect(res.status).toBe(200);expect(await res.json()).toMatchObject({steps:{salesWorker:'failed',marketing:'ok'}})
  expect(f.wake).toHaveBeenCalledTimes(1)
})
it('refuses every cron route on a Vercel Preview deployment before touching anything',async()=>{
  vi.stubEnv('CRON_SECRET','sales-cron-test-only');vi.stubEnv('VERCEL','1');vi.stubEnv('VERCEL_ENV','preview')
  for(const path of ['/api/cron/workers','/api/cron/billing-retry','/api/cron/patient-texting']){
    const res=await fetch(url+path,{headers:{...auth,'user-agent':'vercel-cron/1.0'}})
    expect(res.status).toBe(503)
  }
  expect(f.worker).not.toHaveBeenCalled();expect(f.runCronJob).not.toHaveBeenCalled();expect(f.texting).not.toHaveBeenCalled()
})
it('patient-texting reconcile answers GET (what Vercel Cron sends) as well as POST, with a deadline',async()=>{
  vi.stubEnv('CRON_SECRET','sales-cron-test-only')
  for(const method of ['GET','POST']){
    const res=await fetch(url+'/api/cron/patient-texting',{method,headers:auth})
    expect(res.status).toBe(200);expect(await res.json()).toEqual({processed:0})
  }
  expect(f.texting).toHaveBeenCalledTimes(2)
  expect(f.texting.mock.calls[0]?.[1]).toMatchObject({deadline:expect.any(Number)})
})
