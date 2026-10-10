import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import pg from 'pg'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
const f=vi.hoisted(()=>({pool:null as any,admin:{userId:'admin',role:'sales_rep',name:'Agent'},send:vi.fn(),contact:vi.fn(),threads:vi.fn(),provider:vi.fn()}))
vi.mock('@workspace/db',()=>({pool:{query:(...a:any[])=>f.pool.query(...a),connect:()=>f.pool.connect()}}))
vi.mock('../auth/admin-session',()=>({requireAdmin:async()=>f.admin}))
vi.mock('../data/admin-users',()=>({getAdminUserById:async(id:string)=>({id,active:true,confirmedAt:'2026-01-01'})}))
vi.mock('../mail/send',()=>({sendEmail:f.send}))
vi.mock('../sales-leads/dispatch',()=>({nudgeSalesSync:vi.fn()}))
vi.mock('../sales-leads/provider',async original=>({...await original<any>(),contact:f.contact,conversations:f.threads,provider:f.provider}))
import { sendMessage, getConversation, listInbox } from '../../actions/sales-inbox'
import { updateSalesLead } from '../../actions/sales-leads'
import { ingestReceivedEmail } from './inbound'
import { replyAddress } from './store'
const schema=`inbox_fixture_${randomUUID().replaceAll('-','')}`
describe.skipIf(!process.env.SUPABASE_DB_URL)('unified inbox isolated persistence, mocked delivery',()=>{
  let admin:pg.Pool
  beforeAll(async()=>{
    const url=new URL(process.env.SUPABASE_DB_URL!);url.searchParams.delete('sslmode')
    const config={connectionString:url.toString(),ssl:{rejectUnauthorized:false},max:1}
    admin=new pg.Pool(config);await admin.query(`CREATE SCHEMA "${schema}"`)
    f.pool=new pg.Pool({...config,max:3,options:`-c search_path=${schema}`})
    for(const t of ['sales_leads','sales_activities','sales_jobs','sales_settings','email_log']) await f.pool.query(`CREATE TABLE ${t} (LIKE public.${t} INCLUDING ALL)`)
    for(const name of ['0034_supreme_mysterio','0035_abnormal_sally_floyd']) {
      const sql=readFileSync(new URL(`../../../../../lib/db/migrations/${name}.sql`,import.meta.url),'utf8').replaceAll('"public".',`"${schema}".`)
      await f.pool.query(sql)
    }
  })
  afterAll(async()=>{vi.useRealTimers();vi.unstubAllEnvs();await f.pool?.end();await admin?.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin?.end()})
  beforeEach(async()=>{
    vi.clearAllMocks();vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-12T14:00Z'));vi.stubEnv('NODE_ENV','production')
    f.admin={userId:'admin',role:'sales_rep',name:'Agent'}
    await f.pool.query('TRUNCATE sales_leads,sales_activities,sales_jobs,email_log,appointment_hosts,appointment_messages,appointment_deliveries,sales_inbox_messages,sales_inbox_threads,sales_inbox_settings CASCADE')
    await f.pool.query(`INSERT INTO sales_leads(id,first_name,email,phone,source,assignee_id,ghl_contact_id,consent,timezone,timezone_origin)
      VALUES('lead','Alex','fixture@example.invalid','+12125550199','manual','admin','contact',true,'America/New_York','staff'),
      ('other','Hidden','hidden@example.invalid','+12125550198','manual','someone-else','other-contact',true,'America/New_York','staff');
      INSERT INTO appointment_hosts(ghl_user_id,admin_id,name,reply_email) VALUES('host','admin','Morgan','unused@example.invalid');
      INSERT INTO sales_inbox_settings(id,email_domain,email_ready,sms_ready) VALUES('internal','replies.patientpipeline.app',true,true);`)
    f.contact.mockResolvedValue({id:'contact',locationId:process.env.GHL_LOCATION_ID,email:'fixture@example.invalid',phone:'+12125550199',assignedTo:'host'})
    f.threads.mockResolvedValue([{id:'thread',assignedTo:'host'}]);f.provider.mockResolvedValue({messageId:'provider-sms'})
    f.send.mockResolvedValue({ok:true,logId:'mail-log',providerId:'provider-email'})
  })
  const message=(channel:'sms'|'email'='sms')=>({leadId:'lead',requestId:randomUUID(),channel,body:'Synthetic message',subject:'Synthetic subject'})
  it('sends SMS once across duplicate requests and prevents request-ID content replacement',async()=>{
    const input=message()
    const results=await Promise.all([sendMessage(input),sendMessage(input)])
    expect(results.map(r=>r.state)).toEqual(['sent','sent']);expect(f.provider).toHaveBeenCalledTimes(1)
    expect(f.provider).toHaveBeenCalledWith('/conversations/messages','POST',expect.objectContaining({type:'SMS',contactId:'contact'}))
    await expect(sendMessage({...input,body:'Changed'})).rejects.toThrow('another message')
    expect((await getConversation('lead')).messages).toHaveLength(1)
  })
  it('uses Resend with Jacob’s mailbox, without receiving setup',async()=>{
    await f.pool.query("UPDATE sales_inbox_settings SET email_ready=false,email_domain=''")
    await sendMessage(message('email'))
    expect(f.send.mock.calls[0][0]).toBe('sales_personal')
    expect(f.send.mock.calls[0][3].replyTo).toBe('jacobb@patientpipeline.app')
    expect((await f.pool.query('SELECT count(*) FROM sales_inbox_threads')).rows[0].count).toBe('0')
  })
  it('rejects cross-salesperson reads, lists, and sends',async()=>{
    expect((await listInbox()).leads.map(l=>l.id)).toEqual(['lead'])
    await expect(getConversation('other')).rejects.toThrow('not available')
    await expect(sendMessage({...message(),leadId:'other'})).rejects.toThrow('not available')
    expect(f.provider).not.toHaveBeenCalled()
  })
  it('cannot bypass inbox ownership by assigning another salesperson’s lead to yourself',async()=>{
    const lead=(await f.pool.query("SELECT revision FROM sales_leads WHERE id='other'")).rows[0]
    await expect(updateSalesLead('other',{revision:lead.revision,assigneeId:'admin'})).rejects.toThrow('Only a super admin')
    expect((await f.pool.query("SELECT assignee_id FROM sales_leads WHERE id='other'")).rows[0].assignee_id).toBe('someone-else')
  })
  it('blocks preview, quiet hours, lack of consent, opt-out, mismatched phone and conversation ownership',async()=>{
    vi.stubEnv('NODE_ENV','development');await expect(sendMessage(message())).rejects.toThrow('preview')
    vi.stubEnv('NODE_ENV','production');vi.setSystemTime(new Date('2026-10-12T02:00Z'));await expect(sendMessage(message())).rejects.toThrow('8 AM')
    vi.setSystemTime(new Date('2026-10-12T14:00Z'))
    await f.pool.query("UPDATE sales_leads SET consent=false WHERE id='lead'");await expect(sendMessage(message())).rejects.toThrow('consent')
    await f.pool.query("UPDATE sales_leads SET consent=true WHERE id='lead'")
    f.contact.mockResolvedValueOnce({id:'contact',locationId:process.env.GHL_LOCATION_ID,phone:'+12125550199',dnd:true})
    await expect(sendMessage(message())).rejects.toThrow('opted out')
    f.contact.mockResolvedValueOnce({id:'contact',locationId:process.env.GHL_LOCATION_ID,phone:'+12125550999'})
    await expect(sendMessage(message())).rejects.toThrow('identity')
    f.threads.mockResolvedValue([{assignedTo:'wrong'}]);await expect(sendMessage(message())).rejects.toThrow('Assign')
    expect(f.provider).not.toHaveBeenCalled()
  })
  it('never automatically replays an uncertain provider send',async()=>{
    f.provider.mockRejectedValue(new Error('network lost'))
    const input=message()
    expect((await sendMessage(input)).state).toBe('uncertain');expect((await sendMessage(input)).state).toBe('uncertain')
    expect(f.provider).toHaveBeenCalledTimes(1)
  })
  it('receives email once, isolates threads, pauses outreach, and quarantines mismatched sender',async()=>{
    const address=await replyAddress('lead')
    const received={from:'Alex <fixture@example.invalid>',to:[address],subject:'Question',text:'Can you help?',created_at:'2026-10-12T14:00Z'}
    expect(await ingestReceivedEmail('inbound-fixture',received)).toBe('done')
    expect(await ingestReceivedEmail('inbound-fixture',received)).toBe('done')
    const thread=await getConversation('lead')
    expect(thread.messages.filter(m=>m.direction==='inbound')).toHaveLength(1)
    expect((await f.pool.query("SELECT stage,last_reply_at FROM sales_leads WHERE id='lead'")).rows[0]).toMatchObject({stage:'Engaged'})
    expect(await ingestReceivedEmail('wrong-fixture',{...received,from:'other@example.invalid'})).toBe('review')
    expect((await getConversation('lead')).messages).toHaveLength(1)
  })
})
