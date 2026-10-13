import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { PoolClient, PaymentHistory } from '@workspace/db'
import type { Request, Response } from 'express'
import type Stripe from 'stripe'
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PDFDocument } from 'pdf-lib'

const isolated=vi.hoisted(()=>({ acquire:null as null | (()=>Promise<PoolClient>),schema:'',actor:null as any }))
vi.mock('@workspace/db',async original=>{
  const actual=await original<typeof import('@workspace/db')>()
  const pool={connect:()=>isolated.acquire!(),query:async(text:string,values?:unknown[])=>{
    const client=await isolated.acquire!()
    try {return await client.query(text,values)} finally {client.release()}
  }}
  const {drizzle}=await import('drizzle-orm/node-postgres')
  return {...actual,pool,db:drizzle(pool as never)}
})
vi.mock('@/lib/auth/admin-session',()=>({
  getAdminSession:vi.fn(async()=>isolated.actor),
  requireAdmin:vi.fn(async()=>{
    if (isolated.actor?.role!=='super_admin') throw new Error('Not authorized')
    return isolated.actor
  }),
}))
vi.mock('@/lib/mail/send',()=>({sendEmail:vi.fn(async()=>({ok:true,logId:'mock'})),fromAddress:()=> 'fixture@example.invalid'}))
vi.mock('@/lib/data/admin-users',()=>({
  inviteAdminUser:vi.fn(),emailInviteLink:vi.fn(),getAdminUserById:vi.fn(),listAdminUsers:vi.fn(async()=>[]),
  normalizeRate:(r:unknown)=>r,commissionRateFor:vi.fn(),
}))
vi.mock('@/lib/supabase/admin',()=>({getAdminClient:()=>({from:()=>({
  select:()=>({eq:(_key:string,value:string)=>({
    maybeSingle:async()=>({data:(await pool.query('SELECT * FROM payment_links WHERE id::text=$1',[value])).rows[0]}),
  })}),
})})}))
vi.mock('@/lib/agreements/enrollment-invitation',()=>({inviteEnrollment:vi.fn(async()=>({status:'sent'}))}))
vi.mock('@/lib/stripe',()=>({
  getStripeMode:()=> 'test',getStripePublishableKey:()=> 'pk_test_fixture',
  stripe:{invoices:{retrieve:vi.fn(async()=>({
    total:10000,lines:{data:[{amount:10000,parent:{subscription_item_details:{}}}],has_more:false},
  })),listLineItems:vi.fn()},charges:{retrieve:vi.fn(async()=>({id:'ch_fixture',payment_intent:'pi_fixture',amount_refunded:0}))}},
}))

