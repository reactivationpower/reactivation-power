import { z } from 'zod'
import { createHash } from 'node:crypto'
import { pool } from '@workspace/db'
import { requireAdmin } from '@/lib/auth/admin-session'
import { inboxSettings, SALES_REPLY_TO } from '@/lib/sales-inbox/store'
import { contact, contactUrl, conversations, provider, SalesProviderError, smsSender } from '@/lib/sales-leads/provider'
import { refreshLeadMessages } from '@/lib/sales-leads/ingestion'
import { canonicalSmsStatus } from '@/lib/sales-inbox/status'
import { smsAllowed } from '@/lib/appointment-messages/schedule'
import { getAdminUserById } from '@/lib/data/admin-users'
import { listAppointmentEmailHistory } from '@/lib/appointment-messages/history'
import { safeEmailPreview } from '@/lib/sales-inbox/email-preview'
import { toPlainText } from '@/lib/mail/layout'
import { stop, transaction } from '@/lib/sales-leads/store'

export class InboxAccessError extends Error {
  constructor() { super('Lead not available to this salesperson') }
}
export function assertInboxAccess(admin: {role:string;userId:string}, lead: any) {
  if (!['super_admin','sales_rep'].includes(admin.role) || !lead || (admin.role !== 'super_admin' && lead.assignee_id !== admin.userId)) throw new InboxAccessError()
}
async function accessible(id: string) {
  const admin = await requireAdmin()
  const lead = (await pool.query('SELECT * FROM sales_leads WHERE id=$1', [id])).rows[0]
  assertInboxAccess(admin, lead)
  return {admin,lead}
}
export async function listInbox(input: {query?:string;page?:number} = {}) {
  const admin = await requireAdmin()
  const args = [admin.role === 'super_admin',admin.userId,`%${String(input.query??'').slice(0,100).replace(/[%_]/g,'')}%`]
  const where = "WHERE ($1 OR l.assignee_id=$2) AND concat_ws(' ',l.first_name,l.last_name,l.email,l.phone,l.practice_name) ILIKE $3"
  const [rows,count] = await Promise.all([
    pool.query(`SELECT l.id,l.first_name,l.last_name,l.email,l.phone,l.practice_name,l.assignee_id,
      GREATEST(l.created_at,COALESCE((SELECT max(created_at) FROM sales_inbox_messages WHERE lead_id=l.id),l.created_at),
      COALESCE((SELECT max(occurred_at) FROM sales_activities WHERE lead_id=l.id),l.created_at)) AS last_activity_at
      FROM sales_leads l ${where} ORDER BY last_activity_at DESC,l.id LIMIT 25 OFFSET $4`,[...args,(Math.max(1,Math.floor(Number(input.page)||1))-1)*25]),
    pool.query(`SELECT count(*) FROM sales_leads l ${where}`,args),
  ])
  return {leads:rows.rows,total:Number(count.rows[0].count)}
}
async function readiness(lead:any) {
  const cfg = await inboxSettings(), reasons:string[]=[]
  const host = (await pool.query('SELECT * FROM appointment_hosts WHERE admin_id=$1 AND active=true',[lead.assignee_id])).rows
  if(host.length!==1) reasons.push('Assign this lead to a salesperson with exactly one active GHL host profile in Leads Settings.')
  if(lead.dnd || lead.stage==='Lost/Do Not Contact') reasons.push('This lead is marked do not contact.')
  if(!cfg.sms_ready) reasons.push('SMS sending readiness has not been confirmed in inbox settings.')
  const capabilities=(await pool.query("SELECT capabilities FROM sales_settings WHERE id='internal'")).rows[0]?.capabilities
  const senderConfirmed=capabilities?.portal_sms_sender?.locationId===process.env.GHL_LOCATION_ID && !!capabilities?.portal_sms_sender?.number
  if(!senderConfirmed) reasons.push('Reconfirm inbox SMS readiness to bind the existing GHL number. API access alone does not verify A2P or sending permission.')
  if(!lead.consent) reasons.push('Documented SMS consent is required.')
  const zone = ['staff','browser'].includes(lead.timezone_origin) ? lead.timezone : null
  if(!smsAllowed(new Date(),zone)) reasons.push('Texting requires a verified recipient timezone and the 8 AM–8 PM local window.')
  const base = host.length===1 && !lead.dnd && lead.stage!=='Lost/Do Not Contact'
  return { email:false, emailReason:'Manual email is not supported; historical automated email remains available.',
    sms:!!(base&&cfg.sms_ready&&senderConfirmed&&lead.consent&&lead.ghl_contact_id&&smsAllowed(new Date(),zone)&&process.env.NODE_ENV==='production'),
    reasons:[...reasons,...(process.env.NODE_ENV!=='production'?['Preview does not send live messages. Publish and complete readiness checks first.']:[])] }
}
export async function getConversation(leadId:string) {
  await accessible(leadId)
  const synchronization = await refreshLeadMessages(leadId)
  const {lead} = await accessible(leadId)
  const [local,external,appointments,ready,emailHistory] = await Promise.all([
    pool.query(`SELECT m.*,COALESCE(e.status,a.status,m.state) AS status,m.error FROM sales_inbox_messages m
      LEFT JOIN email_log e ON e.id=m.email_log_id
      LEFT JOIN LATERAL (SELECT status FROM sales_activities WHERE provider_id=m.provider_id AND lead_id=m.lead_id ORDER BY occurred_at DESC LIMIT 1) a ON true
      WHERE m.lead_id=$1 ORDER BY m.created_at DESC LIMIT 500`,[leadId]),
    pool.query(`SELECT a.* FROM sales_activities a WHERE lead_id=$1 AND kind IN ('inbound_sms','outbound_sms','provider_call','inbound_email','outbound_email')
       AND NOT EXISTS(SELECT 1 FROM sales_inbox_messages m WHERE m.provider_id=a.provider_id AND m.lead_id=a.lead_id)
       AND NOT EXISTS(SELECT 1 FROM appointment_deliveries d JOIN appointment_messages am USING(appointment_id) WHERE d.provider_id=a.provider_id AND am.lead_id=a.lead_id)
      ORDER BY occurred_at DESC LIMIT 500`,[leadId]),
    pool.query(`SELECT d.*, p.status AS sms_status FROM appointment_deliveries d JOIN appointment_messages a USING(appointment_id)
      LEFT JOIN LATERAL (SELECT status FROM sales_activities WHERE provider_id=d.provider_id AND lead_id=a.lead_id AND kind='outbound_sms'
        ORDER BY occurred_at DESC LIMIT 1) p ON true
      WHERE a.lead_id=$1 AND d.channel='sms' AND d.snapshot IS NOT NULL ORDER BY d.due_at DESC LIMIT 200`,[leadId]),
    readiness(lead),
    listAppointmentEmailHistory(leadId),
  ])
  const messages = [
    ...local.rows.map(m=>({id:m.id,channel:m.channel,direction:m.direction,subject:m.subject,
      author_name:m.author_name,provider_id:m.provider_id,created_at:m.created_at,source:m.channel==='sms'?'portal':'history',
      status:m.state==='uncertain'?'uncertain':m.status,body:m.body+(m.error?`\n[${m.error}]`:'')})),
    ...external.rows.map(a=>({id:a.id,channel:a.kind==='provider_call'?'call':a.kind.endsWith('email')?'email':'sms',
      direction:a.kind.startsWith('inbound')?'inbound':a.kind==='provider_call'?'event':'outbound',body:a.body,status:a.status,
       provider_id:a.provider_id,source:'ghl',author_name:a.author_name,created_at:a.occurred_at,
       ...(a.kind==='provider_call' ? {callMedia:{detailsUrl:`/api/sales/leads/${encodeURIComponent(leadId)}/calls/${encodeURIComponent(a.id)}/details`}} : {})})),
    ...appointments.rows.map(d=>({id:d.id,channel:d.channel,direction:'outbound',
      body:d.snapshot?.rendered?.sms,provider_id:d.provider_id,source:'appointment',
      status:d.sms_status??d.state,created_at:d.sent_at??d.claimed_at??d.due_at,author_name:d.snapshot?.copy?.host})),
     ...emailHistory.messages.map(e=>{
       const html=e.html===null?null:safeEmailPreview(e.html)
       return {id:e.id,channel:e.channel,direction:e.direction,subject:e.subject,body:html===null?null:toPlainText(html),
         status:e.status,created_at:e.createdAt,author_name:e.authorName,source:e.source,provider_id:e.providerId,
         emailSnapshot:{html,contentAvailable:e.contentAvailable,recipient:e.recipient,from:e.from,replyTo:e.replyTo,
           dispatchState:e.dispatchState,providerStatus:e.providerStatus,sentAt:e.sentAt,deliveredAt:e.deliveredAt}}
     }),
  ].sort((a,b)=>+new Date(a.created_at)-+new Date(b.created_at))
  await accessible(leadId) // ownership may have changed while awaiting provider I/O
  return {lead:{id:lead.id,first_name:lead.first_name,last_name:lead.last_name,email:lead.email,phone:lead.phone},
    messages:messages.map(m=>({...m,source:m.source??(m.channel==='sms'?'portal':'history'),
      source_id:m.id,provider_id:m.provider_id??null,raw_status:m.status,
      canonical_status:m.channel==='sms'?canonicalSmsStatus(m.status):m.status})),
     synchronization,historyTruncated:emailHistory.hasMore||local.rows.length===500||external.rows.length===500||appointments.rows.length===200,
     readiness:ready,contactUrl:contactUrl(lead.ghl_contact_id)}
}
export async function refreshConversation(leadId:string) {
  await accessible(leadId)
  const result=await refreshLeadMessages(leadId)
  if(result.state!=='current') throw new Error(result.reason??'Provider refresh unavailable; showing saved history')
  return result
}
const sendSchema=z.object({leadId:z.string().min(1),channel:z.literal('sms'),subject:z.string().trim().max(200).regex(/^[^\r\n]*$/).optional(),
  body:z.string().trim().min(1).max(10000),requestId:z.string().uuid()})
