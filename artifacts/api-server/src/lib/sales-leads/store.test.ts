import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
/** Isolated schema only, including FKs. No public application tables and no
 * provider calls are reachable from these tests. */
const fixture = vi.hoisted(() => ({ pool: null as any }))
const delivery = vi.hoisted(() => ({
  contact: vi.fn(), contactPage: vi.fn(), appointments: vi.fn(), conversations: vi.fn(), messages: vi.fn(), notes: vi.fn(), provider: vi.fn(),
}))
vi.mock('./dispatch', () => ({ nudgeSalesSync: vi.fn() }))
vi.mock('@workspace/db', () => ({ pool: {
  query: (...args: any[]) => fixture.pool.query(...args),
  connect: () => fixture.pool.connect(),
} }))
import { activity, enqueue, intake, stop, transaction } from './store'
import { withSyncState } from './sync-state'
import { nudgeSalesSync } from './dispatch'
import { ingestMessages, ingestProviderFacts, reconcileLead } from './ingestion'
import { logSalesCall, retrySalesSync, updateSalesLead } from '@/actions/sales-leads'
vi.mock('@/lib/auth/admin-session', () => ({ requireAdmin: vi.fn(async () => ({ userId: 'fixture-admin', name: 'Fixture', email: 'fixture@example.invalid', role: 'super_admin' })) }))
vi.mock('@/lib/data/admin-users', () => ({ listAdminUsers: async () => [], getAdminUserById: async () => null }))
vi.mock('@/lib/sales-leads/worker', () => ({
  runSalesWorker: vi.fn(async () => {}),
  drainSalesSync: async () => (await vi.importActual<typeof import('./worker')>('./worker')).drainSalesSync(),
}))
vi.mock('@/lib/sales-leads/provider', async importOriginal => ({
  ...await importOriginal<any>(), ...delivery, contactUrl: () => null, verifyCapabilities: vi.fn(), safeSalesUpsert: vi.fn(),
}))
vi.mock('@/lib/affiliates/attribution', () => ({ resolveQualifiedReferral: vi.fn(), attachCustomerReferral: vi.fn() }))
vi.mock('@/lib/mail/send', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/marketing/outcomes', () => ({ bookingOutcome: vi.fn() }))
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
  it('nudges only committed sync work, never a rollback', async () => {
    const lead = await intake(input('commit'))
    expect(nudgeSalesSync).toHaveBeenCalledTimes(1)
    await expect(transaction(async c => {
      await enqueue(c, lead.id, 'note_sync', 'rollback')
      throw new Error('rollback')
    })).rejects.toThrow('rollback')
    expect(nudgeSalesSync).toHaveBeenCalledTimes(1)
  })
  it('measures commit-to-dispatch with slow import isolated from the fast lane', async () => {
    const worker = await vi.importActual<typeof import('./worker')>('./worker')
    const dispatcher = await vi.importActual<typeof import('./dispatch')>('./dispatch')
    let release!: (value: any) => void
    delivery.contactPage.mockImplementationOnce(() => new Promise(r => { release = r }))
    await fixture.pool.query(`INSERT INTO sales_imports(id,scope,state,total,actor_id,expires_at)
      VALUES('slow-import','fixture','pending',1,'fixture-admin',now()+interval '1 hour')`)
    const importing = worker.importSalesPage()
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    let committed = 0, began = 0, providerMs = 0
    delivery.contact.mockImplementation(async () => {
      began ||= performance.now()
      const start = performance.now()
      await new Promise(r => setTimeout(r, 25))
      providerMs += performance.now() - start
      return { id:'fixture-ghl', dnd:false }
    })
    vi.mocked(nudgeSalesSync).mockImplementationOnce(() => { committed = performance.now(); dispatcher.nudgeSalesSync() })
    const lead = await intake(input('timing', { providerId:'fixture-ghl' }))
    try {
      await vi.waitFor(async () => expect((await withSyncState([lead]))[0].sync_state).toBe('synced'), { timeout:4000 })
      expect(began - committed).toBeLessThan(2000)
      console.info(JSON.stringify({ measurement:'mocked_sales_sync', commitToProviderMs:began-committed,
        commitToObservedDoneMs:performance.now()-committed, simulatedProviderMs:providerMs }))
    } finally {
      release({ contacts:[],total:0,cursor:null })
      await importing
    }
  })
  it('contact-before-note claims exclude concurrent workers and finish note-only pending', async () => {
    const worker = await vi.importActual<typeof import('./worker')>('./worker')
    const lead = await intake(input('ordering', { providerId:'fixture-ghl' }))
    const claims = await Promise.all([worker.claimSalesJob(true), worker.claimSalesJob(true)])
    const claimed = claims.filter(Boolean)
    expect(claimed).toHaveLength(1)
    expect(claimed[0].kind).toBe('contact_sync')
    await worker.processSalesJob(claimed[0])
    expect((await withSyncState([lead]))[0].sync_state).toBe('pending')
    const note = await worker.claimSalesJob(true)
    expect(note.kind).toBe('note_sync')
    await worker.processSalesJob(note)
    expect((await withSyncState([lead]))[0].sync_state).toBe('synced')
    await transaction(c => enqueue(c, lead.id, 'note_sync', 'note-only', { activityId:'new-note', body:'fixture' }))
    expect((await withSyncState([lead]))[0].sync_state).toBe('pending')
    await worker.processSalesJob(await worker.claimSalesJob(true))
    expect((await withSyncState([lead]))[0].sync_state).toBe('synced')
  })
  it('older completion cannot clear newer work or uncertain errors', async () => {
    const worker = await vi.importActual<typeof import('./worker')>('./worker')
    const lead = await intake(input('older', { providerId:'fixture-ghl' }))
    const job = await worker.claimSalesJob(true)
    await transaction(c => enqueue(c, lead.id, 'contact_sync', 'newer'))
    await worker.processSalesJob(job)
    expect((await withSyncState([lead]))[0].sync_state).toBe('pending')
    await fixture.pool.query("UPDATE sales_jobs SET state='uncertain' WHERE dedupe_key='newer'")
    expect((await withSyncState([lead]))[0].sync_state).toBe('uncertain')
    expect(await worker.claimSalesJob(true)).toBeUndefined()
  })
  it('backlog rotates across leads rather than consuming one lead first', async () => {
    const worker = await vi.importActual<typeof import('./worker')>('./worker')
    const first = await intake(input('first', { providerId:'fixture-ghl' }))
    await transaction(c => enqueue(c, first.id, 'contact_sync', 'extra'))
    const second = await intake(input('second', { email:'second@example.invalid', phone:'+12125550198', providerId:'fixture-two' }))
    const job = await worker.claimSalesJob(true)
    expect(job.lead_id).toBe(first.id)
    await worker.processSalesJob(job)
    expect((await worker.claimSalesJob(true)).lead_id).toBe(second.id)
  })
  it('expired contact and note claims become uncertain without replay', async () => {
    const worker = await vi.importActual<typeof import('./worker')>('./worker')
    const lead = await intake(input('expired'))
    await fixture.pool.query("UPDATE sales_jobs SET state='sending',claimed_at=now()-interval '6 minutes'")
    await worker.recoverClaims()
    expect((await withSyncState([lead]))[0].sync_state).toBe('uncertain')
    expect(await worker.claimSalesJob(true)).toBeUndefined()
  })
  it('429 respects a shared cooldown, while ordinary failure keeps durable pending work', async () => {
    const worker = await vi.importActual<typeof import('./worker')>('./worker')
    const { SalesProviderError } = await import('./provider')
    const lead = await intake(input('rate', { providerId:'fixture-ghl' }))
    delivery.contact.mockRejectedValueOnce(new SalesProviderError(429, false, 600))
    await worker.processSalesJob(await worker.claimSalesJob(true))
    const state = (await withSyncState([lead]))[0]
    expect(state.sync_state).toBe('pending')
    expect(state.sync_error).toContain('automatic retry')
    await intake(input('other-rate', { email:'other@example.invalid', phone:'+12125550198' }))
    expect(await worker.claimSalesJob(true)).toBeUndefined()
  })
  it('uncertain note timeout refuses retry and a provider marker reconciles without reposting', async () => {
    const worker = await vi.importActual<typeof import('./worker')>('./worker')
    const { SalesProviderError } = await import('./provider')
    const lead = await intake(input('note-timeout', { providerId:'fixture-ghl' }))
    await worker.processSalesJob(await worker.claimSalesJob(true))
    const note = await worker.claimSalesJob(true)
    delivery.provider.mockRejectedValueOnce(new SalesProviderError(0, true))
    await worker.processSalesJob(note)
    expect((await withSyncState([lead]))[0].sync_state).toBe('uncertain')
    await expect(retrySalesSync(lead.id)).rejects.toThrow('Reconciliation')
    const writes = delivery.provider.mock.calls.length
    delivery.notes.mockResolvedValueOnce([{ id:'remote-note',body:`[Patient Pipeline ${note.payload.activityId}] fixture` }])
    await reconcileLead(lead.id)
    expect((await withSyncState([lead]))[0].sync_state).toBe('synced')
    expect(await worker.claimSalesJob(true)).toBeUndefined()
    expect(delivery.provider).toHaveBeenCalledTimes(writes)
  })
  it('pending jobs survive a lost wake and are picked up by scheduled recovery', async () => {
    const worker = await vi.importActual<typeof import('./worker')>('./worker')
    const lead = await intake(input('restart', { providerId:'fixture-ghl' }))
    // The dispatcher is deliberately mocked: no resident process gets the wake.
    await worker.runSalesWorker()
    expect((await withSyncState([lead]))[0].sync_state).toBe('synced')
  })
  it('booking reuses the queue and repeated Confirm cannot replay an accepted-but-timed-out create', async () => {
    const worker = await vi.importActual<typeof import('./worker')>('./worker')
    const { safeSalesUpsert, SalesProviderError } = await import('./provider')
    const { newBookingHandoff, withBookingHandoff } = await import('../booking-handoff')
    const handoff = newBookingHandoff({ name:'Fixture' })
    const lead = await intake(input('booking-timeout', { context:{ bookingHandoff:handoff.context } }))
    const book = vi.fn()
    const confirm = () => withBookingHandoff(handoff.ref, '2027-01-01T15:00:00Z', 'America/New_York', book)
    expect((await confirm()).error).toContain('pending')
    expect(safeSalesUpsert).not.toHaveBeenCalled()
    vi.mocked(safeSalesUpsert).mockRejectedValueOnce(new SalesProviderError(0, true))
    await worker.processSalesJob(await worker.claimSalesJob(true))
    expect((await withSyncState([lead]))[0].sync_state).toBe('uncertain')
    expect((await confirm()).ok).toBe(false)
    expect((await confirm()).ok).toBe(false)
    expect(await worker.claimSalesJob(true)).toBeUndefined()
    expect(safeSalesUpsert).toHaveBeenCalledTimes(1)
    expect(book).not.toHaveBeenCalled()
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
