import { pool } from '@workspace/db'
import { requireAdmin } from '@/lib/auth/admin-session'
import { getRequestContext } from '@/lib/request-context'
import { assertSameOrigin, accessLimit } from '@/lib/affiliates/access'
import { seal, unseal } from '@/lib/affiliates/onboarding-crypto'
import { intakeSchema, validatePdf, type Contact, type Wire } from '@/lib/affiliates/onboarding-validation'
import { requireReseller, transaction, audit } from '@/lib/resellers/store'

function protect() {
  assertSameOrigin()
  getRequestContext().res.setHeader('Cache-Control','no-store, private')
}
async function manager() {
  const actor=await requireReseller()
  if (actor.role!=='reseller_manager' || !actor.companyId) throw new Error('Company manager permission required.')
  return actor as typeof actor & {companyId:string}
}
const binding = (companyId:string) => `reseller-company:${companyId}`
async function summary(companyId:string) {
  const r=(await pool.query('SELECT * FROM reseller_onboarding WHERE company_id=$1',[companyId])).rows[0]
  if (!r) return {version:0,contact:null,bank:null,w9Received:false,submittedAt:null,reviewedAt:null,status:'incomplete'}
  const contact=JSON.parse(unseal(r.contact_cipher,binding(companyId),'contact').toString()) as Contact
  const wire=JSON.parse(unseal(r.wire_cipher,binding(companyId),'wire').toString()) as Wire
  return { version:r.version,contact,bank:{bankName:wire.bankName,accountHolder:wire.accountHolder,
    accountType:wire.accountType,last4:wire.accountNumber.slice(-4)},w9Received:true,submittedAt:r.submitted_at,
    reviewedAt:r.reviewed_at,status:r.reviewed_at?'reviewed':'submitted' }
}
export async function getMyOnboarding() {
  protect(); const a=await manager()
  return {...await summary(a.companyId),loginEmail:a.email}
}
export async function saveMyOnboarding(raw:unknown) {
  protect(); const a=await manager()
  if (!await accessLimit('reseller-onboarding-save',a.companyId,20)) throw new Error('Too many submissions. Try again later.')
  const parsed=intakeSchema.safeParse(raw)
  if (!parsed.success) throw new Error(parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; '))
  const input=parsed.data
  const pdf=input.w9Base64===undefined?undefined:await validatePdf(input.w9Base64)
  const contact=seal(Buffer.from(JSON.stringify(input.contact)),binding(a.companyId),'contact')
  const wire=input.wire ? (({accountConfirmation:_,...w})=>w)(input.wire) : undefined
  const wireCipher=wire ? seal(Buffer.from(JSON.stringify(wire)),binding(a.companyId),'wire'):undefined
  const pdfCipher=pdf ? seal(pdf,binding(a.companyId),'w9'):undefined
  return transaction(async client=>{
    const company=(await client.query('SELECT * FROM reseller_companies WHERE id=$1 FOR UPDATE',[a.companyId])).rows[0]
    const member=(await client.query('SELECT * FROM reseller_members WHERE user_id=$1 FOR SHARE',[a.userId])).rows[0]
    if (company.terminated_at || !member.active || member.role!=='reseller_manager') throw new Error('Manager access ended.')
    const auth=(await client.query(`SELECT id FROM auth_idle_sessions WHERE id=$1 AND subject_id=$2 AND kind='admin'
      AND revoked_at IS NULL AND expires_at>now() AND last_interaction_at>now()-interval '5 minutes'`,[a.sessionId,a.userId])).rows[0]
    if (!auth) throw new Error('Sign in required.')
    if ((wire || pdf) && Date.now()-a.issuedAt>15*60_000)
      throw new Error('Fresh inbox verification required. Sign out and sign in again to change bank details or W-9.')
    const old=(await client.query('SELECT * FROM reseller_onboarding WHERE company_id=$1 FOR UPDATE',[a.companyId])).rows[0]
    if ((old?.version??0)!==input.version) throw new Error('Stale version: reload before submitting changes.')
    if (!old && (!wireCipher || !pdfCipher)) throw new Error('Wire details and a signed W-9 PDF are required.')
    await client.query(`INSERT INTO reseller_onboarding(company_id,contact_cipher,wire_cipher,w9_cipher)
      VALUES($1,$2,$3,$4) ON CONFLICT(company_id) DO UPDATE SET version=reseller_onboarding.version+1,
      contact_cipher=$2,wire_cipher=COALESCE($3,reseller_onboarding.wire_cipher),w9_cipher=COALESCE($4,reseller_onboarding.w9_cipher),
      submitted_at=now(),reviewed_at=NULL,reviewed_by=NULL`,[a.companyId,contact,wireCipher??old?.wire_cipher,pdfCipher??old?.w9_cipher])
    await audit(client,a.companyId,a.userId,'onboarding_submitted','Secure company payment onboarding',null,
      {version:input.version+1,bankReplaced:Boolean(wire),w9Replaced:Boolean(pdf)})
    return {ok:true,version:input.version+1}
  })
}
export async function getAdminOnboarding(companyId:string) {
  protect(); await requireAdmin('super_admin')
  return {...await summary(companyId),invitations:[]}
}
async function sensitive(input:{companyId:string;version:number},action:'wire_revealed'|'w9_downloaded'|'onboarding_reviewed') {
  protect(); const a=await requireAdmin('super_admin')
  if (!await accessLimit('reseller-onboarding-admin',a.userId,60)) throw new Error('Too many requests.')
  return transaction(async client=>{
    const r=(await client.query('SELECT * FROM reseller_onboarding WHERE company_id=$1 FOR UPDATE',[input.companyId])).rows[0]
    if (!r || r.version!==input.version) throw new Error('Information changed. Reload before continuing.')
    await audit(client,input.companyId,a.userId,action,'Owner secure onboarding access',null,{version:r.version})
    if (action==='onboarding_reviewed') {
      await client.query('UPDATE reseller_onboarding SET reviewed_at=now(),reviewed_by=$2 WHERE company_id=$1',[input.companyId,a.userId])
      return {ok:true}
    }
    if (action==='wire_revealed') return JSON.parse(unseal(r.wire_cipher,binding(input.companyId),'wire').toString())
    return {base64:unseal(r.w9_cipher,binding(input.companyId),'w9').toString('base64'),filename:'signed-w9.pdf'}
  })
}
export const reviewOnboarding=(input:{companyId:string;version:number})=>sensitive(input,'onboarding_reviewed')
export const revealOnboardingWire=(input:{companyId:string;version:number})=>sensitive(input,'wire_revealed')
export const downloadOnboardingW9=(input:{companyId:string;version:number})=>sensitive(input,'w9_downloaded')