export async function sendMessage(input:unknown) {
  const data=sendSchema.parse(input), admin=await requireAdmin()
  if(data.channel==='sms'&&data.body.length>1600) throw new Error('Text messages are limited to 1,600 characters')
  const fingerprint=createHash('sha256').update(JSON.stringify({...data,author:admin.userId})).digest('hex')
  const c=await pool.connect()
  const key=`sales-send:${data.leadId}`
  let locked=false
  try {
    await c.query('SELECT pg_advisory_lock(hashtextextended($1,0))',[key]);locked=true
    const lead=(await c.query('SELECT * FROM sales_leads WHERE id=$1',[data.leadId])).rows[0]
    assertInboxAccess(admin,lead)
    const existing=(await c.query('SELECT * FROM sales_inbox_messages WHERE id=$1',[data.requestId])).rows[0]
    if(existing) {
      if(existing.fingerprint!==fingerprint) throw new Error('This request ID already belongs to another message')
      return {state:['accepted','sent','delivered','read'].includes(existing.state)?'sent':existing.state,canonical_state:existing.state,error:existing.error}
    }
    if(process.env.NODE_ENV!=='production') throw new Error('Live sending is disabled in preview')
    const cfg=await inboxSettings(c)
    const capabilities=(await c.query("SELECT capabilities FROM sales_settings WHERE id='internal'")).rows[0]?.capabilities
    if(Date.parse(capabilities?.sync_rate_limit?.until)>Date.now()) throw new Error('Provider is rate limited; try again after the cooldown')
    if(lead.dnd||lead.stage==='Lost/Do Not Contact') throw new Error('This lead is marked do not contact')
    const hosts=(await c.query('SELECT * FROM appointment_hosts WHERE admin_id=$1 AND active=true',[lead.assignee_id])).rows
    if(hosts.length!==1) throw new Error('Assigned salesperson needs one verified host profile')
    const host=hosts[0]
    const staff=await getAdminUserById(host.admin_id)
    if(!staff?.active||!staff.confirmedAt) throw new Error('Assigned salesperson must have an active, verified account')
    let fromNumber:string
    {
      if(!cfg.sms_ready) throw new Error('Confirm SMS readiness first')
      if(!lead.consent) throw new Error('Documented SMS consent is required')
      if(!smsAllowed(new Date(),['staff','browser'].includes(lead.timezone_origin)?lead.timezone:null)) throw new Error('Texting is only available 8 AM–8 PM in the verified recipient timezone')
      if(!lead.ghl_contact_id) throw new Error('Contact synchronization must finish first')
      const remote=await contact(lead.ghl_contact_id)
      if(!remote||remote.id!==lead.ghl_contact_id||remote.locationId!==process.env.GHL_LOCATION_ID||
        String(remote.phone??'').replace(/[^+\d]/g,'')!==lead.phone||!/^\+[1-9]\d{9,14}$/.test(lead.phone)) throw new Error('Contact phone identity needs review')
      if(remote.dnd||remote.dndSettings?.SMS?.status==='active') throw new Error('Contact has opted out of texts')
      const threads=await conversations(lead.ghl_contact_id)
      if(remote.assignedTo!==host.ghl_user_id ||
        threads.length>1 || (threads.length===1 && (threads[0].assignedTo!==host.ghl_user_id ||
          threads[0].contactId!==lead.ghl_contact_id || threads[0].locationId!==process.env.GHL_LOCATION_ID)))
        throw new Error('Assign the GHL contact and conversation to this salesperson before texting')
      fromNumber=await smsSender()
      if(capabilities?.portal_sms_sender?.locationId!==process.env.GHL_LOCATION_ID ||
        capabilities?.portal_sms_sender?.number!==fromNumber)
        throw new Error('Existing SMS number needs confirmation in inbox settings; sender changed or is not bound')
    }
    // Commit intent before provider call. Crashes/network uncertainty never trigger blind replay.
    await c.query(`INSERT INTO sales_inbox_messages(id,lead_id,channel,direction,subject,body,author_id,author_name,state,fingerprint)
      VALUES($1,$2,$3,'outbound',$4,$5,$6,$7,'sending',$8)`,
    [data.requestId,lead.id,data.channel,data.subject??'',data.body,admin.userId,host.name,fingerprint])
    await stop(c,lead.id,'manual_conversation')
    try {
      let providerId:string|undefined
      {
        const result=await provider('/conversations/messages','POST',{type:'SMS',contactId:lead.ghl_contact_id,message:data.body,fromNumber,toNumber:lead.phone,status:'pending'})
        if(!result.messageId) throw new SalesProviderError(0,true)
        providerId=result.messageId
      }
      await c.query("UPDATE sales_inbox_messages SET state='accepted',provider_id=$2 WHERE id=$1",[data.requestId,providerId])
      // Existing composer calls provider acceptance "sent"; keep that wire
      // alias until the separate UI integration consumes canonical_state.
      return {state:'sent',canonical_state:'accepted'}
    } catch(error) {
      const state=error instanceof SalesProviderError&&!error.uncertain?'failed':'uncertain'
      const message=state==='failed'?'Provider rejected this message. Check sending readiness.':'Provider acceptance uncertain. Do not resend without checking.'
      await c.query('UPDATE sales_inbox_messages SET state=$2,error=$3 WHERE id=$1',[data.requestId,state,message])
      return {state,error:message}
    }
  } finally {
    try {if(locked) await c.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[key]);c.release()} catch{c.release(true)}
  }
}
export async function getInboxSettings() {
  const admin=await requireAdmin()
  const cfg=await inboxSettings()
  return {superAdmin:admin.role==='super_admin',settings:cfg,
    replyTo:SALES_REPLY_TO}
}
export async function saveInboxSettings(input:unknown) {
  const admin=await requireAdmin()
  if(admin.role!=='super_admin') throw new Error('Only a super admin can configure inbox sending')
  const data=z.object({smsReady:z.boolean()}).parse(input)
  const number=data.smsReady?await smsSender():null
  await transaction(async c=>{
    await inboxSettings(c)
    await c.query("INSERT INTO sales_settings(id) VALUES('internal') ON CONFLICT DO NOTHING")
    if(number) await c.query(`UPDATE sales_settings SET capabilities=jsonb_set(capabilities,'{portal_sms_sender}',$1::jsonb) WHERE id='internal'`,
      [JSON.stringify({number,locationId:process.env.GHL_LOCATION_ID,confirmedBy:admin.userId,confirmedAt:new Date().toISOString()})])
    await c.query("UPDATE sales_inbox_settings SET sms_ready=$1 WHERE id='internal'",[data.smsReady])
  })
}
