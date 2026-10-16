import { pool } from '@workspace/db'
import { getAgreementForLink, canViewLinkAgreement } from '@/actions/agreements'
import { requireAdmin } from '@/lib/auth/admin-session'
import { canAccessNotificationAgreement } from '@/lib/enrollment-notifications'

const customerFields = `id,full_name,business_name,business_address,phone,owner_name,owner_phone,email,
  billing_status,billing_issue,participant_id,created_by_name,created_at,stripe_customer_id`

/** Customer identity is independent of both an offer and a portal participant. */
export async function listCustomers(query = '', rawPage = '1') {
  const page = Math.max(1, Math.min(10000, Number.parseInt(rawPage, 10) || 1))
  const pageSize = 50
  const search = `%${query.trim().slice(0, 100).replace(/[\\%_]/g, '\\$&')}%`
  const filter = `concat_ws(' ',c.full_name,c.business_name,c.email,c.phone,c.owner_name) ILIKE $1`
  const [count, rows] = await Promise.all([
    pool.query(`SELECT count(*)::int AS total FROM customers c WHERE ${filter}`, [search]),
    pool.query(`SELECT c.id,c.full_name,c.business_name,c.email,c.phone,c.billing_status,
      (SELECT count(*)::int FROM payment_link_terms t JOIN payment_links l ON l.id::text=t.link_id WHERE t.customer_id=c.id) AS offer_count,
      CASE WHEN EXISTS(SELECT 1 FROM agreements a WHERE a.customer_id=c.id AND a.signed_at IS NOT NULL) THEN 'signed'
        WHEN EXISTS(SELECT 1 FROM agreements a WHERE a.customer_id=c.id) THEN 'unsigned' ELSE 'not_created' END AS agreement_status,
      CASE WHEN EXISTS(SELECT 1 FROM payment_link_terms t WHERE t.customer_id=c.id AND t.completed_at IS NOT NULL) THEN 'completed'
        WHEN EXISTS(SELECT 1 FROM enrollment_invitations i JOIN payment_link_terms t ON t.link_id=i.link_id WHERE t.customer_id=c.id AND i.status='failed') THEN 'invitation_failed'
        ELSE 'pending' END AS enrollment_status
      FROM customers c WHERE ${filter} ORDER BY c.created_at DESC,c.id LIMIT $2 OFFSET $3`,
    [search, pageSize, (page - 1) * pageSize]),
  ])
  return { customers: rows.rows, total: count.rows[0].total, page, pageSize }
}

export async function getCustomerRecord(id: string) {
  const customer = (await pool.query(`SELECT ${customerFields} FROM customers WHERE id=$1`, [id])).rows[0]
  if (!customer) return null
  const [offers, accounts, history, agreements, leads] = await Promise.all([
    pool.query(`SELECT l.id,l.name,l.email,l.status,l.amount_cents,t.type,t.monthly_cents,t.setup_fee_cents,
      t.completed_at,CASE WHEN t.completed_at IS NOT NULL THEN 'completed'
        WHEN t.type='subscription' AND t.setup_paid_at IS NOT NULL THEN 'awaiting_backup_card'
        ELSE 'pending' END AS stage,t.enrollment_flow,i.status AS invitation_status
      FROM payment_link_terms t JOIN payment_links l ON l.id::text=t.link_id
      LEFT JOIN enrollment_invitations i ON i.link_id=t.link_id
      WHERE t.customer_id=$1 ORDER BY l.created_at DESC LIMIT 100`, [id]),
    // Read actual accounts, never the prospective staff JSON on an offer.
    pool.query(`SELECT DISTINCT p.id,p.first_name,p.last_name,p.email,p.role,p.is_active
      FROM participants p WHERE p.id::text IN (
        SELECT participant_id FROM customers WHERE id=$1 AND participant_id IS NOT NULL
        UNION SELECT l.participant_id::text FROM payment_links l JOIN payment_link_terms t ON t.link_id=l.id::text WHERE t.customer_id=$1
      ) OR p.parent_id::text IN (
        SELECT participant_id FROM customers WHERE id=$1 AND participant_id IS NOT NULL
        UNION SELECT l.participant_id::text FROM payment_links l JOIN payment_link_terms t ON t.link_id=l.id::text WHERE t.customer_id=$1
      ) ORDER BY p.role,p.first_name`, [id]),
    pool.query(`SELECT id,link_id,kind,status,amount_cents,currency,description,failure_message,occurred_at
      FROM payment_history WHERE customer_id=$1 ORDER BY occurred_at DESC,created_at DESC LIMIT 200`, [id]),
    pool.query(`SELECT id,status,signed_at,link_id FROM agreements WHERE customer_id=$1 ORDER BY created_at DESC LIMIT 100`, [id]),
    // Sales leads linked to this customer, newest first. Their history is shown here, never copied.
    pool.query(`SELECT id,first_name,last_name,practice_name,email,phone,stage,source,created_at
      FROM sales_leads WHERE customer_id=$1 ORDER BY created_at DESC,id LIMIT 20`, [id]),
  ])
  // Do not fan out a full agreement hydration for every offer at once.
  const hydratedOffers = []
  for (const offer of offers.rows) hydratedOffers.push({
    ...offer, agreement: await getAgreementForLink(String(offer.id)), agreement_access: await canViewLinkAgreement(String(offer.id)),
  })
  const admin = await requireAdmin()
  for (const agreement of agreements.rows) agreement.can_view = await canAccessNotificationAgreement(admin, agreement.id)
  const liveOfferIds = (await pool.query(`SELECT l.id FROM payment_links l JOIN payment_link_terms t
    ON t.link_id=l.id::text WHERE t.customer_id=$1`, [id])).rows.map(row => row.id)
  return { customer, offers: hydratedOffers, liveOfferIds, accounts: accounts.rows, history: history.rows, agreements: agreements.rows, leads: leads.rows }
}

/** Read-only prefill. Opening or cancelling setup must never convert a lead. */
export async function getEnrollmentSetup(leadId?: string, customerId?: string) {
  const lead = leadId ? (await pool.query('SELECT * FROM sales_leads WHERE id=$1', [leadId])).rows[0] : null
  if (leadId && !lead) throw new Error('Lead not found')
  if (lead?.customer_id) return { continueCustomerId: lead.customer_id }
  if (lead?.stage === 'Lost/Do Not Contact') throw new Error('This lead is closed to enrollment')
  const matches = customerId
    ? (await pool.query(`SELECT ${customerFields} FROM customers WHERE id=$1`, [customerId])).rows
    : lead?.email ? (await pool.query(`SELECT ${customerFields} FROM customers WHERE lower(trim(email))=lower(trim($1)) LIMIT 2`, [lead.email])).rows : []
  if (customerId && !matches.length) throw new Error('Customer not found')
  if (matches.length > 1) throw new Error('Multiple customer records match this email. Resolve the identity before enrollment.')
  const c = matches[0]
  const name = lead ? `${lead.first_name} ${lead.last_name}`.trim() : ''
  const phone = lead?.phone?.replace(/^\+1/, '') ?? ''
  return { existingCustomerId: c?.id ?? null, customer: {
    fullName: c?.full_name || name, businessName: c?.business_name || lead?.practice_name || '',
    businessAddress: c?.business_address || '', email: c?.email || lead?.email || '',
    phone: c?.phone || phone, ownerName: c?.owner_name || name, ownerPhone: c?.owner_phone || phone,
  } }
}
