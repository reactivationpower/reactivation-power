import express, { Router, type IRouter } from 'express'
import { pool } from '@workspace/db'
import { assertSameOrigin, trustedAffiliateIp } from '@/lib/affiliates/access'
import { runWithRequestContext } from '@/lib/request-context'
import { getAdminSessionFromRequest } from '@/lib/auth/admin-session'
import { batchSchema, contextSchema, approvedPath } from '@/lib/marketing/validation'
import { COOKIE, establish, hash, ingest, rateLimit } from '@/lib/marketing/store'
const router:IRouter=Router()
router.get('/marketing/registry',async(_req,res)=>{
  try { res.json({pages:(await pool.query('SELECT id,path,label,funnel FROM marketing_pages WHERE active')).rows}) }
  catch {res.status(503).json({error:'Analytics unavailable'})}
})
router.get('/m/:code',async(req,res)=>{
  res.setHeader('Cache-Control','no-store')
  if(!/^[A-Za-z0-9_-]{16}$/.test(String(req.params.code))) {res.status(404).send('This tracking link is not valid.');return}
  try {
    const row=(await pool.query(`SELECT p.path,l.code FROM marketing_links l JOIN marketing_sources s ON s.id=l.source_id
      JOIN marketing_pages p ON p.id=l.page_id WHERE l.code=$1 AND l.active AND s.active AND p.active`,[req.params.code])).rows[0]
    if(!row||!approvedPath(row.path)){res.status(410).send('This tracking link is no longer active. Please visit the main website.');return}
    const params=new URLSearchParams({ms:row.code})
    // Preserve only the existing affiliate code; never arbitrary redirect parameters.
    if(typeof req.query.ref==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(req.query.ref)) params.set('ref',req.query.ref)
    res.redirect(302,`${row.path}?${params}`)
  } catch {res.status(503).send('This link is temporarily unavailable. Please visit the main website.')}
})
router.post('/marketing/forget',(_req,res)=>{
  res.clearCookie(COOKIE,{path:'/'})
  res.status(204).end()
})
router.post(['/marketing/context','/marketing/events'],express.json({limit:'32kb'}),async(req,res)=>{
  res.setHeader('Cache-Control','no-store')
  try {
    await runWithRequestContext(req,res,async()=>{
      assertSameOrigin()
      if(req.header('sec-gpc')==='1'||req.header('dnt')==='1'||req.header('x-marketing-consent')!=='granted'){
        res.status(204).end();return
      }
      const key=hash(`${new Date().toISOString().slice(0,10)}:${trustedAffiliateIp(req)??'unknown'}`)
      if(!await rateLimit(key)){res.status(429).json({error:'Rate limited'});return}
      if(req.path.endsWith('/context')){
        const input=contextSchema.parse(req.body)
        const admin=await getAdminSessionFromRequest(req)
        const classification=admin?'internal':input.page==='analytics-test'?'test':/bot|spider|crawl|preview|scanner/i.test(req.header('user-agent')??'')?'bot':'observed'
        const result=await establish(req.cookies?.[COOKIE],input,classification)
        if(result.cookie)res.cookie(COOKIE,result.cookie,{httpOnly:true,secure:req.secure||process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:result.maxAge})
        res.json({ok:true,sessionId:result.sessionId,sessionMinutes:result.sessionMinutes})
      }else{
        const input=batchSchema.parse(req.body)
        const ok=await ingest(req.cookies?.[COOKIE],input.sessionId,input.events)
        res.status(ok?200:409).json({ok})
      }
    })
  }catch(e){
    res.status(e instanceof Error&&e.name==='ZodError'?400:503).json({error:'Analytics request unavailable or invalid'})
  }
})
export default router
