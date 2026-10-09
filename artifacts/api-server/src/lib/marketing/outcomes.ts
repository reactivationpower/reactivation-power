import { pool } from '@workspace/db'
import { getRequestContext } from '@/lib/request-context'
import { COOKIE, associate, identity, trustedConversion } from './store'
import { logger } from '@/lib/logger'
import { reconcileMarketing } from './reconcile'
/** Analytics failure must never turn a saved inquiry into a failed form response. */
export async function requestVisitorId():Promise<string|null>{
  try{
    const {req}=getRequestContext()
    if(req.header('dnt')==='1'||req.header('sec-gpc')==='1')return null
    return (await identity(req.cookies?.[COOKIE]))?.id??null
  }catch{return null}
}
export async function leadOutcome(leadId:string,businessId:string){
  try{
    const {req,res}=getRequestContext()
    if(req.header('dnt')==='1'||req.header('sec-gpc')==='1')return
    const cookie=await associate(req.cookies?.[COOKIE],leadId,businessId)
    if(cookie)res.cookie(COOKIE,cookie,{httpOnly:true,secure:req.secure||process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:90*86400000})
  }catch{logger.warn('Marketing lead outcome awaits reconciliation')}
}
export async function bookingOutcome(leadId:string,businessId:string,at=new Date()){
  try{
    await reconcileMarketing()
    await trustedConversion(pool,{id:`booking:${businessId}`,kind:'booking',leadId,at})
  }
  catch{logger.warn('Marketing booking outcome awaits reconciliation')}
}