const actual=await vi.importActual<typeof import('@workspace/db')>('@workspace/db')
const {pool,db,paymentHistoryTable}=await import('@workspace/db')
const actions=await import('@/actions/resellers')
const payments=await import('@/actions/payments')
const onboarding=await import('@/actions/reseller-onboarding')
const {requireSeller,assertSellerLink,assertAgreementPrices}=await import('./store')
const ledger=await import('./ledger')
const finance=await import('./finance')
const {processAffiliateHistory}=await import('@/lib/affiliates/ledger')
const {generateCommissionForHistory}=await import('@/lib/billing/commissions')
const {stripe}=await import('@/lib/stripe')
const {sendEmail}=await import('@/lib/mail/send')
const {runWithRequestContext}=await import('@/lib/request-context')
const {createPaymentLink}=payments
const A='company-a',B='company-b',rep='rep-a',rep2='rep-a2',manager='manager-a',other='rep-b'
const p='prospect-a',p2='prospect-a2',pb='prospect-b',customer='customer-a',link=randomUUID()
const req={cookies:{},secure:false,socket:{remoteAddress:'127.0.0.1'},header:(name:string)=>name==='origin'?'http://localhost':name==='host'?'localhost':undefined} as unknown as Request
const res=()=>({setHeader:vi.fn(),cookie:vi.fn(),clearCookie:vi.fn()}) as unknown as Response
const context=<T>(fn:()=>Promise<T>)=>runWithRequestContext(req,res(),fn)
const sessions=new Map<string,string>()
function login(userId=rep,role='reseller_salesperson') {
  isolated.actor={userId,role,email:`${userId}@example.invalid`,name:userId,sessionId:sessions.get(userId),issuedAt:Date.now(),v:2,canManageServices:false}
}
const at=new Date('2026-02-10T15:00:00Z')
async function history(override:Partial<PaymentHistory>={}) {
  const [row]=await db.insert(paymentHistoryTable).values({
    id:randomUUID(),customerId:customer,linkId:link,kind:'invoice_paid',status:'succeeded',amountCents:10000,currency:'usd',
    description:'Synthetic fixture',source:'webhook',stripeChargeId:'ch_fixture',stripePaymentIntentId:'pi_fixture',
    stripeInvoiceId:'in_fixture',occurredAt:at,...override,
  }).returning()
  return row!
}
const sum=async()=>Number((await pool.query('SELECT COALESCE(sum(cents),0) cents FROM reseller_ledger WHERE company_id=$1',[A])).rows[0].cents)
const offerInput=(overrides:Record<string,unknown>={})=>({
  resellerProspectId:p2,requestId:randomUUID(),customer:{
    fullName:'Fixture doctor',businessName:'Fixture practice',businessAddress:'123 Test Street, Test City, MO 63101',
    phone:'3145550101',email:'rep-a2-prospect@example.invalid',ownerName:'Fixture doctor',ownerPhone:'3145550101',
  },offer:{type:'subscription' as const,monthlyDollars:200,setupFeeDollars:500},...overrides,
})

