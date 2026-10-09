import { randomBytes } from 'node:crypto'
import { pool } from '@workspace/db'
import { requireAdmin } from '@/lib/auth/admin-session'
import { getRequestContext } from '@/lib/request-context'
import { authDigest } from '@/lib/auth/portal-password'
import { AFFILIATE_COOKIE, accessId, accessLimit, assertSameOrigin, requireAffiliate, revokeAccess, sendAccess, telemetry, verifyAccess } from '@/lib/affiliates/access'
import { captureReferral } from '@/lib/affiliates/attribution'
import { attributionCandidates } from '@/lib/affiliates/candidates'
import { affiliateReport } from '@/lib/affiliates/reports'
import { monthlyPayoutWorklist } from '@/lib/affiliates/worklist'
import { calculateHistory } from '@/lib/affiliates/ledger'
import { deliverPayout, recordWire, type WireInput } from '@/lib/affiliates/payouts'
import { periodAt, validateRules, ZERO_RULES, type Rules } from '@/lib/affiliates/rules'
import { audit, id, partner, requireReason, transaction } from '@/lib/affiliates/store'

const cleanEmail = (email: string) => {
  if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new Error('Enter a valid email address')
  return email.trim().toLowerCase()
}
const cleanName = (name: string) => {
  if (typeof name !== 'string' || !name.trim() || name.length > 150) throw new Error('Enter a business name (up to 150 characters)')
  return name.trim()
}
export async function applyAffiliate(input: { businessName: string; email: string }) {
  assertSameOrigin()
  const email = cleanEmail(input.email), name = cleanName(input.businessName)
  if (!await accessLimit('application', email, 3)) return { ok: true }
  await transaction(async client => {
    const affiliateId = id()
    const created = await client.query(`INSERT INTO affiliates(id,business_name,email,referral_code)
      VALUES($1,$2,$3,$4) ON CONFLICT(email) DO NOTHING RETURNING id`, [affiliateId, name, email, randomBytes(24).toString('base64url')])
    if (!created.rowCount) return
    await client.query(`INSERT INTO affiliate_rules(id,affiliate_id,rules,status,actor,reason)
      VALUES($1,$2,$3,'pending','application','Public application awaiting approval')`, [id(), affiliateId, ZERO_RULES])
    await audit(client, affiliateId, 'application_submitted', 'application')
  })
  return { ok: true }
}
export async function requestAffiliateAccess(input: { email: string; accessId?: string }) {
  assertSameOrigin()
  // Same response for unregistered, pending, inactive, bad entry link, and rate limited.
  let email: string
  try { email = cleanEmail(input.email) } catch { return { ok: true } }
  if (!await accessLimit('request', email, 5)) return { ok: true }
  const p = (await pool.query("SELECT * FROM affiliates WHERE email=$1 AND status='approved'", [email])).rows[0]
  if (p && (!input.accessId || input.accessId === accessId(p))) await sendAccess(p)
  return { ok: true }
}
export async function verifyAffiliateAccess(input: { email: string; token: string }) {
  assertSameOrigin()
  let ok = false
  try { ok = await verifyAccess(cleanEmail(input.email), input.token) } catch { ok = false }
  return ok ? { ok: true } : { ok: false, error: 'This link is invalid, expired, already used, or does not match the registered inbox. Request a new link.' }
}
export async function affiliateLogout() {
  assertSameOrigin()
  const session = await requireAffiliate()
  await transaction(async client => {
    await client.query('UPDATE affiliate_sessions SET revoked_at=now() WHERE id=$1', [session.sessionId])
    await audit(client, session.partner.id, 'logout', 'affiliate')
  })
  const { req, res } = getRequestContext()
  const secure = req.secure || process.env.NODE_ENV === 'production'
  res.clearCookie(AFFILIATE_COOKIE, { path: '/', httpOnly: true, secure, sameSite: secure ? 'none' : 'lax', partitioned: secure })
  return { ok: true }
}
export async function getAffiliateDashboard() {
  const { partner: p } = await requireAffiliate()
  return affiliateReport(p.id, p)
}
export async function logAffiliateNavigation(input: { view: string; customerId?: string }) {
  const { partner: p, sessionId } = await requireAffiliate()
  if (!['dashboard', 'payments', 'payouts', 'practices'].includes(input.view)) throw new Error('Invalid navigation')
  if (!await accessLimit('telemetry', p.id, 300)) return { ok: true }
  if (input.customerId) {
    const scoped = (await affiliateReport(p.id)).practices.some(r => r.id === input.customerId)
    if (!scoped) throw new Error('Practice not found')
  }
  await telemetry(p.id, sessionId, input.customerId ? 'practice_view' : `navigation_${input.view}`, input.customerId)
  return { ok: true }
}
export async function captureAffiliateReferral(code: string) {
  assertSameOrigin()
  if (!await accessLimit('referral', code, 100)) return { ok: false }
  return { ok: await captureReferral(code) }
}
export async function listAffiliates() {
  await requireAdmin('super_admin')
  return (await pool.query('SELECT * FROM affiliates ORDER BY created_at DESC')).rows
}
export async function getAffiliatePayoutWorklist(period: string) {
  await requireAdmin('super_admin')
  return monthlyPayoutWorklist(period)
}
export async function getAffiliateAttributionCandidates(search = '', kind?: 'lead' | 'customer') {
  await requireAdmin('super_admin')
  return attributionCandidates(search, kind)
}
export async function getAffiliateProfile(affiliateId: string, search = '') {
  await requireAdmin('super_admin')
  const p = await partner(affiliateId)
  if (!p) throw new Error('Affiliate not found')
  const report = await affiliateReport(affiliateId, p)
  const activity = await pool.query(`SELECT id,action,actor,customer_id,reason,occurred_at,ip::text,country,region,details
      FROM affiliate_activity WHERE affiliate_id=$1 AND
      concat_ws(' ',action,actor,reason,customer_id,details::text,ip::text,country,region) ILIKE $2
       ORDER BY occurred_at DESC LIMIT 500`, [affiliateId, `%${String(search).slice(0, 100)}%`])
  const summary = await pool.query(`SELECT count(*) FILTER(WHERE action='session_visit')::int visits,
      count(*) FILTER(WHERE action='practice_view')::int practice_views FROM affiliate_activity WHERE affiliate_id=$1`, [affiliateId])
  return { ...report, partner: p, activity: activity.rows, summary: summary.rows[0] }
}
export async function saveAffiliate(input: { id?: string; businessName: string; email: string; status: string; rules: Rules; reason: string }) {
  const admin = await requireAdmin('super_admin')
  const reason = requireReason(input.reason), email = cleanEmail(input.email), name = cleanName(input.businessName), rules = validateRules(input.rules)
  if (!['pending', 'approved', 'inactive', 'rejected'].includes(input.status)) throw new Error('Invalid affiliate status')
  const affiliateId = await transaction(async client => {
    const affiliateId = input.id ?? id()
    let previous = null
    if (input.id) {
      previous = (await client.query('SELECT * FROM affiliates WHERE id=$1 FOR UPDATE', [affiliateId])).rows[0]
      if (!previous) throw new Error('Affiliate not found')
      await client.query(`UPDATE affiliates SET business_name=$2,email=$3,status=$4,updated_at=now(),
        access_version=access_version+CASE WHEN email<>$3 OR status<>$4 THEN 1 ELSE 0 END WHERE id=$1`,
      [affiliateId, name, email, input.status])
    } else {
      await client.query(`INSERT INTO affiliates(id,business_name,email,status,referral_code) VALUES($1,$2,$3,$4,$5)`,
        [affiliateId, name, email, input.status, randomBytes(24).toString('base64url')])
    }
    await client.query(`INSERT INTO affiliate_rules(id,affiliate_id,rules,status,actor,reason) VALUES($1,$2,$3,$4,$5,$6)`,
      [id(), affiliateId, rules, input.status, admin.userId, reason])
    await audit(client, affiliateId, previous ? 'partner_updated' : 'partner_invited', admin.userId, reason,
      null, { previousStatus: previous?.status ?? null, status: input.status, rules,
        previousBusinessName: previous?.business_name ?? null, businessName: name, emailChanged: Boolean(previous && previous.email !== email) })
    return affiliateId
  })
  return { ok: true, id: affiliateId }
}
export async function getAffiliateAccessLink(affiliateId: string) {
  const admin = await requireAdmin('super_admin')
  const p = await partner(affiliateId)
  if (!p || p.status !== 'approved') throw new Error('Only approved affiliates have access links')
  await transaction(client => audit(client, p.id, 'access_link_copied', admin.userId))
  return { url: `https://patientpipeline.app/affiliates/access?accessId=${encodeURIComponent(accessId(p))}` }
}
export async function resendAffiliateAccess(affiliateId: string) {
  const admin = await requireAdmin('super_admin')
  const p = await partner(affiliateId)
  if (!p) throw new Error('Affiliate not found')
  if (!await accessLimit('admin-resend', p.id, 5)) throw new Error('Too many access emails; try again later')
  await transaction(client => audit(client, p.id, 'access_email_requested', admin.userId))
  return sendAccess(p)
}
export async function revokeAffiliateAccess(affiliateId: string, reason: string) {
  const admin = await requireAdmin('super_admin')
  await revokeAccess(affiliateId, admin.userId, requireReason(reason))
  return { ok: true }
}
export async function assignAffiliate(input: { affiliateId: string | null; customerId?: string; leadId?: string; reason: string }) {
  const admin = await requireAdmin('super_admin')
  const reason = requireReason(input.reason)
  if (Boolean(input.customerId) === Boolean(input.leadId)) throw new Error('Choose exactly one customer or lead')
  await transaction(async client => {
    const p = input.affiliateId ? (await client.query("SELECT * FROM affiliates WHERE id=$1 AND status='approved' FOR UPDATE", [input.affiliateId])).rows[0] : null
    if (input.affiliateId && !p) throw new Error('Choose an approved affiliate')
    if (input.customerId) {
      const c = (await client.query('SELECT email FROM customers WHERE id=$1 FOR UPDATE', [input.customerId])).rows[0]
      if (!c) throw new Error('Customer not found')
      if (p && c.email.toLowerCase() === p.email.toLowerCase()) throw new Error('Self-referrals are not eligible')
      const previous = (await client.query('SELECT * FROM affiliate_attributions WHERE customer_id=$1 ORDER BY effective_at DESC,id DESC LIMIT 1', [input.customerId])).rows[0]
      await client.query(`INSERT INTO affiliate_attributions(id,customer_id,affiliate_id,lead_id,actor,reason,converted_at)
        VALUES($1,$2,$3,$4,$5,$6,$7)`, [id(), input.customerId, input.affiliateId, previous?.lead_id ?? null, admin.userId, reason, previous?.converted_at ?? null])
      if (previous?.lead_id) await client.query('UPDATE affiliate_leads SET affiliate_id=$2 WHERE id=$1', [previous.lead_id, input.affiliateId])
      await audit(client, input.affiliateId, 'customer_attribution_corrected', admin.userId, reason, input.customerId, { previousAffiliateId: previous?.affiliate_id ?? null })
      if (previous?.affiliate_id && previous.affiliate_id !== input.affiliateId) await audit(client, previous.affiliate_id, 'customer_attribution_removed', admin.userId, reason, input.customerId)
    } else {
      const l = (await client.query('SELECT * FROM affiliate_leads WHERE id=$1 FOR UPDATE', [input.leadId])).rows[0]
      if (!l) throw new Error('Lead not found')
      if (l.converted_at) throw new Error('Correct attribution on the converted customer, not the locked lead')
      if (p && authDigest(`affiliate-lead-email:${p.email}`) === l.email_digest) throw new Error('Self-referrals are not eligible')
      await client.query(`UPDATE affiliate_leads SET affiliate_id=$2,protected_until=now()+interval '120 hours' WHERE id=$1`, [l.id, input.affiliateId])
      await audit(client, input.affiliateId, 'lead_attribution_corrected', admin.userId, reason, null, { leadId: l.id, previousAffiliateId: l.affiliate_id })
    }
  })
  return { ok: true }
}
export async function setAffiliateCustomerRules(input: { affiliateId: string; customerId: string; rules: Rules; reason: string }) {
  const admin = await requireAdmin('super_admin'), reason = requireReason(input.reason), rules = validateRules(input.rules)
  await transaction(async client => {
    await client.query('SELECT id FROM customers WHERE id=$1 FOR UPDATE', [input.customerId])
    const latest = (await client.query('SELECT affiliate_id FROM affiliate_attributions WHERE customer_id=$1 ORDER BY effective_at DESC,id DESC LIMIT 1', [input.customerId])).rows[0]
    if (latest?.affiliate_id !== input.affiliateId) throw new Error('Customer is not attributed to this affiliate')
    await client.query(`INSERT INTO affiliate_rules(id,affiliate_id,customer_id,rules,status,actor,reason)
      VALUES($1,$2,$3,$4,'approved',$5,$6)`, [id(), input.affiliateId, input.customerId, rules, admin.userId, reason])
    await audit(client, input.affiliateId, 'customer_rules_changed', admin.userId, reason, input.customerId, { rules })
  })
  return { ok: true }
}
export async function adjustAffiliateLedger(input: { affiliateId: string; cents: number; reason: string; key: string }) {
  const admin = await requireAdmin('super_admin'), reason = requireReason(input.reason)
  if (!Number.isSafeInteger(input.cents) || input.cents === 0 || Math.abs(input.cents) > 99999999 || !/^[\w-]{16,100}$/.test(input.key)) throw new Error('Enter signed integer cents and a unique request key')
  await transaction(async client => {
    await client.query('SELECT id FROM affiliates WHERE id=$1 FOR UPDATE', [input.affiliateId])
    const existing = (await client.query('SELECT * FROM affiliate_ledger WHERE source_key=$1', [`adjustment:${input.key}`])).rows[0]
    if (existing) {
      if (existing.affiliate_id !== input.affiliateId || existing.cents !== input.cents || existing.reason !== reason) throw new Error('Request key already used for a different adjustment')
      return
    }
    const now = new Date()
    await client.query(`INSERT INTO affiliate_ledger(id,affiliate_id,source_key,kind,cents,reason,occurred_at,period)
      VALUES($1,$2,$3,'adjustment',$4,$5,$6,$7)`, [id(), input.affiliateId, `adjustment:${input.key}`, input.cents, reason, now, periodAt(now)])
    await audit(client, input.affiliateId, 'ledger_adjustment', admin.userId, reason, null, { cents: input.cents })
  })
  return { ok: true }
}
export async function calculateAffiliateHistory(input: { affiliateId: string; customerId: string; from: string; reason: string }) {
  const admin = await requireAdmin('super_admin'), reason = requireReason(input.reason), from = new Date(input.from)
  if (Number.isNaN(from.getTime()) || from > new Date()) throw new Error('Enter a valid historical start date')
  await transaction(async client => {
    const customer = (await client.query('SELECT email FROM customers WHERE id=$1 FOR UPDATE', [input.customerId])).rows[0]
    const p = (await client.query("SELECT * FROM affiliates WHERE id=$1 AND status='approved' FOR UPDATE", [input.affiliateId])).rows[0]
    const current = (await client.query('SELECT affiliate_id FROM affiliate_attributions WHERE customer_id=$1 ORDER BY effective_at DESC,id DESC LIMIT 1', [input.customerId])).rows[0]
    if (!customer || !p || current?.affiliate_id !== p.id || customer.email.toLowerCase() === p.email.toLowerCase()) throw new Error('Explicit current attribution to this eligible affiliate is required first')
    const rules = (await client.query(`SELECT rules FROM affiliate_rules WHERE affiliate_id=$1
      AND (customer_id IS NULL OR customer_id=$2) ORDER BY (customer_id IS NOT NULL) DESC,effective_at DESC,id DESC LIMIT 1`, [p.id, input.customerId])).rows[0].rules
    await client.query(`INSERT INTO affiliate_attributions(id,customer_id,affiliate_id,effective_at,actor,reason)
      VALUES($1,$2,$3,$4,$5,$6)`, [id(), input.customerId, p.id, from, admin.userId, reason])
    // This is an explicit audited historical calculation, never an automatic backfill of unassigned customers.
    await client.query(`INSERT INTO affiliate_rules(id,affiliate_id,customer_id,rules,status,effective_at,actor,reason)
      VALUES($1,$2,$3,$4,'approved',$5,$6,$7)`, [id(), p.id, input.customerId, rules, from, admin.userId, reason])
    await audit(client, p.id, 'historical_calculation_authorized', admin.userId, reason, input.customerId, { from: from.toISOString(), rules })
  })
  return { ok: true, processed: await calculateHistory(input.customerId, from) }
}
export async function recordAffiliateWire(input: WireInput) {
  const admin = await requireAdmin('super_admin')
  return recordWire(input, admin.userId)
}
export async function retryAffiliatePayoutEmail(payoutId: string) {
  const admin = await requireAdmin('super_admin')
  const row = (await pool.query('SELECT affiliate_id FROM affiliate_payouts WHERE id=$1', [payoutId])).rows[0]
  if (!row) throw new Error('Payout not found')
  await transaction(client => audit(client, row.affiliate_id, 'payout_email_retry', admin.userId, null, null, { payoutId }))
  return { ok: await deliverPayout(payoutId) }
}
