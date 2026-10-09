import { randomBytes, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { pool } from '@workspace/db'
import { requireAdmin } from '@/lib/auth/admin-session'
import { assertSameOrigin } from '@/lib/affiliates/access'
import { transaction } from '@/lib/sales-leads/store'
import { approvedPath } from '@/lib/marketing/validation'
import { marketingReport } from '@/lib/marketing/report'
import { eraseMarketingHistory } from '@/lib/marketing/reconcile'
import type { SourceInput, LinkInput, ReportInput } from '@workspace/shared/marketing-analytics'
const uuid = z.string().uuid()
const label = z.string().trim().min(1).max(100)
async function owner() { assertSameOrigin(); return requireAdmin('super_admin') }
export async function getMarketingSetup() {
  const admin = await requireAdmin()
  const [sources, links, pages, settings] = await Promise.all([
    pool.query('SELECT * FROM marketing_sources ORDER BY created_at DESC'),
    pool.query('SELECT * FROM marketing_links ORDER BY created_at DESC'),
    pool.query('SELECT * FROM marketing_pages ORDER BY label'),
    pool.query("SELECT * FROM marketing_settings WHERE id='marketing'"),
  ])
  return { sources:sources.rows,links:links.rows,pages:pages.rows,settings:settings.rows[0],superAdmin:admin.role==='super_admin' }
}
export async function saveMarketingSource(input: SourceInput) {
  const admin = await owner()
  const value = z.object({id:uuid.optional(),name:label,notes:z.string().max(2000),active:z.boolean()}).strict().parse(input)
  return transaction(async c=>{
    const id=value.id??randomUUID()
    const before=(await c.query('SELECT * FROM marketing_sources WHERE id=$1 FOR UPDATE',[id])).rows[0]
    if(value.id&&!before) throw new Error('Source not found')
    const after=(await c.query(`INSERT INTO marketing_sources(id,name,notes,active) VALUES($1,$2,$3,$4)
      ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,notes=EXCLUDED.notes,active=EXCLUDED.active RETURNING *`,
      [id,value.name,value.notes,value.active])).rows[0]
    await c.query('INSERT INTO marketing_audit(actor,entity,entity_id,before_value,after_value) VALUES($1,$2,$3,$4,$5)',
      [admin.userId,'source',id,JSON.stringify(before??null),JSON.stringify(after)])
    return after
  })
}
export async function saveMarketingLink(input: LinkInput) {
  const admin=await owner()
  const value=z.object({id:uuid.optional(),sourceId:uuid,campaign:label,channel:label,page:label,active:z.boolean()}).strict().parse(input)
  return transaction(async c=>{
    if(!(await c.query('SELECT id FROM marketing_pages WHERE id=$1 AND active',[value.page])).rows.length) throw new Error('Choose an active registered page')
    const id=value.id??randomUUID(), before=(await c.query('SELECT * FROM marketing_links WHERE id=$1 FOR UPDATE',[id])).rows[0]
    if(value.id&&!before) throw new Error('Link not found')
    const after=(await c.query(`INSERT INTO marketing_links(id,source_id,code,campaign,channel,page_id,active) VALUES($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT(id) DO UPDATE SET source_id=EXCLUDED.source_id,campaign=EXCLUDED.campaign,channel=EXCLUDED.channel,page_id=EXCLUDED.page_id,active=EXCLUDED.active RETURNING *`,
      [id,value.sourceId,randomBytes(12).toString('base64url'),value.campaign,value.channel,value.page,value.active])).rows[0]
    await c.query('INSERT INTO marketing_audit(actor,entity,entity_id,before_value,after_value) VALUES($1,$2,$3,$4,$5)',
      [admin.userId,'link',id,JSON.stringify(before??null),JSON.stringify(after)])
    return after
  })
}
export async function saveMarketingPage(input: {id:string;path:string;label:string;funnel:string;active:boolean}) {
  const admin=await owner()
  const value=z.object({id:z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),path:z.string().max(150),label,
    funnel:z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),active:z.boolean()}).strict().parse(input)
  if(!approvedPath(value.path)) throw new Error('Only public first-party paths are allowed')
  return transaction(async c=>{
    const before=(await c.query('SELECT * FROM marketing_pages WHERE id=$1 FOR UPDATE',[value.id])).rows[0]
    await c.query(`INSERT INTO marketing_pages(id,path,label,funnel,active) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(id) DO UPDATE SET path=EXCLUDED.path,label=EXCLUDED.label,funnel=EXCLUDED.funnel,active=EXCLUDED.active`,
      [value.id,value.path,value.label,value.funnel,value.active])
    await c.query('INSERT INTO marketing_audit(actor,entity,entity_id,before_value,after_value) VALUES($1,$2,$3,$4,$5)',
      [admin.userId,'page',value.id,JSON.stringify(before??null),JSON.stringify(value)])
  })
}
export async function saveMarketingSettings(input: {attribution_days:number;session_minutes:number;retention_days:number}) {
  const admin=await owner()
  const v=z.object({attribution_days:z.number().int().min(1).max(365),session_minutes:z.number().int().min(5).max(120),retention_days:z.number().int().min(1).max(730)}).strict().parse(input)
  await transaction(async c=>{
    const before=(await c.query("SELECT * FROM marketing_settings WHERE id='marketing' FOR UPDATE")).rows[0]
    await c.query("UPDATE marketing_settings SET attribution_days=$1,session_minutes=$2,retention_days=$3 WHERE id='marketing'",[v.attribution_days,v.session_minutes,v.retention_days])
    await c.query('INSERT INTO marketing_audit(actor,entity,entity_id,before_value,after_value) VALUES($1,$2,$3,$4,$5)',
      [admin.userId,'settings','marketing',JSON.stringify(before),JSON.stringify(v)])
  })
}
export async function getMarketingAudit(entityId:string) {
  await owner()
  return (await pool.query('SELECT * FROM marketing_audit WHERE entity_id=$1 ORDER BY occurred_at DESC LIMIT 100',[z.string().max(100).parse(entityId)])).rows
}
async function scopedLead(leadId:string) {
  const admin=await requireAdmin()
  const lead=(await pool.query('SELECT id FROM sales_leads WHERE id=$1 AND ($2 OR assignee_id=$3)',
    [uuid.parse(leadId),admin.role==='super_admin',admin.userId])).rows[0]
  if(!lead) throw new Error('Lead not found or not assigned to you')
  return admin
}
export async function getMarketingActivity(leadId:string, page=1, order:'asc'|'desc'='desc') {
  const admin=await scopedLead(leadId)
  const direction=order==='asc'?'ASC':'DESC', offset=(z.number().int().min(1).max(10000).parse(page)-1)*20
  const [sessions,count,conversions,touches]=await Promise.all([
    pool.query(`SELECT s.*, row_number() OVER(ORDER BY s.started_at,s.id) AS number,
      (SELECT count(*) FROM marketing_events e WHERE e.session_id=s.id) AS event_count,
      (SELECT jsonb_build_object('pages',count(*) FILTER(WHERE e.kind='page_view'),'clicks',count(*) FILTER(WHERE e.kind IN ('cta','link_internal','link_outbound')),
        'errors',count(*) FILTER(WHERE e.kind IN ('booking_failure','request_error','runtime_error','video_error'))) FROM marketing_events e WHERE e.session_id=s.id) AS summary,
      (SELECT attribution FROM marketing_touches t WHERE t.session_id=s.id ORDER BY occurred_at,id LIMIT 1) AS attribution
      FROM marketing_sessions s WHERE lead_id=$1 ORDER BY started_at ${direction},id ${direction} LIMIT 20 OFFSET $2`,[leadId,offset]),
    pool.query('SELECT count(*) FROM marketing_sessions WHERE lead_id=$1',[leadId]),
    pool.query('SELECT * FROM marketing_conversions WHERE lead_id=$1 ORDER BY occurred_at',[leadId]),
    pool.query(`SELECT t.attribution,t.occurred_at FROM marketing_touches t JOIN marketing_sessions s ON s.id=t.session_id
      WHERE s.lead_id=$1 ORDER BY t.occurred_at,t.id`,[leadId]),
  ])
  return {sessions:sessions.rows,total:Number(count.rows[0].count),conversions:conversions.rows,
    first:touches.rows[0]??null,latest:touches.rows.at(-1)??null,superAdmin:admin.role==='super_admin'}
}
export async function getMarketingEvents(leadId:string,sessionId:string,page=1) {
  await scopedLead(leadId)
  const id=uuid.parse(sessionId),offset=(z.number().int().min(1).max(10000).parse(page)-1)*50
  const rows=await pool.query(`SELECT * FROM (
    SELECT e.id::text,e.session_id,e.page_id,e.kind,e.occurred_at,e.detail FROM marketing_events e JOIN marketing_sessions s ON s.id=e.session_id
      WHERE s.lead_id=$1 AND s.id=$2
    UNION ALL
    SELECT c.id,c.session_id,s.entry_page AS page_id,c.kind||'_confirmed' AS kind,c.occurred_at,
      jsonb_build_object('trusted',true,'amount_cents',c.amount_cents,'currency',c.currency) AS detail
      FROM marketing_conversions c JOIN marketing_sessions s ON s.id=c.session_id
      WHERE s.lead_id=$1 AND s.id=$2
    )activity ORDER BY occurred_at,id LIMIT 51 OFFSET $3`,[leadId,id,offset])
  return {events:rows.rows.slice(0,50),hasMore:rows.rows.length>50}
}
export async function removeMarketingHistory(leadId:string) {
  const admin=await owner()
  uuid.parse(leadId)
  await eraseMarketingHistory(leadId,admin.userId)
}
export async function getMarketingReport(input:ReportInput={}) {
  return marketingReport(await requireAdmin(),input)
}
