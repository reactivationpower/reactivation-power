import { z } from 'zod'
import { createHash } from 'node:crypto'
import { resolveMx } from 'node:dns/promises'
import { pool } from '@workspace/db'
import { requireAdmin } from '@/lib/auth/admin-session'
import { inboxSettings, receivingAccess, replyAddress } from '@/lib/sales-inbox/store'
import { contact, contactUrl, conversations, provider, SalesProviderError } from '@/lib/sales-leads/provider'
import { reconcileLead } from '@/lib/sales-leads/ingestion'
import { smsAllowed } from '@/lib/appointment-messages/schedule'
import { sendEmail } from '@/lib/mail/send'
import { getAdminUserById } from '@/lib/data/admin-users'
import { toPlainText } from '@/lib/mail/layout'
import { stop, transaction } from '@/lib/sales-leads/store'

export function assertInboxAccess(admin: {role:string;userId:string}, lead: any) {
  if (!lead || (admin.role !== 'super_admin' && lead.assignee_id !== admin.userId)) throw new Error('Lead not available to this salesperson')
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
  if(!cfg.email_ready) reasons.push('Email receiving setup has not been confirmed.')
  if(!cfg.sms_ready) reasons.push('SMS sending readiness has not been confirmed in inbox settings.')
  if(!lead.consent) reasons.push('Documented SMS consent is required.')
  const zone = ['staff','browser'].includes(lead.timezone_origin) ? lead.timezone : null
  if(!smsAllowed(new Date(),zone)) reasons.push('Texting requires a verified recipient timezone and the 8 AM–8 PM local window.')
  const base = host.length===1 && !lead.dnd && lead.stage!=='Lost/Do Not Contact'
  return { email:!!(base&&cfg.email_ready&&lead.email&&process.env.NODE_ENV==='production'),
    sms:!!(base&&cfg.sms_ready&&lead.consent&&lead.ghl_contact_id&&smsAllowed(new Date(),zone)&&process.env.NODE_ENV==='production'),
    reasons:[...reasons,...(process.env.NODE_ENV!=='production'?['Preview does not send live messages. Publish and complete readiness checks first.']:[])] }
}
export async function getConversation(leadId:string) {
  const {lead} = await accessible(leadId)
  const [local,external,appointments,ready] = await Promise.all([
    pool.query(`SELECT m.*,COALESCE(e.status,a.status,m.state) AS status,m.error FROM sales_inbox_messages m
      LEFT JOIN email_log e ON e.id=m.email_log_id
      LEFT JOIN LATERAL (SELECT status FROM sales_activities WHERE provider_id=m.provider_id ORDER BY occurred_at DESC LIMIT 1) a ON true
      WHERE m.lead_id=$1 ORDER BY m.created_at DESC LIMIT 500`,[leadId]),
    pool.query(`SELECT a.* FROM sales_activities a WHERE lead_id=$1 AND kind IN ('inbound_sms','outbound_sms','provider_call','inbound_email','outbound_email')
      AND NOT EXISTS(SELECT 1 FROM sales_inbox_messages m WHERE m.provider_id=a.provider_id)
      AND NOT EXISTS(SELECT 1 FROM appointment_deliveries d WHERE d.provider_id=a.provider_id)
      ORDER BY occurred_at DESC LIMIT 500`,[leadId]),
    pool.query(`SELECT d.*, e.status AS email_status FROM appointment_deliveries d JOIN appointment_messages a USING(appointment_id)
      LEFT JOIN email_log e ON e.id=d.email_log_id WHERE a.lead_id=$1 AND d.snapshot IS NOT NULL ORDER BY d.due_at DESC LIMIT 200`,[leadId]),
    readiness(lead),
  ])
  const messages = [
    ...local.rows.map(m=>({...m,status:m.state==='uncertain'?'uncertain':m.status,body:m.body+(m.error?`\n[${m.error}]`:'')})),
    ...external.rows.map(a=>({id:a.id,channel:a.kind==='provider_call'?'call':a.kind.endsWith('email')?'email':'sms',
      direction:a.kind.startsWith('inbound')?'inbound':a.kind==='provider_call'?'event':'outbound',body:a.body,status:a.status,
      author_name:a.author_name,created_at:a.occurred_at})),
    ...appointments.rows.map(d=>({id:d.id,channel:d.channel,direction:'outbound',subject:d.snapshot?.rendered?.subject,
      body:d.channel==='sms'?d.snapshot?.rendered?.sms:toPlainText(String(d.snapshot?.rendered?.html??'')),
      status:d.email_status??d.state,created_at:d.sent_at??d.claimed_at??d.due_at,author_name:d.snapshot?.copy?.host})),
  ].sort((a,b)=>+new Date(a.created_at)-+new Date(b.created_at))
  return {lead:{id:lead.id,first_name:lead.first_name,last_name:lead.last_name,email:lead.email,phone:lead.phone},messages,readiness:ready,contactUrl:contactUrl(lead.ghl_contact_id)}
}
export async function refreshConversation(leadId:string) {
  await accessible(leadId)
  await reconcileLead(leadId)
}
const sendSchema=z.object({leadId:z.string().min(1),channel:z.enum(['email','sms']),subject:z.string().trim().max(200).regex(/^[^\r\n]*$/).optional(),
  body:z.string().trim().min(1).max(10000),requestId:z.string().uuid()})
