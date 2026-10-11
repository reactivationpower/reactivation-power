import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
const fixture = vi.hoisted(() => ({ pool: null as any, lock: `appointment-test-${Math.random()}` }))
const mocks = vi.hoisted(() => ({ provider: vi.fn(), contact: vi.fn(), conversations: vi.fn(), send: vi.fn(), user: vi.fn() }))
vi.mock('@workspace/db', () => ({ pool: { query: (...a: any[]) => fixture.pool.query(...a), connect: () => fixture.pool.connect() } }))
vi.mock('../sales-leads/provider', async original => ({ ...await original<any>(), provider: mocks.provider, contact: mocks.contact, conversations: mocks.conversations }))
vi.mock('../sales-leads/dispatch', () => ({ nudgeSalesSync: vi.fn() }))
vi.mock('../mail/send', () => ({ fromAddress: () => 'Patient Pipeline <team@patientpipeline.app>', sendEmail: mocks.send }))
vi.mock('../sales-inbox/store', () => ({ SALES_REPLY_TO: 'jacobb@patientpipeline.app' }))
vi.mock('../data/admin-users', () => ({ getAdminUserById: mocks.user }))
// Schemas isolate rows, not advisory locks. Parallel task workspaces share this
// database; give this fixture its own worker lock without changing production.
vi.mock('./store', async original => ({ ...await original<any>(), APPOINTMENT_LOCK: fixture.lock }))
import { registerAppointment, reconcileAppointment } from './store'
import { runAppointmentMessages } from './worker'
const schema = `appt_fixture_${randomUUID().replaceAll('-','')}`
describe.skipIf(!process.env.SUPABASE_DB_URL)('appointment outbox (isolated database, mocked delivery)', () => {
  let admin: pg.Pool
  const now = new Date('2026-10-12T14:00Z')
  const start = '2026-10-14T16:00:00.000Z'
  let event: any
  beforeAll(async () => {
    const url = new URL(process.env.SUPABASE_DB_URL!); url.searchParams.delete('sslmode')
    const config = { connectionString: url.toString(), ssl: { rejectUnauthorized:false }, max:1 }
    admin = new pg.Pool(config)
    await admin.query(`CREATE SCHEMA "${schema}"`)
    fixture.pool = new pg.Pool({ ...config, max:2, options:`-c search_path=${schema}` })
    await fixture.pool.query(`CREATE TABLE sales_leads (LIKE public.sales_leads INCLUDING ALL);
      CREATE TABLE sales_settings (LIKE public.sales_settings INCLUDING ALL);
      CREATE TABLE email_log (LIKE public.email_log INCLUDING ALL);`)
    const ddl = readFileSync(new URL('../../../../../lib/db/migrations/0034_supreme_mysterio.sql',import.meta.url),'utf8').replaceAll('"public".', `"${schema}".`)
    await fixture.pool.query(ddl)
  })
  afterAll(async () => {
    vi.useRealTimers(); vi.unstubAllEnvs()
    await fixture.pool?.end()
    await admin?.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin?.end()
  })
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now)
    vi.stubEnv('NODE_ENV','production'); vi.stubEnv('GHL_CALENDAR_ID','calendar-fixture'); vi.stubEnv('GHL_LOCATION_ID','location-fixture')
    vi.clearAllMocks()
    await fixture.pool.query('TRUNCATE appointment_deliveries,appointment_messages,appointment_hosts,appointment_message_settings,sales_leads,sales_settings,email_log CASCADE')
    await fixture.pool.query(`INSERT INTO sales_leads(id,first_name,email,phone,source,ghl_contact_id,consent,timezone,timezone_origin)
      VALUES('lead','Alex','fixture@example.invalid','+12125550199','website','contact',true,'America/New_York','browser');
      INSERT INTO appointment_message_settings(id,enabled) VALUES('strategy',true);
      INSERT INTO appointment_hosts(ghl_user_id,admin_id,name,reply_email) VALUES('host','admin','Morgan','host@example.invalid');`)
    await fixture.pool.query("INSERT INTO sales_settings(id,capabilities) VALUES('internal',$1)",[JSON.stringify({scheduler_wake:{state:'verified',checkedAt:now.toISOString()},appointment_sms:{enabled:true}})])
    event = { id:'appointment', contactId:'contact', calendarId:'calendar-fixture', startTime:start, assignedUserId:'host', address:'https://meet.google.com/abc-defg-hij', appointmentStatus:'confirmed' }
    mocks.provider.mockImplementation(async (path: string) => path.includes('/appointments/') ? { event } : {messageId:'sms-fixture'})
    mocks.contact.mockResolvedValue({id:'contact',locationId:'location-fixture',email:'fixture@example.invalid',phone:'+12125550199',assignedTo:'host'})
    mocks.conversations.mockResolvedValue([{id:'thread',assignedTo:'host'}])
    mocks.user.mockResolvedValue({active:true,confirmedAt:'2026-01-01'})
    mocks.send.mockResolvedValue({ok:true,logId:'email-fixture',providerId:'provider-fixture'})
    const c = await fixture.pool.connect()
    try { await registerAppointment(c,'appointment','lead',start,'America/New_York') } finally { c.release() }
    // Database now() is actual server time, independent of the frozen test clock.
    await fixture.pool.query("UPDATE appointment_messages SET reconcile_at='2000-01-01'")
  })
  const rows = async () => (await fixture.pool.query('SELECT * FROM appointment_deliveries ORDER BY kind,channel')).rows
  async function due() {
    await fixture.pool.query("UPDATE appointment_messages SET reconcile_at='2000-01-01'; UPDATE appointment_deliveries SET due_at='2000-01-01' WHERE kind='confirmation'")
  }
  it('registers once, dispatches once across overlapping wakes, never uses a hardcoded host', async () => {
    await runAppointmentMessages() // plans future relative to real DB clock
    expect((await fixture.pool.query('SELECT last_error FROM appointment_messages')).rows).toEqual([{last_error:null}])
    await due()
    await Promise.all([runAppointmentMessages(),runAppointmentMessages()])
    expect(mocks.send).toHaveBeenCalledTimes(1)
    expect(mocks.send.mock.calls[0][2].host).toBe('Morgan')
    expect(mocks.send.mock.calls[0][3].replyTo).toBe('jacobb@patientpipeline.app')
    expect((await rows()).filter((r:any)=>r.state==='sent')).toHaveLength(2)
    await due(); await runAppointmentMessages()
    expect(mocks.send).toHaveBeenCalledTimes(1)
  })
  it('skips texts for opted-out contacts and blocks mismatched ownership', async () => {
    await runAppointmentMessages(); await due()
    mocks.contact.mockResolvedValue({id:'contact',locationId:'location-fixture',email:'fixture@example.invalid',phone:'+12125550199',assignedTo:'host',dndSettings:{SMS:{status:'active'}}})
    await runAppointmentMessages()
    expect((await rows()).find((r:any)=>r.kind==='confirmation'&&r.channel==='sms').state).toBe('skipped')
    expect(mocks.provider.mock.calls.some(([path])=>path==='/conversations/messages')).toBe(false)
  })
  it('texts without requiring the GHL conversation to be assigned to the host', async () => {
    await runAppointmentMessages(); await due()
    mocks.conversations.mockResolvedValue([{id:'thread',assignedTo:'someone-else'}])
    await runAppointmentMessages()
    expect(mocks.provider.mock.calls.some(([path])=>path==='/conversations/messages')).toBe(true)
    expect(mocks.provider.mock.calls.some(([path,method])=>String(path).startsWith('/contacts/')&&method==='PUT')).toBe(false)
  })
  it('does not replay uncertain email acceptance', async () => {
    await runAppointmentMessages(); await due()
    mocks.send.mockResolvedValue({ok:false,uncertain:true,logId:'email-fixture'})
    await runAppointmentMessages(); await due(); await runAppointmentMessages()
    expect(mocks.send).toHaveBeenCalledTimes(1)
    expect((await rows()).find((r:any)=>r.channel==='email'&&r.kind==='confirmation').state).toBe('uncertain')
  })
  it('replaces pending reminders on reschedule/cancel and deduplicates reconciliation', async () => {
    const c = await fixture.pool.connect()
    try {
      const row = (await c.query('SELECT * FROM appointment_messages')).rows[0]
      await reconcileAppointment(c,row,event,'America/New_York',now,true)
      const count = (await rows()).length
      await reconcileAppointment(c,row,event,'America/New_York',now,true)
      expect((await rows()).length).toBe(count)
      await c.query("UPDATE appointment_deliveries SET state='sent' WHERE kind='confirmation'")
      event.startTime='2026-10-15T16:00Z'
      await reconcileAppointment(c,row,event,'America/New_York',now,true)
      expect((await rows()).filter((r:any)=>r.state==='pending'&&r.kind==='rescheduled')).toHaveLength(2)
      event.appointmentStatus='cancelled'
      await reconcileAppointment(c,row,event,'America/New_York',now,true)
      expect((await rows()).filter((r:any)=>r.state==='pending').map((r:any)=>r.kind)).toEqual(['cancelled','cancelled'])
    } finally { c.release() }
  })
  it('does not run in preview or when disabled, and does not enroll past bookings later', async () => {
    vi.stubEnv('NODE_ENV','development'); await runAppointmentMessages()
    expect(mocks.provider).not.toHaveBeenCalled()
    await fixture.pool.query("UPDATE appointment_message_settings SET enabled=false")
    const c = await fixture.pool.connect()
    try { await registerAppointment(c,'not-enrolled','lead',start,'America/New_York') } finally { c.release() }
    expect((await fixture.pool.query('SELECT count(*) FROM appointment_messages')).rows[0].count).toBe('1')
  })
  it('does not enable automatic texts as a side effect of email approval', async () => {
    await fixture.pool.query("UPDATE sales_settings SET capabilities=capabilities-'appointment_sms'")
    await runAppointmentMessages(); await due(); await runAppointmentMessages()
    expect(mocks.send).toHaveBeenCalledTimes(1)
    expect((await rows()).every((r:any)=>r.channel==='email')).toBe(true)
    expect(mocks.provider.mock.calls.some(([path])=>path==='/conversations/messages')).toBe(false)
  })
  it('blocks missing meeting links, then sends once when the verified link arrives', async () => {
    event.address=''
    await runAppointmentMessages(); await due(); await runAppointmentMessages()
    expect(mocks.send).not.toHaveBeenCalled()
    expect((await rows()).some((r:any)=>r.last_error?.includes('Google Meet'))).toBe(true)
    event.address='https://meet.google.com/abc-defg-hij'
    await due(); await runAppointmentMessages(); await due(); await runAppointmentMessages()
    expect(mocks.send).toHaveBeenCalledTimes(1)
  })
  it('freezes recipient, rendered content and host, and ignores metadata-only changes after sending', async () => {
    await runAppointmentMessages(); await due(); await runAppointmentMessages()
    const original=(await rows()).find((r:any)=>r.channel==='email'&&r.kind==='confirmation').snapshot
    expect(original.recipient).toBe('fixture@example.invalid')
    expect(original.copy.hostId).toBe('host')
    expect(original.rendered.html).toContain('patient-pipeline-logo.png')
    event.address='https://meet.google.com/xyz-abcd-efg'
    await due(); await runAppointmentMessages(); await due(); await runAppointmentMessages()
    expect(mocks.send).toHaveBeenCalledTimes(1)
    expect((await rows()).find((r:any)=>r.channel==='email'&&r.kind==='confirmation').snapshot).toEqual(original)
  })
  it('two rapid reschedules cancel stale queued notices and retain the latest reschedule kind', async () => {
    await runAppointmentMessages(); await due(); await runAppointmentMessages()
    const c=await fixture.pool.connect()
    try {
      const row=(await c.query('SELECT * FROM appointment_messages')).rows[0]
      event.startTime='2026-10-15T16:00:00.000Z'
      await reconcileAppointment(c,row,event,'America/New_York',now,true)
      event.startTime='2026-10-16T16:00:00.000Z'
      await reconcileAppointment(c,row,event,'America/New_York',now,true)
      event.address='https://meet.google.com/xyz-abcd-efg'
      await reconcileAppointment(c,row,event,'America/New_York',now,true)
      const active=(await rows()).filter((r:any)=>r.state==='pending'&&r.kind==='rescheduled')
      expect(active).toHaveLength(2)
      expect(active.every((r:any)=>r.version===row.version)).toBe(true)
    } finally { c.release() }
  })
  it('cancels obsolete work even when cancellation omits its time/host/link', async () => {
    await runAppointmentMessages(); await due(); await runAppointmentMessages()
    event={...event,appointmentStatus:'cancelled',startTime:undefined,assignedUserId:undefined,address:''}
    await due(); await runAppointmentMessages()
    await fixture.pool.query("UPDATE appointment_messages SET reconcile_at='2000-01-01'; UPDATE appointment_deliveries SET due_at='2000-01-01' WHERE kind='cancelled'")
    await runAppointmentMessages()
    expect((await fixture.pool.query('SELECT last_error FROM appointment_messages')).rows[0]?.last_error).toBeNull()
    expect(mocks.send.mock.calls.at(-1)?.[2].kind).toBe('cancelled')
    expect(mocks.send.mock.calls.at(-1)?.[2].host).toBe('Morgan')
    expect((await rows()).some((r:any)=>r.state==='pending'&&r.kind==='day_before')).toBe(false)
  })
  it('recovers a committed acceptance after a worker crash without sending again', async () => {
    await runAppointmentMessages()
    await fixture.pool.query(`INSERT INTO email_log(id,type,recipient,subject,status,provider_id)
      VALUES('committed','strategy_appointment','fixture@example.invalid','Saved','sent','accepted-fixture');
      UPDATE appointment_deliveries SET state='sending',email_log_id='committed',claimed_at=now()
      WHERE kind='confirmation' AND channel='email'`)
    await due(); await runAppointmentMessages()
    expect(mocks.send).not.toHaveBeenCalled()
    expect((await rows()).find((r:any)=>r.channel==='email'&&r.kind==='confirmation').provider_id).toBe('accepted-fixture')
  })
  it('does not send into another location or replay a definite email failure', async () => {
    await runAppointmentMessages(); await due()
    mocks.contact.mockResolvedValue({id:'contact',locationId:'wrong-location'})
    await runAppointmentMessages()
    expect(mocks.send).not.toHaveBeenCalled()
    mocks.contact.mockResolvedValue({id:'contact',locationId:'location-fixture',email:'fixture@example.invalid',dndSettings:{SMS:{status:'active'}}})
    mocks.send.mockResolvedValue({ok:false,logId:'rejected'})
    await due(); await runAppointmentMessages(); await due(); await runAppointmentMessages()
    expect(mocks.send).toHaveBeenCalledTimes(1)
    expect((await rows()).find((r:any)=>r.channel==='email'&&r.kind==='confirmation').state).toBe('failed')
  })
  it('skips expired reminder backlog instead of sending catch-up emails', async () => {
    await runAppointmentMessages()
    await fixture.pool.query("UPDATE appointment_deliveries SET due_at='2000-01-01',expires_at='2000-01-02' WHERE kind='day_before'")
    await runAppointmentMessages()
    expect((await rows()).filter((r:any)=>r.kind==='day_before').every((r:any)=>r.state==='skipped')).toBe(true)
    expect(mocks.send).not.toHaveBeenCalled()
  })
})
