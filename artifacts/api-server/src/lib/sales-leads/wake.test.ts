import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest'
const f=vi.hoisted(()=>({cfg:{automation_enabled:false,capabilities:{} as Record<string,any>},query:vi.fn()}))
vi.mock('./store',()=>({settings:async()=>f.cfg,transaction:async(fn:any)=>fn({query:f.query})}))
import {configureNativeWake,nativeWakeCommand,recordNativeWake,recordVercelCronWake,retireNativeWake,schedulerHealthy} from './wake'
beforeEach(()=>{
  f.cfg={automation_enabled:false,capabilities:{}}
  f.query.mockImplementation(async(sql:string)=>({rows:sql.includes('cron.schedule')?[{id:42}]:sql.includes('SELECT EXISTS')?[{active:true}]:[]}))
})
afterEach(()=>{vi.unstubAllEnvs();vi.clearAllMocks()})
describe('independent Supabase sales wake',()=>{
  it('keeps secrets out of durable job text and only targets the verified first-party endpoint',()=>{
    const command=nativeWakeCommand('https://patientpipeline.app/api/cron/sales-leads')
    expect(command).toContain('vault.decrypted_secrets')
    expect(command).toContain('supabase-sales-v1')
    expect(command).toContain('extensions.http(')
    expect(command).not.toContain('net.http_get')
    for(const target of ['http://patientpipeline.app/api/cron/sales-leads','https://example.com/api/cron/sales-leads','https://patientpipeline.app/api/cron/sales-leads?token=abc','https://patientpipeline.app/admin','https://user:pass@patientpipeline.app/api/cron/sales-leads']) expect(()=>nativeWakeCommand(target)).toThrow()
  })
  it('provisions one named five-minute job and leaves automation disabled/pending a production wake',async()=>{
    vi.stubEnv('CRON_SECRET','opaque-test-only-token')
    const result=await configureNativeWake('https://patientpipeline.app/api/cron/sales-leads')
    expect(result).toMatchObject({jobId:42,schedule:'*/5 * * * *',automationEnabled:false})
    const job=f.query.mock.calls.find(([sql])=>sql.includes('cron.schedule'))![1]
    expect(job[2]).not.toContain('opaque-test-only-token')
    const status=f.query.mock.calls.find(([sql])=>sql.includes('UPDATE sales_settings'))![1][0]
    expect(JSON.parse(status).scheduler_wake.state).toBe('pending')
  })
  it('refuses to configure without the existing secret or while SMS automation is enabled',async()=>{
    vi.stubEnv('CRON_SECRET','')
    await expect(configureNativeWake('https://patientpipeline.app/api/cron/sales-leads')).rejects.toThrow('CRON_SECRET')
    vi.stubEnv('CRON_SECRET','opaque-test-only-token');f.cfg.automation_enabled=true
    await expect(configureNativeWake('https://patientpipeline.app/api/cron/sales-leads')).rejects.toThrow('Disable')
    expect(f.query.mock.calls.some(([sql])=>sql.includes('vault.create_secret'))).toBe(false)
  })
  it('does not let workspace/manual activity verify production wake readiness',async()=>{
    vi.stubEnv('NODE_ENV','development')
    await recordNativeWake()
    expect(f.query).not.toHaveBeenCalled()
  })
  it('verifies an active configured native job after a production wake',async()=>{
    vi.stubEnv('NODE_ENV','production');f.cfg.capabilities.native_scheduler={jobId:42}
    await recordNativeWake()
    const status=f.query.mock.calls.find(([sql])=>sql.includes('UPDATE sales_settings'))![1][0]
    expect(JSON.parse(status).state).toBe('verified')
    expect(schedulerHealthy({scheduler_wake:JSON.parse(status)})).toBe(true)
  })
  it('a Vercel Cron wake verifies the same scheduler capability, only from the Vercel production deployment',async()=>{
    vi.stubEnv('NODE_ENV','production')
    await recordVercelCronWake()
    expect(f.query).not.toHaveBeenCalled()
    vi.stubEnv('VERCEL','1');vi.stubEnv('VERCEL_ENV','preview')
    await recordVercelCronWake()
    expect(f.query).not.toHaveBeenCalled()
    vi.stubEnv('VERCEL_ENV','production')
    await recordVercelCronWake()
    const status=f.query.mock.calls.find(([sql])=>sql.includes('UPDATE sales_settings'))![1][0]
    expect(JSON.parse(status)).toMatchObject({state:'verified',source:'vercel-cron'})
    expect(schedulerHealthy({scheduler_wake:JSON.parse(status)})).toBe(true)
  })
  it('retiring the Supabase wake unschedules its job and marks the capability retired',async()=>{
    f.cfg.capabilities.native_scheduler={jobId:42}
    expect(await retireNativeWake()).toEqual({retiredJobId:42})
    expect(f.query.mock.calls.some(([sql,params])=>sql.includes('cron.unschedule')&&params[0]===42)).toBe(true)
    const native=f.query.mock.calls.find(([sql])=>sql.includes("'{native_scheduler}'"))![1][0]
    expect(JSON.parse(native)).toMatchObject({state:'retired',jobId:null})
  })
  it('blocks stale, unknown, failed and future-dated heartbeat evidence',()=>{
    const now=Date.now()
    for(const wake of [undefined,{state:'pending'},{state:'verified',checkedAt:new Date(now-600_000).toISOString()},{state:'verified',checkedAt:new Date(now+60_000).toISOString()}]) expect(schedulerHealthy({scheduler_wake:wake},now)).toBe(false)
  })
})