export async function sendMessage(input:unknown) {
  const data=sendSchema.parse(input), admin=await requireAdmin()
  if(data.channel==='email'&&!data.subject) throw new Error('Enter an email subject')
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
      return {state:existing.state,error:existing.error}
    }
    if(process.env.NODE_ENV!=='production') throw new Error('Live sending is disabled in preview')
    const cfg=await inboxSettings(c)
    if(lead.dnd||lead.stage==='Lost/Do Not Contact') throw new Error('This lead is marked do not contact')
    const hosts=(await c.query('SELECT * FROM appointment_hosts WHERE admin_id=$1 AND active=true',[lead.assignee_id])).rows
    if(hosts.length!==1) throw new Error('Assigned salesperson needs one verified host profile')
    const host=hosts[0]
    const staff=await getAdminUserById(host.admin_id)
    if(!staff?.active||!staff.confirmedAt) throw new Error('Assigned salesperson must have an active, verified account')
    let replyTo:string|undefined
    if(data.channel==='sms') {
      if(!cfg.sms_ready) throw new Error('Confirm SMS readiness first')
      if(!lead.consent) throw new Error('Documented SMS consent is required')
      if(!smsAllowed(new Date(),['staff','browser'].includes(lead.timezone_origin)?lead.timezone:null)) throw new Error('Texting is only available 8 AM–8 PM in the verified recipient timezone')
      if(!lead.ghl_contact_id) throw new Error('Contact synchronization must finish first')
      const remote=await contact(lead.ghl_contact_id)
      if(!remote||remote.id!==lead.ghl_contact_id||remote.locationId!==process.env.GHL_LOCATION_ID||
        String(remote.phone??'').replace(/[^+\d]/g,'')!==lead.phone||!/^\+[1-9]\d{9,14}$/.test(lead.phone)) throw new Error('Contact phone identity needs review')
      if(remote.dnd||remote.dndSettings?.SMS?.status==='active') throw new Error('Contact has opted out of texts')
      const threads=await conversations(lead.ghl_contact_id)
      if(threads.length!==1||threads[0].assignedTo!==host.ghl_user_id) throw new Error('Assign the GHL conversation to this salesperson before texting')
    } else {
      if(!cfg.email_ready) throw new Error('Email receiving setup must be completed first')
      if(!z.string().email().safeParse(lead.email).success) throw new Error('Lead email address is invalid')
      if(lead.ghl_contact_id) {
        const remote=await contact(lead.ghl_contact_id)
        if(!remote||remote.id!==lead.ghl_contact_id||remote.locationId!==process.env.GHL_LOCATION_ID||
          String(remote.email??'').toLowerCase()!==lead.email.toLowerCase()) throw new Error('Contact email identity needs review')
        if(remote.dnd||remote.dndSettings?.Email?.status==='active') throw new Error('Contact has opted out of emails')
      }
      replyTo=await replyAddress(lead.id,c)
    }
    // Commit intent before provider call. Crashes/network uncertainty never trigger blind replay.
    await c.query(`INSERT INTO sales_inbox_messages(id,lead_id,channel,direction,subject,body,author_id,author_name,state,fingerprint)
      VALUES($1,$2,$3,'outbound',$4,$5,$6,$7,'sending',$8)`,
    [data.requestId,lead.id,data.channel,data.subject??'',data.body,admin.userId,host.name,fingerprint])
    await stop(c,lead.id,'manual_conversation')
    try {
      let providerId:string|undefined,logId:string|undefined
      if(data.channel==='sms') {
        const result=await provider('/conversations/messages','POST',{type:'SMS',contactId:lead.ghl_contact_id,message:data.body})
        if(!result.messageId) throw new SalesProviderError(0,true)
        providerId=result.messageId
      } else {
        const result=await sendEmail('sales_personal',lead.email,{subject:data.subject!,body:data.body,host:host.name},
          {replyTo,idempotencyKey:data.requestId,metadata:{leadId:lead.id,inboxMessageId:data.requestId}})
        logId=result.logId
        if(!result.ok) {
          const state=result.uncertain?'uncertain':'failed'
          await c.query("UPDATE sales_inbox_messages SET state=$2,email_log_id=$3,error='Email acceptance not confirmed; review before another send' WHERE id=$1",[data.requestId,state,logId])
          return {state,error:'Email acceptance not confirmed; review before another send'}
        }
        providerId=result.providerId
      }
      await c.query("UPDATE sales_inbox_messages SET state='sent',provider_id=$2,email_log_id=$3 WHERE id=$1",[data.requestId,providerId,logId??null])
      return {state:'sent'}
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
  const issues=admin.role==='super_admin'?(await pool.query("SELECT count(*) FROM sales_inbox_inbound WHERE state='review' OR last_error IS NOT NULL")).rows[0].count:0
  return {superAdmin:admin.role==='super_admin',settings:cfg,
    receivingAccess:admin.role==='super_admin'?await receivingAccess():false,webhookConfigured:!!process.env.RESEND_WEBHOOK_SECRET,receivingIssues:Number(issues)}
}
export async function saveInboxSettings(input:unknown) {
  const admin=await requireAdmin()
  if(admin.role!=='super_admin') throw new Error('Only a super admin can configure inbox sending')
  const data=z.object({emailDomain:z.string().trim().toLowerCase().max(200),emailReady:z.boolean(),smsReady:z.boolean()}).parse(input)
  if(data.emailDomain&&!/^(?:[a-z0-9-]+\.)*patientpipeline\.app$/.test(data.emailDomain)) throw new Error('Use patientpipeline.app or a receiving subdomain under it')
  if(data.emailReady) {
    if(!data.emailDomain||!process.env.RESEND_WEBHOOK_SECRET||!await receivingAccess()) throw new Error('Resend receiving access and signed webhook setup are required')
    const mx=await resolveMx(data.emailDomain).catch(()=>[])
    if(!mx.some((r:{exchange:string})=>r.exchange.endsWith('.amazonaws.com')||r.exchange.endsWith('.resend.com'))) throw new Error('Configure Resend receiving MX records for this domain first')
  }
  await transaction(async c=>{
    const current=await inboxSettings(c)
    if(current.email_domain&&current.email_domain!==data.emailDomain&&(await c.query('SELECT 1 FROM sales_inbox_threads LIMIT 1')).rowCount)
      throw new Error('Receiving domain has active threads. Preserve reply routing; contact an administrator for a migration.')
    await c.query("UPDATE sales_inbox_settings SET email_domain=$1,email_ready=$2,sms_ready=$3 WHERE id='internal'",[data.emailDomain,data.emailReady,data.smsReady])
  })
}