describe('reseller isolated company, enrollment and money boundaries',()=>{
  beforeAll(async()=>{
    actual.pool.options.max=3
    isolated.schema=`reseller_test_${randomUUID().replaceAll('-','')}`
    await actual.pool.query(`CREATE SCHEMA "${isolated.schema}"`)
    isolated.acquire=async()=>{
      const c=await actual.pool.connect()
      await c.query(`SET search_path TO "${isolated.schema}"`)
      return c
    }
    for (const table of ['customers','payment_links','payment_link_terms','payment_history','agreements','agreement_versions',
      'agreement_events','agreement_initials','agreement_deliveries','agreement_defaults','enrollment_invitations',
      'email_log','portal_auth_limits','auth_idle_sessions','sales_leads','commission_entries',
      'affiliates','affiliate_attributions','affiliate_ledger','affiliate_reversals','affiliate_disputes',
      'affiliate_customer_states','affiliate_rules','affiliate_audit','affiliate_history_work','affiliate_conversions',
      'affiliate_leads','affiliate_activity']) {
      // Only fixture schema writes; LIKE does not copy foreign-key links into public.
      const exists=(await actual.pool.query('SELECT to_regclass($1) present',[`public.${table}`])).rows[0].present
      if (exists) await pool.query(`CREATE TABLE ${table} (LIKE public.${table} INCLUDING ALL)`)
    }
    await pool.query(await readFile(new URL('../../../../../lib/db/migrations/0040_reseller_program.sql',import.meta.url),'utf8'))
  },60000)
  afterAll(async()=>{if(isolated.schema)await actual.pool.query(`DROP SCHEMA "${isolated.schema}" CASCADE`);await actual.pool.end()})
  beforeEach(async()=>{
    vi.clearAllMocks()
    await pool.query(`TRUNCATE reseller_payout_allocations,reseller_payouts,reseller_onboarding,reseller_disputes,
      reseller_reversals,reseller_ledger,reseller_history_work,reseller_subscription_states,reseller_sales,
      reseller_activity,reseller_prospects,reseller_members,reseller_companies,reseller_prices,
      payment_history,payment_link_terms,payment_links,customers,affiliate_ledger,affiliate_reversals,
      affiliate_attributions,affiliates,affiliate_customer_states,
      agreements,agreement_versions,agreement_events,auth_idle_sessions,portal_auth_limits CASCADE`)
    await pool.query(`INSERT INTO reseller_companies(id,business_name,email,activated_at) VALUES
      ($1,'Fixture A','a@example.invalid','2026-01-01'),($2,'Fixture B','b@example.invalid','2026-01-01')`,[A,B])
    for(const [user,company,role] of [[rep,A,'reseller_salesperson'],[rep2,A,'reseller_salesperson'],[manager,A,'reseller_manager'],[other,B,'reseller_salesperson']]){
      await pool.query('INSERT INTO reseller_members(user_id,company_id,role,name,email) VALUES($1,$2,$3,$1,$4)',[user,company,role,`${user}@example.invalid`])
      const session=randomUUID();sessions.set(user!,session)
      await pool.query(`INSERT INTO auth_idle_sessions(id,kind,subject_id,expires_at) VALUES($1,'admin',$2,now()+interval '1 day')`,[session,user])
    }
    for(const [pid,user,company] of [[p,rep,A],[p2,rep2,A],[pb,other,B]]){
      await pool.query(`INSERT INTO reseller_prospects(id,company_id,salesperson_id,full_name,business_name,email,phone)
        VALUES($1,$2,$3,$3,'Fixture office',$4,'3145550101')`,[pid,company,user,`${user}-prospect@example.invalid`])
    }
    await pool.query(`INSERT INTO customers(id,email,full_name,business_name,billing_status)
      VALUES($1,'rep-a-prospect@example.invalid','Fixture Doctor','Fixture Office','active')`,[customer])
    await pool.query(`INSERT INTO payment_links(id,token,name,email,amount_cents,status)
      VALUES($1,$2,'Fixture Doctor','rep-a-prospect@example.invalid',50000,'pending')`,[link,randomUUID()])
    await pool.query(`INSERT INTO payment_link_terms(link_id,token,customer_id,type,monthly_cents,setup_fee_cents,enrollment_flow)
      VALUES($1,$2,$3,'subscription',20000,50000,true)`,[link,randomUUID(),customer])
    await pool.query(`INSERT INTO reseller_prices(singleton,lifetime_cents,monthly_cents,setup_cents) VALUES(true,500000,30000,50000)`)
    await pool.query(`INSERT INTO reseller_sales(link_id,company_id,salesperson_id,prospect_id,customer_id,price_version,
      standard_lifetime_cents,standard_monthly_cents,standard_setup_cents,quoted_lifetime_cents,quoted_monthly_cents,quoted_setup_cents,created_at)
      VALUES($1,$2,$3,$4,$5,1,500000,30000,50000,0,20000,50000,'2026-01-01')`,[link,A,rep,p,customer])
    await pool.query('UPDATE reseller_prospects SET customer_id=$2 WHERE id=$1',[p,customer])
    vi.mocked(stripe.invoices.retrieve).mockResolvedValue({total:10000,lines:{data:[{amount:10000,parent:{subscription_item_details:{}}}],has_more:false}} as any)
    vi.mocked(stripe.charges.retrieve).mockResolvedValue({id:'ch_fixture',payment_intent:'pi_fixture',amount_refunded:0} as any)
    login()
  })
  it('personal scope excludes another rep, company, financial documents and owner controls',async()=>{
    const w=await actions.getWorkspace()
    expect(w.prospects.map((r:any)=>r.id)).toEqual([p]);expect(w.report).toBeNull();expect(w.members).toEqual([])
    for(const guessed of [p2,pb,'missing'])await expect(actions.getProspect(guessed)).rejects.toThrow('Prospect not found')
    await expect(actions.updateProspect(pb,{revision:1,reason:'fixture',fullName:'Attack'})).rejects.toThrow()
    await expect(actions.logFollowup(p2,{kind:'note',notes:'Attack'})).rejects.toThrow()
    await expect(context(()=>onboarding.getMyOnboarding())).rejects.toThrow('manager')
    await expect(actions.listCompanies()).rejects.toThrow('authorized')
    login(manager,'reseller_manager')
    expect((await actions.getWorkspace()).prospects).toHaveLength(2)
    await expect(actions.getProspect(pb)).rejects.toThrow()
    await expect(actions.savePrices({lifetimeCents:1,monthlyCents:1,setupCents:0,reason:'attack'})).rejects.toThrow('authorized')
    login(other)
    await expect(actions.getSale(link)).rejects.toThrow()
    await expect(assertSellerLink(await requireSeller(),link)).rejects.toThrow()
    await expect(actions.getAgreementForm(link)).rejects.toThrow()
    await expect(actions.previewAgreement(link,{} as any)).rejects.toThrow()
    await expect(actions.sendAgreement(link,{} as any)).rejects.toThrow()
    await expect(actions.retryEnrollment(link)).rejects.toThrow()
  })
  it('manager assignment changes ownership but never freezes sales to a different salesperson',async()=>{
    login(manager,'reseller_manager')
    await actions.updateProspect(p,{revision:1,salespersonId:rep2,reason:'Manager reassignment'})
    expect((await pool.query('SELECT salesperson_id FROM reseller_sales WHERE link_id=$1',[link])).rows[0].salesperson_id).toBe(rep)
    login(rep2)
    expect((await actions.getProspect(p)).offers).toHaveLength(0)
    await expect(assertSellerLink(await requireSeller(),link)).rejects.toThrow()
    await expect(actions.updateProspect(p,{revision:2,salespersonId:other,reason:'attack'})).rejects.toThrow()
    login(manager,'reseller_manager')
    await expect(actions.updateProspect(p,{revision:2,salespersonId:other,reason:'attack'})).rejects.toThrow()
    await expect(actions.updateProspect(p,{revision:1,fullName:'Stale',reason:'fixture'})).rejects.toThrow('changed')
    login(rep)
    expect((await actions.getWorkspace()).sales.map((s:any)=>s.link_id)).toEqual([link])
    expect((await actions.getSale(link)).sale.customer_id).toBe(customer)
  })
  it('deactivation and termination revoke existing sessions and preserve financial history',async()=>{
    const earned=await history();await ledger.processResellerHistory(earned)
    login('owner','super_admin')
    await actions.setMemberActive({userId:rep,active:false,reason:'Fixture access revoked'})
    login(rep);await expect(requireSeller()).rejects.toThrow()
    login('owner','super_admin')
    await actions.terminateCompany(A,'Fixture relationship ended')
    login(manager,'reseller_manager');await expect(requireSeller()).rejects.toThrow()
    expect(await sum()).toBe(2000)
    expect((await pool.query('SELECT count(*)::int n FROM reseller_activity WHERE company_id=$1',[A])).rows[0].n).toBe(2)
  })
  it('external followup creates no internal jobs or leads and enforces opt-out',async()=>{
    await actions.logFollowup(p,{kind:'call',notes:'External phone tool',disposition:'Do Not Contact'})
    const scoped=await actions.getProspect(p)
    expect(scoped.prospect.do_not_contact).toBe(true)
    await expect(actions.updateProspect(p,{revision:2,doNotContact:false,stage:'Contacted',reason:'No consent'})).rejects.toThrow('consent')
    await actions.updateProspect(p,{revision:2,doNotContact:false,stage:'Contacted',consentEvidence:'Fresh explicit request',reason:'New consent'})
    await expect(actions.logFollowup(p,{kind:'call',notes:'External call',disposition:'Connected'})).rejects.toThrow('follow-up')
    expect((await pool.query('SELECT count(*)::int n FROM sales_leads')).rows[0].n).toBe(0)
  })
  it('approved offer caps, setup, missing configuration and recovery are enforced server-side',async()=>{
    login(rep2)
    expect((await context(()=>createPaymentLink(offerInput({resellerProspectId:p})))).ok).toBe(false)
    const tooCheap=await context(()=>createPaymentLink(offerInput({offer:{type:'subscription',monthlyDollars:199.99,setupFeeDollars:500}})))
    expect(tooCheap.ok).toBe(false);expect(tooCheap.error).toMatch(/\$100/)
    expect((await context(()=>createPaymentLink(offerInput({offer:{type:'subscription',monthlyDollars:200,setupFeeDollars:0}})))).ok).toBe(false)
    await pool.query('DELETE FROM reseller_prices')
    expect((await context(()=>createPaymentLink(offerInput()))).error).toMatch(/configures/)
    await pool.query('INSERT INTO reseller_prices(singleton,lifetime_cents,monthly_cents,setup_cents) VALUES(true,500000,30000,50000)')
    const input=offerInput()
    const first=await context(()=>createPaymentLink(input));expect(first.ok).toBe(true)
    await pool.query('UPDATE reseller_prices SET monthly_cents=90000,version=2')
    const replay=await context(()=>createPaymentLink(input));expect(replay.link?.id).toBe(first.link?.id)
    expect((await pool.query('SELECT count(*)::int n FROM reseller_sales WHERE prospect_id=$1',[p2])).rows[0].n).toBe(1)
    const saved=(await pool.query('SELECT * FROM reseller_sales WHERE prospect_id=$1',[p2])).rows[0]
    expect(saved.standard_monthly_cents).toBe(30000);expect(saved.quoted_monthly_cents).toBe(20000)
    expect(first.link?.rep_id).toBeNull()
    await assertAgreementPrices(first.link!.id,'subscription',{monthlyCents:20000,setupFeeCents:50000,termMonths:12,noticeDays:0},await requireSeller())
    await expect(assertAgreementPrices(first.link!.id,'subscription',{monthlyCents:19999,setupFeeCents:50000,termMonths:12,noticeDays:0},await requireSeller())).rejects.toThrow()
  })
  it('existing identity conflicts need an explicit owner resolution, never historical reattribution',async()=>{
    await pool.query('UPDATE reseller_prospects SET email=$2 WHERE id=$1',[p2,'rep-a-prospect@example.invalid'])
    login(rep2)
    const input=offerInput()
    input.customer.email='rep-a-prospect@example.invalid'
    expect((await context(()=>createPaymentLink(input))).error).toMatch(/owner/)
    await expect(actions.resolveCustomerConflict({prospectId:p2,customerId:customer,reason:'Attack'})).rejects.toThrow()
    login('owner','super_admin')
    await actions.resolveCustomerConflict({prospectId:p2,customerId:customer,reason:'Owner checked matching identity; future offers only'})
    login(rep2)
    expect((await context(()=>createPaymentLink(input))).ok).toBe(true)
    expect((await pool.query('SELECT salesperson_id FROM reseller_sales WHERE link_id=$1',[link])).rows[0].salesperson_id).toBe(rep)
  })
  it('eligible collected revenue earns exactly 20% once, never affiliate/staff commissions',async()=>{
    const row=await history()
    await Promise.all([ledger.processResellerHistory(row),ledger.processResellerHistory(row)])
    const duplicate=await history({stripeChargeId:null})
    await ledger.processResellerHistory(duplicate)
    await processAffiliateHistory(row)
    expect(await sum()).toBe(2000)
    expect((await pool.query('SELECT count(*)::int n FROM affiliate_ledger')).rows[0].n).toBe(0)
    expect((await generateCommissionForHistory(row)).created).toBe(false)
  })
  it('setup is excluded and combined invoices use recurring-line collected allocation',async()=>{
    await ledger.processResellerHistory(await history({stripeInvoiceId:null}))
    expect(await sum()).toBe(0)
    vi.mocked(stripe.invoices.retrieve).mockResolvedValue({total:15000,lines:{data:[
      {amount:5000,parent:{invoice_item_details:{}}},{amount:10000,parent:{subscription_item_details:{}}}],has_more:false}} as any)
    await ledger.processResellerHistory(await history({amountCents:12000}))
    expect(await sum()).toBe(1600)
    const report=await finance.financialReport(A)
    expect(report.collected_cents).toBe(8000)
    await ledger.processResellerHistory(await history({kind:'refund',status:'refunded',amountCents:3000,stripeRefundId:'re_fixture',stripeInvoiceId:null,occurredAt:new Date('2026-03-01')}))
    expect(await sum()).toBe(1200)
  })
  it('lifetime collections need no invoice, but late events use relationship/event time',async()=>{
    await pool.query("UPDATE payment_link_terms SET type='one_time' WHERE link_id=$1",[link])
    await pool.query("UPDATE reseller_companies SET terminated_at='2026-03-01' WHERE id=$1",[A])
    await ledger.processResellerHistory(await history({stripeInvoiceId:null,amountCents:500000}))
    expect(await sum()).toBe(100000)
    await ledger.processResellerHistory(await history({stripeInvoiceId:null,stripeChargeId:'ch_late',stripePaymentIntentId:'pi_late',occurredAt:new Date('2026-03-01')}))
    expect(await sum()).toBe(100000)
  })
  it('out-of-order partial refunds and disputes never double deduct; winning restores only dispute loss',async()=>{
    const refund=await history({kind:'refund',status:'refunded',amountCents:2500,stripeRefundId:'re_fixture',stripeInvoiceId:null,occurredAt:new Date('2026-03-01')})
    await ledger.processResellerHistory(refund)
    const row=await history();await ledger.processResellerHistory(row);expect(await sum()).toBe(1500)
    const dispute={id:'dp_fixture',charge:'ch_fixture',amount:10000,status:'needs_response',balance_transactions:[]} as unknown as Stripe.Dispute
    await ledger.processResellerDispute(dispute,new Date('2026-03-02'));expect(await sum()).toBe(0)
    await ledger.processResellerDispute(dispute,new Date('2026-03-02'));await ledger.processResellerHistory(refund);expect(await sum()).toBe(0)
    await ledger.processResellerDispute({...dispute,status:'won'},new Date('2026-03-05'));expect(await sum()).toBe(1500)
    await ledger.processResellerDispute(dispute,new Date('2026-03-03'));expect(await sum()).toBe(1500)
  })
  it('dispute before payment and source-linked full refund after termination are durable',async()=>{
    await ledger.processResellerDispute({id:'dp_fixture',charge:'ch_fixture',amount:10000,status:'lost',balance_transactions:[]} as any,new Date('2026-03-01'))
    await ledger.processResellerHistory(await history());expect(await sum()).toBe(0)
    await ledger.processResellerDispute({id:'dp_fixture',charge:'ch_fixture',amount:10000,status:'won',balance_transactions:[]} as any,new Date('2026-03-02'))
    expect(await sum()).toBe(2000)
    login('owner','super_admin');await actions.terminateCompany(A,'Fixture termination')
    await ledger.processResellerHistory(await history({kind:'refund',status:'refunded',amountCents:10000,stripeRefundId:'re_full',stripeInvoiceId:null,occurredAt:new Date()}))
    expect(await sum()).toBe(0)
    expect((await pool.query("SELECT earning_id FROM reseller_ledger WHERE kind='clawback'")).rows.every((r:any)=>Boolean(r.earning_id))).toBe(true)
  })
  it('refund event before any billing history still follows its later collected source',async()=>{
    await ledger.processResellerRefundedCharge({id:'ch_fixture',payment_intent:'pi_fixture',amount_refunded:5000} as any,new Date('2026-03-01'))
    await ledger.processResellerHistory(await history())
    expect(await sum()).toBe(1000)
  })
  it('subscription cancellation/reinstatement uses effective times and recovers earlier suppressed collections',async()=>{
    await ledger.recordResellerEligibility(link,false,new Date('2026-02-01'),'cancel-fixture')
    const row=await history();await ledger.processResellerHistory(row);expect(await sum()).toBe(0)
    await ledger.recordResellerEligibility(link,true,new Date('2026-02-02'),'active-fixture')
    await ledger.processResellerHistory(row);expect(await sum()).toBe(2000)
    await ledger.recordResellerEligibility(link,false,new Date('2026-02-05'),'late-cancel-fixture');expect(await sum()).toBe(0)
    await ledger.recordResellerEligibility(link,true,new Date('2026-02-06'),'late-active-fixture');expect(await sum()).toBe(2000)
    await ledger.recordResellerEligibility(link,false,new Date('2026-03-01'),'future-cancel-fixture');expect(await sum()).toBe(2000)
  })
  it('wire readiness, concurrency, replay and post-payout debt are company-bounded',async()=>{
    await ledger.processResellerHistory(await history())
    const input={companyId:A,period:'2026-02',amountCents:2000,paymentDate:'2026-03-02',reference:'External fixture wire',key:randomUUID()}
    await expect(finance.recordWire(input,'fixture-owner')).rejects.toThrow('onboarding')
    await pool.query(`INSERT INTO reseller_onboarding(company_id,contact_cipher,wire_cipher,w9_cipher,reviewed_at) VALUES($1,'fixture','fixture','fixture',now())`,[A])
    const [one,two]=await Promise.all([finance.recordWire(input,'fixture-owner'),finance.recordWire(input,'fixture-owner')])
    expect(one.id).toBe(two.id);expect((await pool.query('SELECT count(*)::int n FROM reseller_payouts')).rows[0].n).toBe(1)
    await expect(finance.recordWire({...input,key:randomUUID()},'fixture-owner')).rejects.toThrow('net payable')
    await expect(finance.recordWire({...input,amountCents:1000},'fixture-owner')).rejects.toThrow('another wire')
    expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(1)
    await ledger.processResellerHistory(await history({kind:'refund',status:'refunded',amountCents:10000,stripeRefundId:'re_full',stripeInvoiceId:null,occurredAt:new Date('2026-04-01')}))
    const report=await finance.financialReport(A);expect(report.balance_cents).toBe(-2000)
    expect(report.periods.every((r:any)=>r.wireable_cents===0)).toBe(true)
    expect((await finance.financialReport(B)).balance_cents).toBe(0)
  })
  it('wire/W-9 intake uses personal manager scope, encrypted company binding and versioned audit',async()=>{
    const pdf=await PDFDocument.create();pdf.addPage()
    const address={line1:'123 Fixture St',line2:'',city:'Fixture City',state:'MO',zip:'63101',country:'US' as const}
    const input={version:0,contact:{contactName:'Fixture Manager',phone:'3145550101',legalName:'Fixture A LLC',dba:'',address},
      wire:{bankName:'Fixture Bank',bankAddress:address,accountHolder:'Fixture A LLC',accountType:'checking' as const,
        routingNumber:'021000021',accountNumber:'12345678',accountConfirmation:'12345678',instructions:''},
      w9Base64:Buffer.from(await pdf.save()).toString('base64')}
    await expect(context(()=>onboarding.saveMyOnboarding(input))).rejects.toThrow('manager')
    login(manager,'reseller_manager')
    await context(()=>onboarding.saveMyOnboarding(input))
    const my=await context(()=>onboarding.getMyOnboarding())
    expect(my.bank?.last4).toBe('5678');expect(JSON.stringify(my)).not.toContain('12345678')
    const encrypted=(await pool.query('SELECT * FROM reseller_onboarding WHERE company_id=$1',[A])).rows[0]
    expect(encrypted.wire_cipher).not.toContain('12345678');expect(encrypted.contact_cipher).not.toContain('Fixture Manager')
    await expect(context(()=>onboarding.saveMyOnboarding(input))).rejects.toThrow('Stale')
    await expect(context(()=>onboarding.revealOnboardingWire({companyId:A,version:1}))).rejects.toThrow('authorized')
    isolated.actor.issuedAt=Date.now()-20*60_000
    await expect(context(()=>onboarding.saveMyOnboarding({...input,version:1}))).rejects.toThrow('Fresh')
    login('owner','super_admin')
    await context(()=>onboarding.reviewOnboarding({companyId:A,version:1}))
    expect((await context(()=>onboarding.revealOnboardingWire({companyId:A,version:1}))).accountNumber).toBe('12345678')
    expect((await context(()=>onboarding.downloadOnboardingW9({companyId:A,version:1}))).base64).toBe(input.w9Base64)
  })
})
