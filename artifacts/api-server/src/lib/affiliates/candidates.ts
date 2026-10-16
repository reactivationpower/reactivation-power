import { pool } from '@workspace/db'
import { authDigest } from '@/lib/auth/portal-password'

/** Admin-only projection. Never include this data in affiliateReport. */
export async function attributionCandidates(search = '', kind?: 'lead' | 'customer') {
  if (kind !== undefined && kind !== 'lead' && kind !== 'customer') throw new Error('Choose lead or customer')
  const term = String(search).trim().slice(0, 254)
  const pattern = `%${term.replace(/[\\%_]/g, '\\$&')}%`
  let leads: Record<string, unknown>[] = []
  let customers: Record<string, unknown>[] = []
  if (kind !== 'customer') {
    // The affiliate table deliberately stores only keyed digests. Build the read-only
    // identity projection in the application; never send the digest secret to SQL.
    // More than one sales record for an email is ambiguous, even if names agree.
    const sales = (await pool.query(`SELECT lower(btrim(email)) AS email,
      CASE WHEN count(*)=1 THEN max(nullif(btrim(concat_ws(' ',nullif(btrim(first_name),''),nullif(btrim(last_name),''))),'')) END AS full_name,
      count(*)::int AS matches
      FROM sales_leads WHERE btrim(email)<>'' GROUP BY lower(btrim(email))`)).rows
    const identities = sales.filter(s => s.matches === 1).map(s => ({
      email_digest: authDigest(`affiliate-lead-email:${s.email}`), email: s.email, full_name: s.full_name,
    }))
    leads = (await pool.query(`SELECT l.id,l.practice_name,l.affiliate_id,p.business_name AS affiliate_name,
      l.protected_until,l.converted_customer_id,l.converted_at,s.full_name,s.email
      FROM affiliate_leads l
      LEFT JOIN jsonb_to_recordset($3::jsonb) AS s(email_digest text,email text,full_name text)
        ON s.email_digest=l.email_digest
      LEFT JOIN affiliates p ON p.id=l.affiliate_id
      WHERE l.id=$2 OR l.practice_name ILIKE $1 OR s.full_name ILIKE $1 OR s.email ILIKE $1
      ORDER BY (l.id=$2) DESC,l.submitted_at DESC,l.id DESC LIMIT 100`,
    [pattern, term, JSON.stringify(identities)])).rows
  }
  if (kind !== 'lead') {
    customers = (await pool.query(`SELECT c.id,c.business_name,nullif(btrim(c.full_name),'') AS full_name,
      nullif(btrim(c.email),'') AS email,a.affiliate_id,p.business_name AS affiliate_name
      FROM customers c LEFT JOIN LATERAL
        (SELECT affiliate_id FROM affiliate_attributions WHERE customer_id=c.id ORDER BY effective_at DESC,id DESC LIMIT 1) a ON true
      LEFT JOIN affiliates p ON p.id=a.affiliate_id
      WHERE c.id=$2 OR c.business_name ILIKE $1 OR c.full_name ILIKE $1 OR c.email ILIKE $1
      ORDER BY (c.id=$2) DESC,c.created_at DESC,c.id DESC LIMIT 100`, [pattern, term])).rows
  }
  return { leads, customers }
}
