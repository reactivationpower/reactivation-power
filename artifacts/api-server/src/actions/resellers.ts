import { z } from 'zod'
import { pool } from '@workspace/db'
import { requireAdmin } from '@/lib/auth/admin-session'
import { inviteAdminUser, emailInviteLink } from '@/lib/data/admin-users'
import { id, transaction, audit, reason, requireReseller, scopedProspect, assertSellerLink } from '@/lib/resellers/store'
import { createPaymentLink, retryCustomerEnrollment } from './payments'
import * as agreements from './agreements'
import { financialReport, recordWire, retryPayoutEmail, salesProgress } from '@/lib/resellers/finance'

const companyInput = z.object({ businessName: z.string().trim().min(1).max(150),
  email: z.string().trim().email().max(254), reason: z.string() }).strict()
export async function listCompanies() {
  await requireAdmin('super_admin')
  const companies = (await pool.query(`SELECT c.*,
    COALESCE((SELECT sum(cents) FROM reseller_ledger WHERE company_id=c.id),0)::bigint earned_cents,
    COALESCE((SELECT sum(amount_cents) FROM reseller_payouts WHERE company_id=c.id),0)::bigint paid_cents,
    (SELECT count(*)::int FROM reseller_prospects WHERE company_id=c.id) prospect_count,
    (SELECT count(*)::int FROM reseller_sales WHERE company_id=c.id) sale_count,
    CASE WHEN o.reviewed_at IS NOT NULL THEN 'reviewed' WHEN o.company_id IS NOT NULL THEN 'submitted' ELSE 'incomplete' END onboarding_status
    FROM reseller_companies c LEFT JOIN reseller_onboarding o ON o.company_id=c.id ORDER BY c.created_at DESC`)).rows
  return { companies, prices: (await pool.query('SELECT * FROM reseller_prices WHERE singleton=true')).rows[0] ?? null }
}
export async function createCompany(raw: unknown) {
  const actor = await requireAdmin('super_admin')
  const input = companyInput.parse(raw); const why = reason(input.reason)
  return transaction(async client => {
    const companyId = id()
    await client.query('INSERT INTO reseller_companies(id,business_name,email) VALUES($1,$2,$3)',
      [companyId, input.businessName, input.email.toLowerCase()])
    await audit(client, companyId, actor.userId, 'company_created', why)
    return { id: companyId }
  })
}
export async function savePrices(raw: unknown) {
  const actor = await requireAdmin('super_admin')
  const v = z.number().int().min(50).max(99999999)
  const input = z.object({ lifetimeCents: v, monthlyCents: v,
    setupCents: z.number().int().min(0).max(99999999).refine(n => n === 0 || n >= 50), reason: z.string() }).strict().parse(raw)
  return transaction(async client => {
    await client.query(`INSERT INTO reseller_prices(singleton,lifetime_cents,monthly_cents,setup_cents)
      VALUES(true,$1,$2,$3) ON CONFLICT(singleton) DO UPDATE SET lifetime_cents=$1,monthly_cents=$2,setup_cents=$3,
      version=reseller_prices.version+1,updated_at=now()`, [input.lifetimeCents,input.monthlyCents,input.setupCents])
    await audit(client, null, actor.userId, 'standard_prices_changed', reason(input.reason), null,
      { lifetimeCents: input.lifetimeCents, monthlyCents: input.monthlyCents, setupCents: input.setupCents })
    return { ok: true }
  })
}
export async function inviteMember(raw: unknown) {
  const actor = await requireAdmin('super_admin')
  const input = z.object({ companyId: z.string().min(1), email: z.string().trim().email().max(254),
    name: z.string().trim().min(1).max(120), role: z.enum(['reseller_manager','reseller_salesperson']),
    reason: z.string() }).strict().parse(raw)
  const why = reason(input.reason)
  const company = (await pool.query('SELECT * FROM reseller_companies WHERE id=$1', [input.companyId])).rows[0]
  if (!company || company.terminated_at) throw new Error('Active reseller company required.')
  // No invitation is delivered until company membership is committed.
  const result = await inviteAdminUser({ email: input.email, name: input.name, role: input.role,
    defaultCommissionRate: 0, invitedBy: actor.userId, deferDelivery: true, resellerCompanyId: input.companyId })
  await transaction(async client => {
    const current = (await client.query('SELECT * FROM reseller_companies WHERE id=$1 FOR UPDATE', [input.companyId])).rows[0]
    if (current.terminated_at) throw new Error('Reseller relationship ended during invitation. No access granted.')
    const previous=(await client.query('SELECT * FROM reseller_members WHERE user_id=$1 FOR UPDATE',[result.user.id])).rows[0]
    if (previous && (previous.company_id!==input.companyId || previous.role!==input.role || !previous.active))
      throw new Error('This account already has a membership. Use its member controls.')
    await client.query('INSERT INTO reseller_members(user_id,company_id,role,name,email) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id) DO NOTHING',
      [result.user.id,input.companyId,input.role,input.name,input.email.toLowerCase()])
    await audit(client,input.companyId,actor.userId,'member_invited',why,null,{ userId: result.user.id, role: input.role })
  })
  return emailInviteLink(result.user.id, actor.name ?? actor.email)
}
export async function resendMemberInvite(userId: string) {
  const actor = await requireAdmin('super_admin')
  const member = (await pool.query(`SELECT m.* FROM reseller_members m JOIN reseller_companies c ON c.id=m.company_id
    WHERE m.user_id=$1 AND m.active AND c.terminated_at IS NULL`, [userId])).rows[0]
  if (!member) throw new Error('Active reseller member required.')
  return emailInviteLink(userId, actor.name ?? actor.email)
}
export async function setMemberActive(raw: unknown) {
  const actor = await requireAdmin('super_admin')
  const input = z.object({ userId: z.string(), active: z.boolean(), reason: z.string() }).strict().parse(raw)
  return transaction(async client => {
    const member = (await client.query('SELECT * FROM reseller_members WHERE user_id=$1 FOR UPDATE', [input.userId])).rows[0]
    if (!member) throw new Error('Member not found.')
    await client.query('UPDATE reseller_members SET active=$2 WHERE user_id=$1',[input.userId,input.active])
    await audit(client,member.company_id,actor.userId,input.active ? 'member_reactivated' : 'member_deactivated',reason(input.reason),null,{userId: input.userId})
    return { ok: true }
  })
}
export async function terminateCompany(companyId: string, why: string) {
  const actor = await requireAdmin('super_admin')
  return transaction(async client => {
    const c = (await client.query('SELECT * FROM reseller_companies WHERE id=$1 FOR UPDATE',[companyId])).rows[0]
    if (!c) throw new Error('Company not found.')
    if (!c.terminated_at) {
      await client.query('UPDATE reseller_companies SET terminated_at=clock_timestamp() WHERE id=$1',[companyId])
      await audit(client,companyId,actor.userId,'relationship_terminated',reason(why),null,
        { futureEarningsStopped: true, unpaidEarningsPreserved: true, clawbacksContinue: true })
    }
    return { ok: true }
  })
}
export async function getCompany(companyId: string) {
  await requireAdmin('super_admin')
  const company = (await pool.query('SELECT * FROM reseller_companies WHERE id=$1',[companyId])).rows[0]
  if (!company) throw new Error('Company not found.')
  return { company, members: (await pool.query('SELECT * FROM reseller_members WHERE company_id=$1 ORDER BY created_at',[companyId])).rows,
    report: await financialReport(companyId),
    activity: (await pool.query('SELECT * FROM reseller_activity WHERE company_id=$1 ORDER BY occurred_at DESC LIMIT 200',[companyId])).rows,
    prospects: (await pool.query('SELECT * FROM reseller_prospects WHERE company_id=$1 ORDER BY updated_at DESC LIMIT 500',[companyId])).rows }
}
export async function getWorkspace(query = '', rawPage = 1) {
  const actor = await requireReseller()
  if (!actor.companyId) throw new Error('Use the owner Resellers section.')
  const page = Math.max(1, Math.min(10000, Number(rawPage) || 1))
  const params = [actor.companyId, actor.role === 'reseller_manager' ? null : actor.userId, `%${query.trim().slice(0,100).replace(/[%_\\]/g,'\\$&')}%`]
  const where = `company_id=$1 AND ($2::text IS NULL OR salesperson_id=$2) AND concat_ws(' ',full_name,business_name,email,phone) ILIKE $3`
  return { actor: { userId: actor.userId, name: actor.name, role: actor.role, companyId: actor.companyId },
    company: (await pool.query('SELECT * FROM reseller_companies WHERE id=$1',[actor.companyId])).rows[0],
    prospects: (await pool.query(`SELECT * FROM reseller_prospects WHERE ${where} ORDER BY updated_at DESC,id LIMIT 50 OFFSET $4`,[...params,(page-1)*50])).rows,
    total: (await pool.query(`SELECT count(*)::int total FROM reseller_prospects WHERE ${where}`,params)).rows[0].total, page,
    members: actor.role === 'reseller_manager' ? (await pool.query('SELECT user_id,name,role,active FROM reseller_members WHERE company_id=$1',[actor.companyId])).rows : [],
    prices: (await pool.query('SELECT * FROM reseller_prices WHERE singleton=true')).rows[0] ?? null,
    sales: await salesProgress(actor.companyId,actor.role === 'reseller_manager' ? null : actor.userId),
    report: actor.role === 'reseller_manager' ? await financialReport(actor.companyId) : null }
}
export async function getSale(linkId: string) {
  const actor=await requireReseller()
  await assertSellerLink(actor,linkId)
  const sale=(await pool.query(`SELECT s.*,c.full_name,c.business_name,c.business_address,c.email,c.phone,
    t.type,t.monthly_cents,t.setup_fee_cents,t.completed_at,t.subscription_status,t.next_payment_at,t.agreement_start,
    t.agreement_end,l.amount_cents,l.status,a.id agreement_id,a.status agreement_status,i.status invitation_status
    FROM reseller_sales s JOIN customers c ON c.id=s.customer_id JOIN payment_link_terms t ON t.link_id=s.link_id
    JOIN payment_links l ON l.id::text=s.link_id LEFT JOIN agreements a ON a.link_id=s.link_id
    LEFT JOIN enrollment_invitations i ON i.link_id=s.link_id WHERE s.link_id=$1`,[linkId])).rows[0]
  if (!sale) throw new Error('Sale not found.')
  return {sale}
}
const prospectInput = z.object({
  fullName: z.string().trim().min(1).max(150), businessName: z.string().trim().min(1).max(150),
  email: z.string().trim().email().max(254), phone: z.string().trim().min(1).max(50),
  businessAddress: z.string().trim().max(500).default(''), consentEvidence: z.string().trim().max(1500).default(''),
}).strict()
export async function createProspect(raw: unknown) {
  const actor = await requireReseller()
  if (!actor.companyId) throw new Error('A company login is required.')
  const input = prospectInput.parse(raw)
  return transaction(async client => {
    const company = (await client.query('SELECT * FROM reseller_companies WHERE id=$1 FOR SHARE',[actor.companyId])).rows[0]
    const member = (await client.query('SELECT active FROM reseller_members WHERE user_id=$1 FOR SHARE',[actor.userId])).rows[0]
    if (company.terminated_at || !member.active) throw new Error('Selling access ended.')
    const prospectId = id()
    await client.query(`INSERT INTO reseller_prospects(id,company_id,salesperson_id,full_name,business_name,email,phone,business_address,consent_evidence)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [prospectId,actor.companyId,actor.userId,input.fullName,input.businessName,input.email.toLowerCase(),input.phone,input.businessAddress,input.consentEvidence])
    await audit(client,actor.companyId!,actor.userId,'prospect_created','Manual external follow-up only',prospectId)
    return { id: prospectId }
  })
}
export async function getProspect(prospectId: string) {
  const actor = await requireReseller()
  const prospect = await scopedProspect(actor,prospectId)
  const offers = (await pool.query(`SELECT s.*,l.status,l.amount_cents,t.type,t.monthly_cents,t.setup_fee_cents,t.completed_at,
    a.id agreement_id,a.status agreement_status,a.token agreement_token,i.status invitation_status
    FROM reseller_sales s JOIN payment_links l ON l.id::text=s.link_id JOIN payment_link_terms t ON t.link_id=s.link_id
    LEFT JOIN agreements a ON a.link_id=s.link_id LEFT JOIN enrollment_invitations i ON i.link_id=s.link_id
    WHERE s.prospect_id=$1 AND ($2::text IS NULL OR s.salesperson_id=$2) ORDER BY s.created_at DESC`,
  [prospectId,actor.role === 'reseller_salesperson' ? actor.userId : null])).rows
  return { prospect, offers, activity: (await pool.query('SELECT * FROM reseller_activity WHERE prospect_id=$1 ORDER BY occurred_at DESC LIMIT 200',[prospectId])).rows,
    actor: { userId: actor.userId, role: actor.role }, prices: (await pool.query('SELECT * FROM reseller_prices WHERE singleton=true')).rows[0] ?? null,
    members: actor.role === 'reseller_manager' || actor.role === 'super_admin'
      ? (await pool.query('SELECT user_id,name,active FROM reseller_members WHERE company_id=$1',[prospect.company_id])).rows : [] }
}
export async function updateProspect(prospectId: string, raw: unknown) {
  const actor = await requireReseller()
  const input = prospectInput.partial().extend({
    revision: z.number().int().positive(), stage: z.enum(['New','Contacted','Demo','Offer','Customer','Do Not Contact','Lost']).optional(),
    salespersonId: z.string().optional(), nextFollowupAt: z.string().datetime({offset:true}).nullable().optional(),
    doNotContact: z.boolean().optional(), reason: z.string(),
  }).strict().parse(raw)
  return transaction(async client => {
    const p = await scopedProspect(actor,prospectId,client,true)
    if (p.revision !== input.revision) throw new Error('This record changed. Reload before saving.')
    if (input.salespersonId && input.salespersonId !== p.salesperson_id) {
      if (actor.role !== 'reseller_manager' && actor.role !== 'super_admin') throw new Error('Manager permission required.')
      const m = (await client.query('SELECT * FROM reseller_members WHERE user_id=$1 AND company_id=$2 AND active',[input.salespersonId,p.company_id])).rows[0]
      if (!m) throw new Error('Choose an active member of this company.')
    }
    if (input.email && input.email.toLowerCase() !== p.email && p.customer_id) throw new Error('Enrolled identity must be changed by the owner.')
    const dnd = input.stage === 'Do Not Contact' || (input.doNotContact ?? p.do_not_contact)
    if (p.do_not_contact && input.doNotContact === false && !input.consentEvidence) throw new Error('Fresh consent evidence is required to clear do-not-contact.')
    await client.query(`UPDATE reseller_prospects SET full_name=$2,business_name=$3,email=$4,phone=$5,business_address=$6,
      consent_evidence=$7,stage=$8,salesperson_id=$9,next_followup_at=$10,do_not_contact=$11,revision=revision+1,updated_at=now() WHERE id=$1`,
    [prospectId,input.fullName ?? p.full_name,input.businessName ?? p.business_name,(input.email ?? p.email).toLowerCase(),input.phone ?? p.phone,
      input.businessAddress ?? p.business_address,input.consentEvidence ?? p.consent_evidence,
      dnd ? 'Do Not Contact' : input.stage ?? p.stage,input.salespersonId ?? p.salesperson_id,
      dnd ? null : input.nextFollowupAt === undefined ? p.next_followup_at : input.nextFollowupAt,dnd])
    await audit(client,p.company_id,actor.userId,'prospect_updated',reason(input.reason),prospectId,
      { previousSalespersonId: p.salesperson_id, salespersonId: input.salespersonId ?? p.salesperson_id })
    return { ok: true }
  })
}
export async function logFollowup(prospectId: string, raw: unknown) {
  const actor = await requireReseller()
  const input = z.object({ kind: z.enum(['note','call']), notes: z.string().trim().min(1).max(3000),
    disposition: z.enum(['Connected','No Answer','Voicemail','Demo Scheduled','Wrong Number','Do Not Contact']).optional(),
    nextFollowupAt: z.string().datetime({offset:true}).optional() }).strict().parse(raw)
  if (input.kind === 'call' && !input.disposition) throw new Error('Choose a call outcome.')
  if (input.kind === 'call' && !['Wrong Number','Do Not Contact'].includes(input.disposition!) && !input.nextFollowupAt)
    throw new Error('Set the next follow-up date.')
  return transaction(async client => {
    const p = await scopedProspect(actor,prospectId,client,true)
    const dnd = p.do_not_contact || input.disposition === 'Do Not Contact'
    await audit(client,p.company_id,actor.userId,input.kind,input.notes,prospectId,
      { disposition: input.disposition, nextFollowupAt: input.nextFollowupAt, externalCommunication: true })
    await client.query(`UPDATE reseller_prospects SET do_not_contact=$2,next_followup_at=$3,
      stage=CASE WHEN $2 THEN 'Do Not Contact' ELSE stage END,revision=revision+1,updated_at=now() WHERE id=$1`,
    [prospectId,dnd,dnd ? null : input.nextFollowupAt ?? p.next_followup_at])
    return { ok: true }
  })
}
export async function resolveCustomerConflict(input: { prospectId: string; customerId: string; reason: string }) {
  const actor = await requireAdmin('super_admin')
  const why = reason(input.reason)
  return transaction(async client => {
    const p = await scopedProspect(actor,input.prospectId,client,true)
    const customer = (await client.query('SELECT * FROM customers WHERE id=$1 FOR UPDATE',[input.customerId])).rows[0]
    if (!customer || customer.email.trim().toLowerCase() !== p.email) throw new Error('Customer email must match the reviewed prospect.')
    const other = (await client.query('SELECT 1 FROM reseller_sales WHERE customer_id=$1 AND company_id<>$2 LIMIT 1',[customer.id,p.company_id])).rows[0]
    if (other) throw new Error('Customer is sold by another company. No automatic reassignment is allowed.')
    await client.query('UPDATE reseller_prospects SET customer_id=$2,revision=revision+1 WHERE id=$1',[p.id,customer.id])
    await audit(client,p.company_id,actor.userId,'customer_identity_resolved',why,p.id,
      { customerId: customer.id, historicalEarningsUnchanged: true, futureOffersOnly: true })
    return { ok: true }
  })
}
export async function adjustLedger(input: { companyId: string; cents: number; reason: string; key: string }) {
  const actor = await requireAdmin('super_admin'); const why = reason(input.reason)
  if (!Number.isSafeInteger(input.cents) || !input.cents || Math.abs(input.cents)>99999999 || !/^[\w-]{16,100}$/.test(input.key))
    throw new Error('Enter a valid correction and request key.')
  return transaction(async client => {
    await client.query('SELECT id FROM reseller_companies WHERE id=$1 FOR UPDATE',[input.companyId])
    const source = `correction:${input.key}`
    const old = (await client.query('SELECT * FROM reseller_ledger WHERE source_key=$1',[source])).rows[0]
    if (old && (old.company_id !== input.companyId || old.cents !== input.cents || old.reason !== why)) throw new Error('Request key already used.')
    if (!old) {
      await client.query(`INSERT INTO reseller_ledger(id,company_id,source_key,kind,cents,reason,occurred_at,period)
        VALUES($1,$2,$3,'correction',$4,$5,now(),to_char(now() AT TIME ZONE 'UTC','YYYY-MM'))`,[id(),input.companyId,source,input.cents,why])
      await audit(client,input.companyId,actor.userId,'ledger_correction',why,null,{ cents: input.cents, key: input.key })
    }
    return { ok: true }
  })
}
export const createOffer = (input: Parameters<typeof createPaymentLink>[0]) => createPaymentLink(input)
export const retryEnrollment = (linkId: string) => retryCustomerEnrollment(linkId)
export const getAgreementForm = (linkId: string) => agreements.getAgreementSendForm(linkId)
export const previewAgreement = (linkId: string, form: agreements.AgreementTermsForm) => agreements.previewAgreement(linkId,form)
export const previewEnrollmentEmail = (linkId: string, form: agreements.AgreementTermsForm) => agreements.previewEnrollmentEmail(linkId,form)
export const sendAgreement = (linkId: string, form: agreements.AgreementTermsForm, delivery?: {signerEmail?: string; copyEmails?: string[]}) => agreements.sendAgreement(linkId,form,delivery)
export const updateAgreement = (agreementId: string, form: agreements.AgreementTermsForm) => agreements.updateAgreement(agreementId,form)
export const resendAgreement = (agreementId: string) => agreements.resendAgreement(agreementId)
export async function recordPayout(input: Parameters<typeof recordWire>[0]) {
  const actor = await requireAdmin('super_admin')
  return recordWire(input,actor.userId)
}
export async function retryPayoutNotification(payoutId: string) {
  await requireAdmin('super_admin')
  return { emailSent: await retryPayoutEmail(payoutId) }
}
