import { pool } from '@workspace/db'
import { financialReport as totalsFor, wireableCents } from '@/lib/affiliates/finance'
import { sendEmail } from '@/lib/mail/send'
import { id, transaction, audit } from './store'

export async function financialReport(companyId: string) {
  const entries=(await pool.query('SELECT * FROM reseller_ledger WHERE company_id=$1 ORDER BY occurred_at,id',[companyId])).rows
  const payouts=(await pool.query('SELECT *,payment_date::text AS payment_date FROM reseller_payouts WHERE company_id=$1 ORDER BY created_at',[companyId])).rows
  const totals=totalsFor(entries,payouts)
  return { ...totals, entries, payouts,
    periods: totals.periods.map(p=>({...p,earned_cents:p.net_cents})),
    collected_cents: entries.filter(e=>e.kind==='earning').reduce((s,e)=>s+e.collected_cents,0),
    reversals_cents: entries.filter(e=>e.kind==='clawback'||e.kind==='recovery').reduce((s,e)=>s+e.cents,0),
    sales: await salesProgress(companyId),
    onboarding_status: (await pool.query(`SELECT CASE WHEN reviewed_at IS NOT NULL THEN 'reviewed' ELSE 'submitted' END status
      FROM reseller_onboarding WHERE company_id=$1`,[companyId])).rows[0]?.status ?? 'incomplete' }
}
export async function salesProgress(companyId: string, salespersonId: string | null = null) {
  return (await pool.query(`SELECT s.*,c.full_name customer_name,c.business_name,t.type,t.completed_at,
      t.subscription_status,a.status agreement_status,m.name salesperson_name
      FROM reseller_sales s JOIN customers c ON c.id=s.customer_id JOIN payment_link_terms t ON t.link_id=s.link_id
      LEFT JOIN agreements a ON a.link_id=s.link_id JOIN reseller_members m ON m.user_id=s.salesperson_id
      WHERE s.company_id=$1 AND ($2::text IS NULL OR s.salesperson_id=$2) ORDER BY s.created_at DESC`,[companyId,salespersonId])).rows
}
export interface WireInput { companyId: string; period: string; amountCents: number; paymentDate: string; reference: string; key: string }
export async function recordWire(input: WireInput, actor: string) {
  const date = new Date(`${input.paymentDate}T12:00:00Z`)
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.period) || !/^\d{4}-\d{2}-\d{2}$/.test(input.paymentDate) ||
    !Number.isFinite(+date) || date.toISOString().slice(0,10)!==input.paymentDate ||
    !Number.isSafeInteger(input.amountCents) || input.amountCents<=0 || input.amountCents>99999999 ||
    typeof input.reference!=='string' || !input.reference.trim() || input.reference.length>200 ||
    typeof input.key!=='string' || !/^[\w-]{16,100}$/.test(input.key)) throw new Error('Enter a valid period, date, amount, reference and request key.')
  const payoutId=await transaction(async client=>{
    const company=(await client.query('SELECT * FROM reseller_companies WHERE id=$1 FOR UPDATE',[input.companyId])).rows[0]
    if (!company) throw new Error('Company not found.')
    const old=(await client.query('SELECT *,payment_date::text AS paid_date FROM reseller_payouts WHERE request_key=$1',[input.key])).rows[0]
    if (old) {
      if (old.company_id!==input.companyId || old.period!==input.period || old.amount_cents!==input.amountCents ||
        old.paid_date!==input.paymentDate || old.reference!==input.reference.trim()) throw new Error('Request key belongs to another wire.')
      return old.id
    }
    const onboarding=(await client.query('SELECT reviewed_at FROM reseller_onboarding WHERE company_id=$1 FOR SHARE',[input.companyId])).rows[0]
    if (!onboarding?.reviewed_at) throw new Error('Review company wire/W-9 onboarding before recording a payout.')
    const totals=(await client.query(`SELECT
      COALESCE((SELECT sum(cents) FROM reseller_ledger WHERE company_id=$1),0)::bigint earned,
      COALESCE((SELECT sum(cents) FROM reseller_ledger WHERE company_id=$1 AND period<=$2),0)::bigint through_period,
      COALESCE((SELECT sum(amount_cents) FROM reseller_payouts WHERE company_id=$1),0)::bigint paid`,[input.companyId,input.period])).rows[0]
    if (input.amountCents>wireableCents(Number(totals.earned),Number(totals.through_period),Number(totals.paid)))
      throw new Error('Wire exceeds the net payable balance after reversals and earlier wires.')
    const payout=id()
    await client.query(`INSERT INTO reseller_payouts(id,company_id,period,amount_cents,payment_date,reference,request_key,
      actor,notification_recipient,notification_business_name) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [payout,input.companyId,input.period,input.amountCents,input.paymentDate,input.reference.trim(),input.key,actor,company.email,company.business_name])
    const available=(await client.query(`SELECT l.id,l.cents-COALESCE(sum(a.cents),0)::int remaining FROM reseller_ledger l
      LEFT JOIN reseller_payout_allocations a ON a.earning_id=l.id WHERE l.company_id=$1 AND l.cents>0 AND l.period<=$2
      GROUP BY l.id ORDER BY l.occurred_at,l.id`,[input.companyId,input.period])).rows
    let remaining=input.amountCents
    for (const e of available) {
      const amount=Math.max(0,Math.min(remaining,e.remaining))
      if (amount) await client.query('INSERT INTO reseller_payout_allocations(payout_id,earning_id,cents) VALUES($1,$2,$3)',[payout,e.id,amount])
      remaining-=amount
      if (!remaining) break
    }
    if (remaining) throw new Error('Unable to allocate this wire. Nothing recorded.')
    await audit(client,input.companyId,actor,'external_wire_recorded','Owner recorded an externally executed wire',null,
      { payoutId:payout,period:input.period,amountCents:input.amountCents,reference:input.reference.trim(),paymentDate:input.paymentDate })
    return payout
  })
  return { id:payoutId,emailSent:await retryPayoutEmail(payoutId) }
}
export async function retryPayoutEmail(payoutId: string) {
  const row=await transaction(async client=>{
    const p=(await client.query('SELECT *,payment_date::text AS paid_date FROM reseller_payouts WHERE id=$1 FOR UPDATE',[payoutId])).rows[0]
    if (!p) throw new Error('Payout not found.')
    if (p.notification_status==='sent' || (p.lease_until && +new Date(p.lease_until)>Date.now())) return null
    // Do not replay a provider-uncertain send after its idempotency window.
    if (['sending','uncertain'].includes(p.notification_status) && +new Date(p.created_at)<Date.now()-23*3600_000)
      throw new Error('Check email delivery before retrying this uncertain notification.')
    await client.query(`UPDATE reseller_payouts SET notification_status='sending',lease_until=now()+interval '5 minutes' WHERE id=$1`,[payoutId])
    return p
  })
  if (!row) return (await pool.query('SELECT notification_status FROM reseller_payouts WHERE id=$1',[payoutId])).rows[0]?.notification_status==='sent'
  const sent=await sendEmail('affiliate_payout',row.notification_recipient,{
    businessName:row.notification_business_name,period:row.period,amountCents:row.amount_cents,
    paymentDate:row.paid_date,portalUrl:'https://patientpipeline.app/admin-login',
  },{idempotencyKey:`reseller-payout/${row.id}`,metadata:{resellerCompanyId:row.company_id,resellerPayoutId:row.id}})
  await pool.query(`UPDATE reseller_payouts SET notification_status=$2,notification_error=$3,provider_id=$4,lease_until=NULL WHERE id=$1`,
    [payoutId,sent.ok?'sent':sent.uncertain?'uncertain':'failed',sent.ok?null:sent.error??'Email delivery failed',sent.ok?(sent as {providerId?: string}).providerId??null:null])
  return sent.ok
}
