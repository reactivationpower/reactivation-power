import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
const fixture = vi.hoisted(() => ({ pool: null as any }))
const mocks = vi.hoisted(() => ({ provider: vi.fn(), contact: vi.fn(), conversations: vi.fn(), send: vi.fn(), user: vi.fn() }))
vi.mock('@workspace/db', () => ({ pool: { query: (...a: any[]) => fixture.pool.query(...a), connect: () => fixture.pool.connect() } }))
vi.mock('../sales-leads/provider', async original => ({ ...await original<any>(), provider: mocks.provider, contact: mocks.contact, conversations: mocks.conversations }))
vi.mock('../sales-leads/dispatch', () => ({ nudgeSalesSync: vi.fn() }))
vi.mock('../mail/send', () => ({ fromAddress: () => 'Patient Pipeline <team@patientpipeline.app>', sendEmail: mocks.send }))
vi.mock('../sales-inbox/store', () => ({ replyAddress: async () => 'thread@replies.example.invalid' }))
vi.mock('../data/admin-users', () => ({ getAdminUserById: mocks.user }))
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
    vi.stubEnv('NODE_ENV','production'); vi.stubEnv('GHL_CALENDAR_ID','calendar-fixture')
    vi.clearAllMocks()
    await fixture.pool.query('TRUNCATE appointment_deliveries,appointment_messages,appointment_hosts,appointment_message_settings,sales_leads,sales_settings,email_log CASCADE')
    await fixture.pool.query(`INSERT INTO sales_leads(id,first_name,email,phone,source,ghl_contact_id,consent,timezone,timezone_origin)
      VALUES('lead','Alex','fixture@example.invalid','+12125550199','website','contact',true,'America/New_York','browser');
      INSERT INTO appointment_message_settings(id,enabled) VALUES('strategy',true);
      INSERT INTO appointment_hosts(ghl_user_id,admin_id,name,reply_email) VALUES('host','admin','Morgan','host@example.invalid');`)
    await fixture.pool.query("INSERT INTO sales_settings(id,capabilities) VALUES('internal',$1)",[JSON.stringify({scheduler_wake:{state:'verified',checkedAt:now.toISOString()}})])
    event = { id:'appointment', contactId:'contact', calendarId:'calendar-fixture', startTime:start, assignedUserId:'host', address:'https://meet.google.com/abc-defg-hij', appointmentStatus:'confirmed' }
    mocks.provider.mockImplementation(async (path: string) => path.includes('/appointments/') ? { event } : {messageId:'sms-fixture'})
    mocks.contact.mockResolvedValue({id:'contact',email:'fixture@example.invalid',phone:'+12125550199',assignedTo:'host'})
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
    await due()
    await Promise.all([runAppointmentMessages(),runAppointmentMessages()])
    expect(mocks.send).toHaveBeenCalledTimes(1)
    expect(mocks.send.mock.calls[0][2].host).toBe('Morgan')
    expect(mocks.send.mock.calls[0][3].replyTo).toBe('thread@replies.example.invalid')
    expect((await rows()).filter((r:any)=>r.state==='sent')).toHaveLength(2)
    await due(); await runAppointmentMessages()
    expect(mocks.send).toHaveBeenCalledTimes(1)
  })
  it('skips texts for opted-out contacts and blocks mismatched ownership', async () => {
    await runAppointmentMessages(); await due()
    mocks.contact.mockResolvedValue({id:'contact',email:'fixture@example.invalid',phone:'+12125550199',assignedTo:'host',dndSettings:{SMS:{status:'active'}}})
    await runAppointmentMessages()
    expect((await rows()).find((r:any)=>r.kind==='confirmation'&&r.channel==='sms').state).toBe('skipped')
    expect(mocks.provider.mock.calls.some(([path])=>path==='/conversations/messages')).toBe(false)
  })
  it('stops at unknown SMS reply ownership instead of sending in the wrong salesperson’s name', async () => {
    await runAppointmentMessages(); await due()
    mocks.conversations.mockResolvedValue([{id:'thread',assignedTo:'someone-else'}])
    await runAppointmentMessages()
    expect((await rows()).find((r:any)=>r.kind==='confirmation'&&r.channel==='sms').last_error).toContain('conversation')
    expect(mocks.provider.mock.calls.some(([path])=>path==='/conversations/messages')).toBe(false)
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
      await reconcileAppointment(c,row,event,'America/New_York',now)
      const count = (await rows()).length
      await reconcileAppointment(c,row,event,'America/New_York',now)
      expect((await rows()).length).toBe(count)
      await c.query("UPDATE appointment_deliveries SET state='sent' WHERE kind='confirmation'")
      event.startTime='2026-10-15T16:00Z'
      await reconcileAppointment(c,row,event,'America/New_York',now)
      expect((await rows()).filter((r:any)=>r.state==='pending'&&r.kind==='rescheduled')).toHaveLength(2)
      event.appointmentStatus='cancelled'
      await reconcileAppointment(c,row,event,'America/New_York',now)
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
})
