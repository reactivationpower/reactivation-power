import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import pg from 'pg'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
const f=vi.hoisted(()=>({pool:null as any,admin:{userId:'admin',role:'sales_rep',name:'Agent'},send:vi.fn(),contact:vi.fn(),threads:vi.fn(),provider:vi.fn(),sender:vi.fn(),messages:vi.fn()}))
vi.mock('@workspace/db',()=>({pool:{query:(...a:any[])=>f.pool.query(...a),connect:()=>f.pool.connect()}}))
vi.mock('../auth/admin-session',()=>({requireAdmin:async()=>f.admin}))
vi.mock('../data/admin-users',()=>({getAdminUserById:async(id:string)=>({id,role:'sales_rep',active:true,confirmedAt:'2026-01-01'})}))
vi.mock('../mail/send',()=>({sendEmail:f.send}))
vi.mock('../sales-leads/dispatch',()=>({nudgeSalesSync:vi.fn()}))
vi.mock('../sales-leads/provider',async original=>({...await original<any>(),contact:f.contact,conversations:f.threads,provider:f.provider,smsSender:f.sender,messages:f.messages,appointments:async()=>[],notes:async()=>[]}))
import { sendMessage, getConversation, listInbox, refreshConversation } from '../../actions/sales-inbox'
import { updateSalesLead } from '../../actions/sales-leads'
import { ingestReceivedEmail } from './inbound'
import { replyAddress } from './store'
import { ingestMessages, refreshLeadMessages } from '../sales-leads/ingestion'
// These cases perform many sequential round trips to the shared remote DB.
// Keep time bounded without timing out mid-send and leaking work into the next case.
vi.setConfig({ testTimeout: 30000 })
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
    f.threads.mockResolvedValue([{id:'thread',assignedTo:'host',contactId:'contact',locationId:process.env.GHL_LOCATION_ID}]);f.provider.mockResolvedValue({messageId:'provider-sms'})
    f.sender.mockResolvedValue('+12125550000');f.messages.mockResolvedValue({messages:[],nextPage:false})
    await f.pool.query(`INSERT INTO sales_settings(id,capabilities) VALUES('internal',$1) ON CONFLICT(id) DO UPDATE SET capabilities=EXCLUDED.capabilities`,
      [JSON.stringify({portal_sms_sender:{number:'+12125550000',locationId:process.env.GHL_LOCATION_ID}})])
    f.send.mockResolvedValue({ok:true,logId:'mail-log',providerId:'provider-email'})
  })
  const message=(channel:'sms'|'email'='sms')=>({leadId:'lead',requestId:randomUUID(),channel,body:'Synthetic message',subject:'Synthetic subject'})
  it('sends SMS once across duplicate requests and prevents request-ID content replacement',async()=>{
    const input=message()
    const results=await Promise.all([sendMessage(input),sendMessage(input)])
    expect(results.map(r=>r.state)).toEqual(['sent','sent']);expect(f.provider).toHaveBeenCalledTimes(1)
    expect(results.map(r=>r.canonical_state)).toEqual(['accepted','accepted'])
    expect(f.provider).toHaveBeenCalledWith('/conversations/messages','POST',expect.objectContaining({type:'SMS',contactId:'contact',fromNumber:'+12125550000',toNumber:'+12125550199',status:'pending'}))
    await expect(sendMessage({...input,body:'Changed'})).rejects.toThrow('another message')
    expect((await getConversation('lead')).messages).toHaveLength(1)
  })
  it('rejects manual email without calling a delivery provider',async()=>{
    await expect(sendMessage(message('email'))).rejects.toThrow()
    expect(f.send).not.toHaveBeenCalled();expect(f.provider).not.toHaveBeenCalled()
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
  it('allows preview sends, asks before night or no-consent texts, and blocks opt-out and mismatched phone',async()=>{
    vi.stubEnv('NODE_ENV','development');expect((await sendMessage(message())).state).toBe('sent');f.provider.mockClear()
    vi.stubEnv('NODE_ENV','production');vi.setSystemTime(new Date('2026-10-12T02:00Z'));await expect(sendMessage(message())).rejects.toThrow('Send anyway')
    vi.setSystemTime(new Date('2026-10-12T14:00Z'))
    await f.pool.query("UPDATE sales_leads SET consent=false WHERE id='lead'");await expect(sendMessage(message())).rejects.toThrow('not agreed')
    expect(f.provider).not.toHaveBeenCalled()
    expect((await getConversation('lead')).readiness).toMatchObject({sms:true,reasons:[],confirm:['This lead has not agreed to receive texts.']})
    // Confirming reuses the same request ID; the confirmed flag does not weaken duplicate protection.
    const asked=message();await expect(sendMessage(asked)).rejects.toThrow('Send anyway')
    f.provider.mockResolvedValueOnce({messageId:'provider-sms-confirmed'})
    const confirmedResults=await Promise.all([sendMessage({...asked,confirmed:true}),sendMessage({...asked,confirmed:true})])
    expect(confirmedResults.map(r=>r.state)).toEqual(['sent','sent']);expect(f.provider).toHaveBeenCalledTimes(1)
    expect((await sendMessage(asked)).state).toBe('sent');expect(f.provider).toHaveBeenCalledTimes(1);f.provider.mockClear()
    await f.pool.query("UPDATE sales_leads SET consent=true,timezone_origin='inferred' WHERE id='lead'")
    await expect(sendMessage(message())).rejects.toThrow('time zone')
    await f.pool.query("UPDATE sales_leads SET timezone_origin='staff' WHERE id='lead'")
    // Hard stops win over "ask first": a do-not-contact lead is refused even when confirmed at night.
    vi.setSystemTime(new Date('2026-10-12T02:00Z'));await f.pool.query("UPDATE sales_leads SET dnd=true WHERE id='lead'")
    await expect(sendMessage({...message(),confirmed:true})).rejects.toThrow('do not contact')
    await f.pool.query("UPDATE sales_leads SET dnd=false WHERE id='lead'");vi.setSystemTime(new Date('2026-10-12T14:00Z'))
    expect(f.provider).not.toHaveBeenCalled()
    await f.pool.query("UPDATE sales_leads SET consent=true WHERE id='lead'")
    f.contact.mockResolvedValueOnce({id:'contact',locationId:process.env.GHL_LOCATION_ID,phone:'+12125550199',dnd:true})
    await expect(sendMessage(message())).rejects.toThrow('opted out')
    f.contact.mockResolvedValueOnce({id:'contact',locationId:process.env.GHL_LOCATION_ID,phone:'+12125550999'})
    await expect(sendMessage(message())).rejects.toThrow('identity')
    expect(f.provider).not.toHaveBeenCalled()
  })
  it('never automatically replays an uncertain provider send',async()=>{
    f.provider.mockRejectedValue(new Error('network lost'))
    const input=message()
    expect((await sendMessage(input)).state).toBe('uncertain');expect((await sendMessage(input)).state).toBe('uncertain')
    expect(f.provider).toHaveBeenCalledTimes(1)
  })
  it('sends without requiring GHL contact reassignment and uses the only sender profile for unassigned leads',async()=>{
    f.contact.mockResolvedValue({...await f.contact(),assignedTo:'other'})
    expect(await sendMessage(message())).toMatchObject({state:'sent',canonical_state:'accepted'})
    expect(f.provider).not.toHaveBeenCalledWith(expect.stringContaining('/contacts/'),'PUT',expect.anything())
    await f.pool.query("UPDATE sales_leads SET assignee_id=NULL WHERE id='lead'")
    f.admin={userId:'owner',role:'super_admin',name:'Owner'};f.provider.mockResolvedValue({messageId:'provider-sms-2'})
    expect(await sendMessage(message())).toMatchObject({state:'sent'})
    expect((await getConversation('lead')).readiness).toMatchObject({sms:true,reasons:[],confirm:[]})
  })
  it('does not silently switch the configured sender',async()=>{
    f.sender.mockResolvedValue('+12125550001')
    await expect(sendMessage(message())).rejects.toThrow('sender changed')
    expect(f.provider).not.toHaveBeenCalled()
  })
  it('persists duplicate inbound replies once and never regresses terminal delivery',async()=>{
    await sendMessage(message())
    const row={id:'provider-sms',type:2,direction:'outbound',status:'delivered',dateAdded:'2026-10-12T14:00Z',contactId:'contact'}
    await ingestMessages('lead',[row,{...row,status:'pending'},{...row,status:'failed'}])
    expect((await f.pool.query("SELECT state FROM sales_inbox_messages")).rows[0].state).toBe('delivered')
    const reply={...row,id:'reply',direction:'inbound',body:'STOP',status:'received'}
    await ingestMessages('lead',[reply,reply,{...reply,contactId:'other-contact',id:'wrong'}])
    expect((await f.pool.query("SELECT count(*) FROM sales_activities WHERE kind='inbound_sms'")).rows[0].count).toBe('1')
    expect((await f.pool.query("SELECT dnd FROM sales_leads WHERE id='lead'")).rows[0].dnd).toBe(true)
    await expect(sendMessage(message())).rejects.toThrow('do not contact')
  })
  it('bounds concurrent refresh and reports provider outage without losing history',async()=>{
    f.messages.mockRejectedValue(new Error('offline'))
    const states=await Promise.all([refreshLeadMessages('lead'),refreshLeadMessages('lead')])
    expect(states.map(s=>s.state).sort()).toEqual(['throttled','unavailable'])
    expect(f.messages).toHaveBeenCalledTimes(1)
    expect((await getConversation('lead')).synchronization.state).toBe('throttled')
    await expect(refreshConversation('lead')).rejects.toThrow('Refresh in progress')
  })
  it('still receives replies to previously sent thread addresses once, notifies staff and stops outreach',async()=>{
    const address=await replyAddress('lead')
    await f.pool.query("UPDATE sales_leads SET assignee_id='admin',consent=true WHERE id='lead'")
    await f.pool.query("INSERT INTO sales_jobs(id,lead_id,kind,dedupe_key,state) VALUES('legacy-outreach','lead','sms','legacy-outreach','pending')")
    const received={from:'Alex <fixture@example.invalid>',to:[address],subject:'Question',text:'Can you help?',created_at:'2026-10-12T14:00Z'}
    expect(await ingestReceivedEmail('inbound-fixture',received)).toBe('done')
    expect(await ingestReceivedEmail('inbound-fixture',received)).toBe('done')
    const thread=await getConversation('lead')
    expect(thread.messages.filter(m=>m.direction==='inbound')).toHaveLength(1)
    expect((await f.pool.query("SELECT state FROM sales_jobs WHERE id='legacy-outreach'")).rows[0].state).toBe('cancelled')
    expect((await f.pool.query("SELECT id FROM sales_jobs WHERE kind='reply_email' AND lead_id='lead'")).rows).toHaveLength(1)
    expect((await f.pool.query("SELECT stage,last_reply_at FROM sales_leads WHERE id='lead'")).rows[0]).toMatchObject({stage:'Engaged'})
    expect(await ingestReceivedEmail('wrong-fixture',{...received,from:'other@example.invalid'})).toBe('review')
    expect((await getConversation('lead')).messages).toHaveLength(1)
  })
})
