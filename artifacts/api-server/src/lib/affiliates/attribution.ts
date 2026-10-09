import type { PoolClient } from '@workspace/db'
import { pool } from '@workspace/db'
import { authDigest } from '@/lib/auth/portal-password'
import { getRequestContext } from '@/lib/request-context'
import { audit, id, transaction } from './store'
import { canReattribute } from './rules'

const COOKIE = 'pp_referral'
const emailKey = (email: string) => authDigest(`affiliate-lead-email:${email.trim().toLowerCase()}`)
const phoneKey = (phone: string) => authDigest(`affiliate-lead-phone:${phone.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')}`)
export async function captureReferral(code: string): Promise<boolean> {
  if (typeof code !== 'string' || !/^[\w-]{32}$/.test(code)) return false
  const p = (await pool.query("SELECT id FROM affiliates WHERE referral_code=$1 AND status='approved'", [code])).rows[0]
  if (!p) return false
  const data = Buffer.from(JSON.stringify({ code, expires: Date.now() + 90 * 86400_000 })).toString('base64url')
  const value = `${data}.${authDigest(`affiliate-referral:${data}`)}`
  const { req, res } = getRequestContext()
  const secure = req.secure || process.env.NODE_ENV === 'production'
  res.cookie(COOKIE, value, { httpOnly: true, sameSite: secure ? 'none' : 'lax', partitioned: secure, secure, path: '/', maxAge: 90 * 86400_000 })
  return true
}
export async function referralFromRequest(email: string): Promise<string | null> {
  const value = getRequestContext().req.cookies?.[COOKIE]
  if (typeof value !== 'string' || value.length > 600) return null
  const [data, sig] = value.split('.')
  if (!data || sig !== authDigest(`affiliate-referral:${data}`)) return null
  try {
    const decoded = JSON.parse(Buffer.from(data, 'base64url').toString())
    if (!Number.isSafeInteger(decoded.expires) || decoded.expires <= Date.now()) return null
    const p = (await pool.query("SELECT id FROM affiliates WHERE referral_code=$1 AND status='approved' AND email<>$2", [decoded.code, email.trim().toLowerCase()])).rows[0]
    return p?.id ?? null
  } catch { return null }
}
/** Handoff contract for validated, consented provider intake only. Never call on a click or patient inquiry. */
export async function resolveQualifiedReferral(input: {
  email: string; phone: string; practiceName: string; affiliateId: string | null; sourceLeadId?: string
}, now = new Date()): Promise<{ leadId: string; affiliateId: string | null }> {
  return transaction(async client => {
    const emailDigest = emailKey(input.email), phoneDigest = phoneKey(input.phone)
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [emailDigest])
    // Phones can belong to shared offices/booking centres. Only an exact normalized email
    // establishes automatic identity; a different email creates a separate qualified lead.
    const existing = (await client.query('SELECT * FROM affiliate_leads WHERE email_digest=$1 FOR UPDATE', [emailDigest])).rows[0]
    let affiliateId = input.affiliateId
    if (affiliateId) {
      const approved = (await client.query("SELECT id FROM affiliates WHERE id=$1 AND status='approved' AND email<>$2", [affiliateId, input.email.trim().toLowerCase()])).rows[0]
      if (!approved) affiliateId = null
    }
    if (existing) {
      if (affiliateId && affiliateId !== existing.affiliate_id && canReattribute(existing.protected_until, Boolean(existing.converted_at), now)) {
        await client.query(`UPDATE affiliate_leads SET affiliate_id=$2,protected_until=$3,submitted_at=$4,practice_name=$5 WHERE id=$1`,
          [existing.id, affiliateId, new Date(now.getTime() + 5 * 86400_000), now, input.practiceName])
        await audit(client, affiliateId, 'qualified_lead_reattributed', 'intake', null, null, { leadId: existing.id, previousAffiliateId: existing.affiliate_id, sourceLeadId: input.sourceLeadId ?? null })
        return { leadId: existing.id, affiliateId }
      }
      return { leadId: existing.id, affiliateId: existing.affiliate_id }
    }
    const leadId = id()
    await client.query(`INSERT INTO affiliate_leads(id,email_digest,phone_digest,practice_name,affiliate_id,protected_until,submitted_at)
      VALUES($1,$2,$3,$4,$5,$6,$7)`, [leadId, emailDigest, phoneDigest, input.practiceName, affiliateId, affiliateId ? new Date(now.getTime() + 5 * 86400_000) : null, now])
    await audit(client, affiliateId, 'qualified_lead_submitted', 'intake', null, null, { leadId, sourceLeadId: input.sourceLeadId ?? null })
    return { leadId, affiliateId }
  })
}
export async function attachCustomerReferral(customerId: string, email: string, _phone: string) {
  await transaction(async client => {
    await client.query('SELECT id FROM customers WHERE id=$1 FOR UPDATE', [customerId])
    if ((await client.query('SELECT id FROM affiliate_attributions WHERE customer_id=$1 LIMIT 1', [customerId])).rows.length) return
    const lead = (await client.query('SELECT * FROM affiliate_leads WHERE email_digest=$1 FOR UPDATE', [emailKey(email)])).rows[0]
    if (!lead?.affiliate_id || (lead.converted_customer_id && lead.converted_customer_id !== customerId)) return
    if (await conversionPredatesSubmission(client, customerId, lead.submitted_at)) return
    const eligible = (await client.query("SELECT id FROM affiliates WHERE id=$1 AND status='approved' AND email<>$2", [lead.affiliate_id, email.trim().toLowerCase()])).rows[0]
    if (!eligible) return
    await client.query(`INSERT INTO affiliate_attributions(id,customer_id,affiliate_id,lead_id,actor,reason)
      VALUES($1,$2,$3,$4,'intake','Reliably matched qualified lead')`, [id(), customerId, lead.affiliate_id, lead.id])
    await audit(client, lead.affiliate_id, 'customer_attributed', 'intake', 'Reliably matched qualified lead', customerId, { leadId: lead.id })
  })
}
async function conversionPredatesSubmission(client: PoolClient, customerId: string, submittedAt: Date): Promise<boolean> {
  return (await client.query(`SELECT 1 FROM payment_history
    WHERE customer_id=$1 AND kind='invoice_paid' AND status='succeeded' AND occurred_at<$2
    UNION ALL SELECT 1 FROM payment_link_terms WHERE customer_id=$1 AND completed_at<$2 LIMIT 1`,
  [customerId, submittedAt])).rows.length > 0
}
export async function lockConversion(client: PoolClient, customerId: string, at: Date) {
  const pending = (await client.query(`SELECT a.*,l.affiliate_id AS lead_affiliate_id,l.submitted_at,l.converted_at AS lead_converted_at
    FROM affiliate_attributions a JOIN affiliate_leads l ON l.id=a.lead_id WHERE a.customer_id=$1
    ORDER BY a.effective_at DESC,a.id DESC LIMIT 1 FOR UPDATE OF a,l`, [customerId])).rows[0]
  if (pending && !pending.converted_at && !pending.lead_converted_at && pending.affiliate_id !== pending.lead_affiliate_id && pending.submitted_at <= at) {
    await client.query(`INSERT INTO affiliate_attributions(id,customer_id,affiliate_id,lead_id,effective_at,actor,reason)
      VALUES($1,$2,$3,$4,$5,'intake','Qualified resubmission after protection elapsed')`,
    [id(), customerId, pending.lead_affiliate_id, pending.lead_id, pending.submitted_at])
  }
  const attribution = (await client.query(`SELECT * FROM affiliate_attributions WHERE customer_id=$1 AND effective_at<=$2
    ORDER BY effective_at DESC,id DESC LIMIT 1 FOR UPDATE`, [customerId, at])).rows[0]
  if (!attribution) {
    const customer = (await client.query('SELECT email FROM customers WHERE id=$1', [customerId])).rows[0]
    if (!customer) return
    const lead = (await client.query(`SELECT * FROM affiliate_leads WHERE email_digest=$1 AND submitted_at<=$2 FOR UPDATE`,
      [emailKey(customer.email), at])).rows[0]
    if (lead && (!lead.converted_customer_id || lead.converted_customer_id === customerId)) {
      // The link may have been created before the qualified submission. Attach at THIS
      // conversion, never at the earlier link date or to a customer already converted.
      const hasAssignment = (await client.query('SELECT id FROM affiliate_attributions WHERE customer_id=$1 LIMIT 1', [customerId])).rows.length > 0
      const alreadyConverted = await conversionPredatesSubmission(client, customerId, lead.submitted_at)
      if (lead.affiliate_id && !lead.converted_at && !hasAssignment && !alreadyConverted) {
        const eligible = (await client.query(`SELECT a.id,a.email,r.status FROM affiliates a
          JOIN LATERAL (SELECT status FROM affiliate_rules WHERE affiliate_id=a.id AND customer_id IS NULL AND effective_at<=$2
            ORDER BY effective_at DESC,id DESC LIMIT 1) r ON true
          WHERE a.id=$1 AND a.created_at<=$2 FOR UPDATE OF a`, [lead.affiliate_id, at])).rows[0]
        if (eligible?.status === 'approved' && eligible.email.trim().toLowerCase() !== customer.email.trim().toLowerCase()) {
          await client.query(`INSERT INTO affiliate_attributions(id,customer_id,affiliate_id,lead_id,effective_at,converted_at,actor,reason)
            VALUES($1,$2,$3,$4,$5,$5,'intake','Exact-email qualified lead attached at conversion after link creation')`,
          [id(), customerId, lead.affiliate_id, lead.id, at])
          await audit(client, lead.affiliate_id, 'customer_attributed_at_conversion', 'intake',
            'Exact-email qualified lead attached at conversion after link creation', customerId, { leadId: lead.id })
        }
      }
      await client.query(`UPDATE affiliate_leads SET converted_at=COALESCE(converted_at,$2),
        converted_customer_id=COALESCE(converted_customer_id,$3) WHERE id=$1`, [lead.id, at, customerId])
    }
    return
  }
  await client.query('UPDATE affiliate_attributions SET converted_at=COALESCE(converted_at,$2) WHERE id=$1', [attribution.id, at])
  if (attribution.lead_id) await client.query(`UPDATE affiliate_leads SET converted_at=COALESCE(converted_at,$2),
    converted_customer_id=COALESCE(converted_customer_id,$3) WHERE id=$1`, [attribution.lead_id, at, customerId])
}
export async function recordAffiliateConversion(customerId: string, at: Date) {
  await transaction(async client => {
    await client.query('SELECT id FROM customers WHERE id=$1 FOR UPDATE', [customerId])
    await lockConversion(client, customerId, at)
  })
}
