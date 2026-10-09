import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
/** Isolated schema only, including FKs. No public application tables and no
 * provider calls are reachable from these tests. */
const fixture = vi.hoisted(() => ({ pool: null as any }))
const delivery = vi.hoisted(() => ({
  contact: vi.fn(), contactPage: vi.fn(), appointments: vi.fn(), conversations: vi.fn(), messages: vi.fn(), notes: vi.fn(), provider: vi.fn(),
}))
vi.mock('@workspace/db', () => ({ pool: {
  query: (...args: any[]) => fixture.pool.query(...args),
  connect: () => fixture.pool.connect(),
} }))
import { activity, intake, stop, transaction } from './store'
import { ingestMessages, ingestProviderFacts } from './ingestion'
import { logSalesCall, updateSalesLead } from '@/actions/sales-leads'
vi.mock('@/lib/auth/admin-session', () => ({ requireAdmin: vi.fn(async () => ({ userId: 'fixture-admin', name: 'Fixture', email: 'fixture@example.invalid', role: 'super_admin' })) }))
vi.mock('@/lib/data/admin-users', () => ({ listAdminUsers: async () => [], getAdminUserById: async () => null }))
vi.mock('@/lib/sales-leads/worker', () => ({ runSalesWorker: vi.fn(async () => {}) }))
vi.mock('@/lib/sales-leads/provider', async importOriginal => ({
  ...await importOriginal<any>(), ...delivery, contactUrl: () => null, verifyCapabilities: vi.fn(), safeSalesUpsert: vi.fn(),
}))
vi.mock('@/lib/affiliates/attribution', () => ({ resolveQualifiedReferral: vi.fn(), attachCustomerReferral: vi.fn() }))
vi.mock('@/lib/mail/send', () => ({ sendEmail: vi.fn() }))
const schema = `sales_fixture_${randomUUID().replaceAll('-', '')}`
const input = (key: string, extra: any = {}) => ({ firstName: 'Fixture', lastName:'Lead', email:'fixture@example.invalid', phone:'+12125550199', practiceName:'Fixture Practice',
  source:'website', sourcePath:'/strategy-call/schedule', context:{ valueAdjusted:'no', utm_source:'fixture' }, consent:true, consentEvidence:{ checked:true, timestamp:new Date().toISOString() },
  timezone:'America/New_York', dedupeKey:key, ...extra })
