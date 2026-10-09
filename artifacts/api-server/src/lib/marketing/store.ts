import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { pool, type PoolClient } from '@workspace/db'
import { transaction } from '@/lib/sales-leads/store'
import { cleanContext, type contextSchema } from './validation'
import type { z } from 'zod'
import { MARKETING_CONTROLS, WALKTHROUGH_PLACEMENTS, type MarketingEvent } from '@workspace/shared/marketing-analytics'

export const COOKIE = 'pp_marketing'
export const hash = (s: string) => createHash('sha256').update(s).digest('hex')
type Connection = Pick<PoolClient,'query'>
export async function identity(raw: unknown, c: Connection = pool) {
  if (typeof raw !== 'string' || !/^[a-f0-9-]{36}\.[A-Za-z0-9_-]{32}$/.test(raw)) return null
  const [id, secret] = raw.split('.')
  const row = (await c.query('SELECT * FROM marketing_visitors WHERE id=$1 AND expires_at>now() AND removed_at IS NULL', [id])).rows[0]
  return row && timingSafeEqual(Buffer.from(hash(secret)),Buffer.from(row.secret_hash)) ? row : null
}
async function createVisitor(c: Connection, classification: string, days: number) {
  const id = randomUUID(), secret = randomBytes(24).toString('base64url')
  const visitor = (await c.query(`INSERT INTO marketing_visitors(id,secret_hash,expires_at,classification)
    VALUES($1,$2,now()+$3*interval '1 day',$4) RETURNING *`,[id,hash(secret),days,classification])).rows[0]
  return { visitor, cookie: `${id}.${secret}` }
}
export async function establish(raw: unknown, input: z.infer<typeof contextSchema>, classification: string) {
  return transaction(async c => {
    const cfg = (await c.query("SELECT * FROM marketing_settings WHERE id='marketing'")).rows[0]
    const page = (await c.query('SELECT * FROM marketing_pages WHERE id=$1 AND active',[input.page])).rows[0]
    if (!page) throw new Error('Unregistered page')
    let visitor = await identity(raw,c), cookie: string | undefined
    if (!visitor) ({ visitor,cookie } = await createVisitor(c,classification,cfg.attribution_days))
    else if(classification!=='observed'&&visitor.classification==='observed')
      await c.query('UPDATE marketing_visitors SET classification=$2 WHERE id=$1',[visitor.id,classification])
    await c.query('SELECT id FROM marketing_visitors WHERE id=$1 FOR UPDATE',[visitor.id])
    visitor = (await c.query('SELECT * FROM marketing_visitors WHERE id=$1 AND removed_at IS NULL AND expires_at>now()',[visitor.id])).rows[0]
    if(!visitor)({visitor,cookie}=await createVisitor(c,classification,cfg.attribution_days))
    let session = (await c.query(`SELECT * FROM marketing_sessions WHERE visitor_id=$1 AND last_at>now()-$2*interval '1 minute'
      ORDER BY started_at DESC LIMIT 1`,[visitor.id,cfg.session_minutes])).rows[0]
    if (session && page.id !== 'calendar' && session.funnel !== page.funnel) session = null
    const newSession = !session
    if (!session) {
      session = (await c.query(`INSERT INTO marketing_sessions(id,visitor_id,lead_id,entry_page,funnel,device)
        VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[randomUUID(),visitor.id,visitor.lead_id,page.id,page.funnel,input.device])).rows[0]
    }
    const clean = cleanContext(input)
    const link = input.source ? (await c.query(`SELECT l.*,s.name FROM marketing_links l JOIN marketing_sources s ON s.id=l.source_id
      WHERE l.code=$1 AND l.active AND s.active`,[input.source])).rows[0] : null
    const attribution = link
      ? { sourceId:link.source_id, source:link.name, linkId:link.id, campaign:link.campaign, channel:link.channel, ...clean }
      : { source: clean.utm.utm_source ?? (clean.referrer ? /(^|\.)(google|bing|duckduckgo|yahoo)\./.test(clean.referrer) ? 'organic' : 'referral' : 'direct'),
          campaign:clean.utm.utm_campaign ?? '',channel:clean.utm.utm_medium ?? '',...clean }
    // Internal navigation is not a new acquisition. A new direct session is.
    if (newSession || input.entry || link || Object.keys(clean.utm).length || clean.referrer)
      await c.query('INSERT INTO marketing_touches(visitor_id,session_id,attribution) VALUES($1,$2,$3)',[visitor.id,session.id,JSON.stringify(attribution)])
    await c.query('UPDATE marketing_sessions SET last_at=now() WHERE id=$1',[session.id])
    return { sessionId:session.id,cookie,maxAge:cfg.attribution_days*86400000,sessionMinutes:cfg.session_minutes }
  })
}
export async function ingest(raw: unknown, sessionId: string, events: MarketingEvent[]) {
  return transaction(async c => {
    const visitor = await identity(raw,c)
    if (!visitor) return false
    await c.query('SELECT id FROM marketing_visitors WHERE id=$1 FOR UPDATE',[visitor.id])
    const cfg = (await c.query("SELECT session_minutes FROM marketing_settings WHERE id='marketing'")).rows[0]
    const session = (await c.query(`SELECT * FROM marketing_sessions WHERE visitor_id=$1 AND id=$3 AND last_at>now()-$2*interval '1 minute'`,
      [visitor.id,cfg.session_minutes,sessionId])).rows[0]
    if (!session) return false
    const pages = new Set((await c.query('SELECT id FROM marketing_pages WHERE active')).rows.map(r=>r.id))
    for (const e of events) {
      if (e.control && !(MARKETING_CONTROLS as readonly string[]).includes(e.control) && ![...pages].some(p=>e.control===`to-${p}`)) continue
      if (e.placement && !(WALKTHROUGH_PLACEMENTS as readonly string[]).includes(e.placement)) continue
      const at = Date.parse(e.at)
      if (!pages.has(e.page) || at>Date.now()+60000 || at<Date.now()-86400000 || at<new Date(session.started_at).getTime()-60000) continue
      const { id,version,at:stamp,page,type,...detail } = e
      await c.query(`INSERT INTO marketing_events(id,version,session_id,page_id,kind,occurred_at,detail)
        VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING`,[id,version,session.id,page,type,stamp,JSON.stringify(detail)])
    }
    await c.query('UPDATE marketing_sessions SET last_at=now() WHERE id=$1',[session.id])
    return true
  })
}
export async function touches(c: Connection, visitorId: string | null, before: Date) {
  if (!visitorId) return { first: {source:'unattributed'},last:{source:'unattributed'} }
  const rows = (await c.query(`SELECT attribution FROM marketing_touches WHERE visitor_id=$1 AND occurred_at<=$2
    AND occurred_at>=$2::timestamptz-(SELECT attribution_days FROM marketing_settings WHERE id='marketing')*interval '1 day'
    ORDER BY occurred_at,id`,[visitorId,before])).rows
  return { first:rows[0]?.attribution ?? {source:'unknown'},last:rows.at(-1)?.attribution ?? {source:'unknown'} }
}
/** Invoke only after authoritative intake; ambiguous identity must not call this. */
export async function associate(raw: unknown, leadId: string, businessId: string, at = new Date()) {
  return transaction(async c => {
    let visitor = await identity(raw,c)
    let cookie: string | undefined
    if (visitor) {
      await c.query('SELECT id FROM marketing_visitors WHERE id=$1 FOR UPDATE',[visitor.id])
      visitor = (await c.query('SELECT * FROM marketing_visitors WHERE id=$1',[visitor.id])).rows[0]
      if(visitor.removed_at||new Date(visitor.expires_at)<=new Date()){
        const cfg=(await c.query("SELECT attribution_days FROM marketing_settings WHERE id='marketing'")).rows[0]
        ;({visitor,cookie}=await createVisitor(c,visitor.classification,cfg.attribution_days))
      }
      if (visitor.lead_id && visitor.lead_id !== leadId) {
        const cfg = (await c.query("SELECT attribution_days FROM marketing_settings WHERE id='marketing'")).rows[0]
        ;({visitor,cookie}=await createVisitor(c,visitor.classification,cfg.attribution_days))
      }
      await c.query('UPDATE marketing_visitors SET lead_id=$2 WHERE id=$1',[visitor.id,leadId])
      await c.query('UPDATE marketing_sessions SET lead_id=$2 WHERE visitor_id=$1 AND lead_id IS NULL',[visitor.id,leadId])
    }
    const session = visitor ? (await c.query('SELECT * FROM marketing_sessions WHERE visitor_id=$1 ORDER BY started_at DESC LIMIT 1',[visitor.id])).rows[0] : null
    const snapshot = await touches(c,visitor?.id ?? null,at)
    await c.query(`INSERT INTO marketing_conversions(id,kind,lead_id,visitor_id,session_id,funnel,occurred_at,first_touch,last_touch,classification)
      VALUES($1,'lead',$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO NOTHING`,
      [`lead:${businessId}`,leadId,visitor?.id??null,session?.id??null,session?.funnel??null,at,JSON.stringify(snapshot.first),JSON.stringify(snapshot.last),visitor?.classification??'observed'])
    return cookie
  })
}
export async function trustedConversion(c: Connection, input: {
  id:string;kind:'booking'|'customer'|'payment'|'refund'|'dispute';leadId:string|null;customerId?:string;
  at:Date;amount?:number;currency?:string
}) {
  const prior = (await c.query(`SELECT * FROM marketing_conversions WHERE lead_id=$1 AND occurred_at<=$2
    AND kind='lead' ORDER BY occurred_at DESC LIMIT 1`,[input.leadId,input.at])).rows[0]
  const session = prior?.visitor_id ? (await c.query(`SELECT * FROM marketing_sessions
    WHERE visitor_id=$1 AND started_at<=$2 ORDER BY started_at DESC LIMIT 1`,[prior.visitor_id,input.at])).rows[0] : null
  const customerSnapshot = input.customerId ? (await c.query("SELECT first_touch,last_touch FROM marketing_conversions WHERE id=$1",[`customer:${input.customerId}`])).rows[0] : null
  const snapshot = customerSnapshot ? {first:customerSnapshot.first_touch,last:customerSnapshot.last_touch} : await touches(c,prior?.visitor_id??null,input.at)
  await c.query(`INSERT INTO marketing_conversions(id,kind,lead_id,customer_id,visitor_id,session_id,funnel,occurred_at,
    first_touch,last_touch,amount_cents,currency,classification) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT(id) DO NOTHING`,
    [input.id,input.kind,input.leadId,input.customerId??null,prior?.visitor_id??null,session?.id??prior?.session_id??null,prior?.funnel??null,input.at,
      JSON.stringify(snapshot.first),JSON.stringify(snapshot.last),input.amount??0,input.currency??null,prior?.classification??'observed'])
}
/** Durable cross-instance limiter; hashes are temporary abuse keys, not identity. */
export async function rateLimit(key: string, limit=120) {
  const row = (await pool.query(`INSERT INTO marketing_limits(key,window_at,requests) VALUES($1,date_trunc('minute',now()),1)
    ON CONFLICT(key) DO UPDATE SET requests=CASE WHEN marketing_limits.window_at<date_trunc('minute',now()) THEN 1 ELSE marketing_limits.requests+1 END,
    window_at=date_trunc('minute',now()) RETURNING requests`,[key])).rows[0]
  return row.requests<=limit
}
