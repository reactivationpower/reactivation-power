import express from 'express'
import type { Server } from 'node:http'
import { afterAll,afterEach,beforeAll,expect,it,vi } from 'vitest'
const f=vi.hoisted(()=>({worker:vi.fn(async()=>{}),wake:vi.fn(async()=>{}),notifications:vi.fn(async()=>({})),leadEmails:vi.fn(async()=>{}),invitations:vi.fn(async()=>{})}))
vi.mock('@/lib/sales-leads/wake',()=>({NATIVE_WAKE_HEADER:'x-patient-pipeline-scheduler',NATIVE_WAKE_MARKER:'supabase-sales-v1',recordNativeWake:f.wake}))
vi.mock('@/lib/sales-leads/worker',()=>({runSalesWorker:f.worker}))
vi.mock('@/lib/billing/notifications',()=>({retryFailedNotifications:f.notifications}))
vi.mock('@/lib/lead-followup/notifications',()=>({deliverLeadEmails:f.leadEmails}))
vi.mock('@/lib/agreements/enrollment-invitation',()=>({retryPendingEnrollmentInvitations:f.invitations}))
vi.mock('@/lib/cron/jobs',()=>({currentDueKey:vi.fn(),runCronJob:vi.fn()}))
vi.mock('@/lib/request-context',()=>({runWithRequestContext:async(_req:unknown,_res:unknown,fn:()=>Promise<void>)=>fn()}))
const {default:router}=await import('../cron')
let server:Server,url:string
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
  expect((await fetch(url+'/api/cron/sales-leads',{headers:{authorization:'Bearer sales-cron-test-only'}})).status).toBe(401)
  expect(f.worker).not.toHaveBeenCalled()
})
it.each(['/api/cron/sales-leads','/api/cron/lead-emails'])('wakes the worker through the protected external schedule route %s',async path=>{
  vi.stubEnv('CRON_SECRET','sales-cron-test-only')
  const res=await fetch(url+path,{headers:{authorization:'Bearer sales-cron-test-only'}})
  expect(res.status).toBe(200);expect(await res.json()).toEqual({ok:true});expect(f.worker).toHaveBeenCalledTimes(1)
})
it('records scheduler readiness only for an authenticated native wake after worker success',async()=>{
  vi.stubEnv('CRON_SECRET','sales-cron-test-only')
  const headers={authorization:'Bearer sales-cron-test-only','x-patient-pipeline-scheduler':'supabase-sales-v1'}
  expect((await fetch(url+'/api/cron/sales-leads',{headers})).status).toBe(200)
  expect(f.wake).toHaveBeenCalledTimes(1)
  f.wake.mockClear()
  f.worker.mockRejectedValueOnce(new Error('Mock worker failure'))
  expect((await fetch(url+'/api/cron/sales-leads',{headers})).status).toBe(500)
  expect(f.wake).not.toHaveBeenCalled()
})