describe.skipIf(!process.env.SUPABASE_DB_URL)('internal sales durable storage (isolated schema)', () => {
  let adminPool: any
  beforeAll(async () => {
    const u = new URL(process.env.SUPABASE_DB_URL!); u.searchParams.delete('sslmode')
    const config = { connectionString:u.toString(), ssl:{ rejectUnauthorized:false }, max:1 }
    const actual = await vi.importActual<any>('@workspace/db')
    const Pool = actual.pool.constructor
    adminPool = new Pool(config)
    await adminPool.query(`CREATE SCHEMA "${schema}"`)
    fixture.pool = new Pool({ ...config, max:2, options:`-c search_path=${schema}` })
    // Load all table/index DDL, redirecting the generated schema-qualified FKs.
    const ddl = readFileSync(new URL('../../../../../lib/db/migrations/0029_bitter_ultragirl.sql', import.meta.url), 'utf8')
      .split('ALTER TABLE sales_leads ENABLE ROW LEVEL SECURITY;')[0].replaceAll('"public"."sales_leads"', `"${schema}"."sales_leads"`).replaceAll('--> statement-breakpoint','')
    await fixture.pool.query(ddl)
    await fixture.pool.query('CREATE TABLE customers(id text PRIMARY KEY,email text NOT NULL)')
  })
  beforeEach(async () => {
    vi.useRealTimers(); vi.clearAllMocks()
    delivery.contact.mockResolvedValue({ id:'fixture-ghl', dnd:false, firstName:'Fixture', lastName:'Lead', email:'fixture@example.invalid' })
    delivery.appointments.mockResolvedValue([]); delivery.conversations.mockResolvedValue([]); delivery.notes.mockResolvedValue([])
    delivery.provider.mockResolvedValue({ messageId:'fixture-message' })
    await fixture.pool.query('TRUNCATE customers,sales_imports,sales_activities,sales_jobs,sales_submissions,sales_leads,sales_merge_reviews,sales_settings CASCADE')
  })
  afterAll(async () => { if (fixture.pool) await fixture.pool.end(); if (adminPool) { await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await adminPool.end() } })
  it('persists complete repeated submissions, keeps canonical staff details and prior notes', async () => {
    const first = await intake(input('a'))
    await transaction(c => activity(c, first.id, { kind:'note', body:'Read me before calling', authorName:'Fixture' }))
    await intake(input('b',{ firstName:'Different', context:{ inactiveAdjusted:'no', value:3000 } }))
    const lead = (await fixture.pool.query('SELECT * FROM sales_leads')).rows[0]
    expect(lead.first_name).toBe('Fixture')
    expect((await fixture.pool.query('SELECT * FROM sales_submissions')).rows).toHaveLength(2)
    expect((await fixture.pool.query("SELECT * FROM sales_activities WHERE kind='note'")).rows[0].body).toBe('Read me before calling')
  })
  it('deduplicates repeated ingestion and concurrent intake', async () => {
    const results = await Promise.all([intake(input('a')), intake(input('a')), intake(input('b'))])
    expect(new Set(results.map(r => r.id)).size).toBe(1)
    expect((await fixture.pool.query('SELECT count(*) FROM sales_submissions')).rows[0].count).toBe('2')
  })
  it('reviews shared-phone/different-email identities rather than erasing them', async () => {
    await intake(input('a'))
    const next = await intake(input('b',{ email:'other@example.invalid' }))
    expect(next.review).toBe(true)
    expect((await fixture.pool.query("SELECT * FROM sales_merge_reviews WHERE state='pending'")).rows).toHaveLength(1)
    expect((await fixture.pool.query('SELECT * FROM sales_leads')).rows).toHaveLength(1)
  })
  it('imports preserve source dates and never infer consent or create automatic jobs', async () => {
    const result = await intake(input('historic',{ historical:true, providerId:'ghl-fixture', submittedAt:'2020-01-01T12:00:00Z' }))
    const lead = (await fixture.pool.query('SELECT * FROM sales_leads WHERE id=$1',[result.id])).rows[0]
    expect(lead.created_at.toISOString()).toBe('2020-01-01T12:00:00.000Z')
    expect(lead.consent).toBe(false)
    expect((await fixture.pool.query('SELECT * FROM sales_jobs')).rows).toHaveLength(0)
  })
  it('requires disposition and next followup; persists author and nonterminal Not Now task', async () => {
    const { id } = await intake(input('a'))
    await expect(logSalesCall(id,{ disposition: '' as any, notes:'' })).rejects.toThrow('disposition')
    await expect(logSalesCall(id,{ disposition:'Not Now', notes:'' })).rejects.toThrow('follow-up')
    await logSalesCall(id,{ disposition:'Not Now', notes:'Asked us to check next week', confirmedSuggestedSlot:true })
    const call = (await fixture.pool.query("SELECT * FROM sales_activities WHERE kind='call'")).rows[0]
    expect(call.author_name).toBe('Fixture')
    expect(call.next_followup_at).toBeTruthy()
    expect((await fixture.pool.query('SELECT stage,automation_state FROM sales_leads')).rows[0]).toMatchObject({ stage:'Not Now', automation_state:'call_outcome' })
  })
  it('duplicate inbound STOP cancels sends and queues exactly one reply notice', async () => {
    const { id } = await intake(input('a'))
    await fixture.pool.query("UPDATE sales_leads SET assignee_id='fixture-admin' WHERE id=$1",[id])
    await fixture.pool.query("INSERT INTO sales_jobs(id,lead_id,kind,dedupe_key) VALUES('sms-fixture',$1,'sms','sms-fixture')",[id])
    const message = { id:'m1', type:2, messageType:'TYPE_SMS', direction:'inbound', body:'STOP', dateAdded:new Date().toISOString(), status:'received' }
    await ingestMessages(id,[message]); await ingestMessages(id,[message])
    expect((await fixture.pool.query('SELECT dnd,automation_state FROM sales_leads')).rows[0]).toMatchObject({ dnd:true, automation_state:'opted_out' })
    expect((await fixture.pool.query("SELECT state FROM sales_jobs WHERE id='sms-fixture'")).rows[0].state).toBe('cancelled')
    expect((await fixture.pool.query("SELECT * FROM sales_jobs WHERE kind='reply_email'")).rows).toHaveLength(1)
  })
  it('provider false DND never clears refusal; a booking cancels pending automation', async () => {
    const { id } = await intake(input('a'))
    await fixture.pool.query('UPDATE sales_leads SET dnd=true WHERE id=$1',[id])
    await ingestProviderFacts(id,{ dnd:false, firstName:'Stale' },[{ id:'appt1', appointmentStatus:'confirmed', startTime:'2027-01-01T12:00:00Z' }])
    const lead = (await fixture.pool.query('SELECT * FROM sales_leads')).rows[0]
    expect(lead.dnd).toBe(true); expect(lead.first_name).toBe('Fixture'); expect(lead.stage).toBe('Strategy Call Booked')
  })
  it('never infers timezone from a reply and rejects a stale contact revision', async () => {
    const { id } = await intake(input('a'))
    await ingestMessages(id,[{ id:'m1', type:2, messageType:'TYPE_SMS', direction:'inbound', body:'I am in California now', dateAdded:new Date().toISOString() }])
    expect((await fixture.pool.query('SELECT timezone FROM sales_leads')).rows[0].timezone).toBe('America/New_York')
    await expect(updateSalesLead(id,{ revision:1, firstName:'Overwritten' })).rejects.toThrow('Reload')
    expect((await fixture.pool.query('SELECT first_name FROM sales_leads')).rows[0].first_name).toBe('Fixture')
  })
  async function preparedSms() {
    vi.useFakeTimers({ toFake:['Date'] }); vi.setSystemTime(new Date('2026-10-09T16:00:00Z'))
    const result = await intake(input('send',{ providerId:'fixture-ghl', submittedAt:'2026-10-09T15:00:00Z' }))
    await fixture.pool.query('DELETE FROM sales_jobs')
    await fixture.pool.query("UPDATE sales_leads SET automation_state='active' WHERE id=$1",[result.id])
    await fixture.pool.query(`UPDATE sales_settings SET automation_enabled=true,capabilities=$1 WHERE id='internal'`,[JSON.stringify({sms_write:{state:'operator_confirmed'},scheduler_wake:{state:'verified',checkedAt:new Date().toISOString()}})])
    await fixture.pool.query(`INSERT INTO sales_jobs(id,lead_id,kind,dedupe_key,due_at) VALUES('sms-fixture',$1,'sms','sms-fixture',$2)`,[result.id,new Date()])
    const worker = await vi.importActual<typeof import('./worker')>('./worker')
    return { ...result, worker }
  }
  it('two instances claim each due job only once', async () => {
    const { worker } = await preparedSms()
    const claimed = await Promise.all([worker.claimSalesJob(),worker.claimSalesJob()])
    expect(claimed.filter(Boolean)).toHaveLength(1)
    expect(claimed.find(Boolean).attempts).toBe(1)
  })
  it('a provider optout found just before dispatch cancels the claim without delivery', async () => {
    const { worker } = await preparedSms()
    delivery.contact.mockResolvedValue({ dnd:true })
    await worker.processSalesJob(await worker.claimSalesJob())
    expect(delivery.provider).not.toHaveBeenCalled()
    expect((await fixture.pool.query("SELECT state FROM sales_jobs WHERE id='sms-fixture'")).rows[0].state).toBe('cancelled')
  })
  it('a reply during final reconciliation cancels dispatch and keeps timezone unchanged', async () => {
    const { worker } = await preparedSms()
    delivery.conversations.mockResolvedValue([{ id:'conv-fixture' }])
    delivery.messages.mockResolvedValue({ messages:[{ id:'reply1',type:2,messageType:'TYPE_SMS',direction:'inbound',body:'Please call me',dateAdded:new Date().toISOString() }],nextPage:false })
    await worker.processSalesJob(await worker.claimSalesJob())
    expect(delivery.provider).not.toHaveBeenCalled()
    expect((await fixture.pool.query('SELECT timezone,automation_state FROM sales_leads')).rows[0]).toMatchObject({ timezone:'America/New_York', automation_state:'reply_received' })
  })
  it('uncertain provider acceptance keeps the daily reservation and is never claimed again', async () => {
    const { worker } = await preparedSms()
    const { SalesProviderError } = await import('./provider')
    delivery.provider.mockRejectedValue(new SalesProviderError(0,true))
    await worker.processSalesJob(await worker.claimSalesJob())
    expect(delivery.provider).toHaveBeenCalledTimes(1)
    expect((await fixture.pool.query("SELECT state FROM sales_jobs WHERE id='sms-fixture'")).rows[0].state).toBe('uncertain')
    expect((await fixture.pool.query("SELECT status FROM sales_activities WHERE kind='sms_dispatch'")).rows[0].status).toBe('uncertain')
    expect(await worker.claimSalesJob()).toBeUndefined()
  })
  it('missed old slots are cancelled rather than accumulating a burst', async () => {
    const { worker } = await preparedSms()
    await fixture.pool.query("UPDATE sales_jobs SET due_at='2026-10-08T16:00:00Z' WHERE id='sms-fixture'")
    await worker.processSalesJob(await worker.claimSalesJob())
    expect(delivery.provider).not.toHaveBeenCalled()
  })
  it('provider echo and reservation count as one touch, and two calls block another SMS', async () => {
    const { id, worker } = await preparedSms()
    await transaction(async c => {
      await activity(c,id,{ kind:'call',body:'Attempt 1' })
      await activity(c,id,{ kind:'call',body:'Attempt 2' })
    })
    await worker.processSalesJob(await worker.claimSalesJob())
    expect(delivery.provider).not.toHaveBeenCalled()
  })
  it('duplicate provider delivery events cannot regress delivered back to sent', async () => {
    const { id } = await intake(input('a'))
    await ingestMessages(id,[{ id:'m1',type:2,messageType:'TYPE_SMS',direction:'outbound',status:'delivered',body:'Hello',dateAdded:new Date().toISOString() }])
    await ingestMessages(id,[{ id:'m1',type:2,messageType:'TYPE_SMS',direction:'outbound',status:'sent',body:'Hello',dateAdded:new Date().toISOString() }])
    expect((await fixture.pool.query("SELECT status FROM sales_activities WHERE provider_id='m1'")).rows[0].status).toBe('delivered')
  })
  it('the verified provider TYPE_CALL=1 is not an inbound SMS reply; TYPE_SMS=2 is', async () => {
    const { id } = await intake(input('a'))
    await ingestMessages(id,[{ id:'call1',type:1,messageType:'TYPE_CALL',direction:'inbound',status:'completed',dateAdded:new Date().toISOString() }])
    expect((await fixture.pool.query('SELECT last_reply_at FROM sales_leads')).rows[0].last_reply_at).toBeNull()
    expect((await fixture.pool.query("SELECT kind FROM sales_activities WHERE provider_id='call1'")).rows[0].kind).toBe('provider_call')
    await ingestMessages(id,[{ id:'sms1',type:2,messageType:'TYPE_SMS',direction:'inbound',body:'Thanks',dateAdded:new Date().toISOString() }])
    expect((await fixture.pool.query('SELECT automation_state FROM sales_leads')).rows[0].automation_state).toBe('reply_received')
  })
  it('enrollment through another admin path stops sales outreach without duplicating the customer', async () => {
    const { worker } = await preparedSms()
    await fixture.pool.query("INSERT INTO customers(id,email) VALUES('customer-fixture','FIXTURE@example.invalid')")
    await worker.processSalesJob(await worker.claimSalesJob())
    expect(delivery.provider).not.toHaveBeenCalled()
    expect((await fixture.pool.query('SELECT customer_id,automation_state FROM sales_leads')).rows[0]).toMatchObject({ customer_id:'customer-fixture',automation_state:'converted' })
    expect((await fixture.pool.query('SELECT count(*) FROM customers')).rows[0].count).toBe('1')
  })
  it('a paginated historical import resumes from its committed cursor and does not duplicate retried rows or enqueue outreach', async () => {
    const worker = await vi.importActual<typeof import('./worker')>('./worker')
    await fixture.pool.query(`INSERT INTO sales_imports(id,scope,state,total,actor_id,expires_at) VALUES('import-fixture','fixture query','pending',2,'fixture-admin',now()+interval '30 minutes')`)
    const remote = { id:'ghl-1',firstName:'Historic',lastName:'Fixture',email:'historic@example.invalid',phone:'+12125550122',dateAdded:'2020-01-01T12:00:00Z',dnd:true,timezone:'America/New_York',customFields:[{id:'answer',value:'Original answer'}] }
    delivery.contactPage.mockResolvedValueOnce({ contacts:[remote],total:2,cursor:{startAfter:1,startAfterId:'ghl-1'} })
    await worker.importSalesPage()
    expect((await fixture.pool.query("SELECT state,cursor FROM sales_imports")).rows[0]).toMatchObject({ state:'pending',cursor:{startAfter:1,startAfterId:'ghl-1'} })
    delivery.contactPage.mockRejectedValueOnce(new Error('Mock provider outage'))
    await worker.importSalesPage()
    expect((await fixture.pool.query("SELECT state,cursor FROM sales_imports")).rows[0]).toMatchObject({ state:'failed',cursor:{startAfterId:'ghl-1'} })
    await fixture.pool.query("UPDATE sales_imports SET state='pending'")
    delivery.contactPage.mockResolvedValueOnce({ contacts:[remote,{...remote,id:'ghl-2',email:'second@example.invalid',phone:'+12125550123'}],total:2,cursor:null })
    await worker.importSalesPage()
    expect(delivery.contactPage).toHaveBeenLastCalledWith('fixture query',expect.objectContaining({startAfter:1,startAfterId:'ghl-1'}))
    expect((await fixture.pool.query("SELECT state,imported FROM sales_imports")).rows[0]).toMatchObject({ state:'done',imported:2 })
    expect((await fixture.pool.query('SELECT count(*) FROM sales_submissions')).rows[0].count).toBe('2')
    expect((await fixture.pool.query('SELECT count(*) FROM sales_jobs')).rows[0].count).toBe('0')
    expect((await fixture.pool.query('SELECT context FROM sales_submissions LIMIT 1')).rows[0].context.customFields).toEqual([{ id:'answer',value:'Original answer' }])
    expect((await fixture.pool.query('SELECT dnd,consent,historical FROM sales_leads')).rows.every((r: any) => r.dnd && !r.consent && r.historical)).toBe(true)
  })
})
