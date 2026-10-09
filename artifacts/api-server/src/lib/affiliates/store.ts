import { randomUUID } from 'node:crypto'
import { pool, type PoolClient } from '@workspace/db'
import { authTransaction } from '@/lib/auth/portal-challenges'
import { ZERO_RULES, type Rules } from './rules'

export const id = () => randomUUID()
export const transaction = authTransaction
export interface Partner {
  id: string; business_name: string; email: string; status: string; referral_code: string
  access_version: number; created_at: Date
}
export async function audit(client: PoolClient, affiliateId: string | null, action: string, actor: string,
  reason: string | null = null, customerId: string | null = null, details: Record<string, unknown> = {}) {
  await client.query(`INSERT INTO affiliate_activity(id,affiliate_id,action,actor,reason,customer_id,details)
    VALUES($1,$2,$3,$4,$5,$6,$7)`, [id(), affiliateId, action, actor, reason, customerId, JSON.stringify(details)])
}
export async function rulesAt(client: Pick<PoolClient, 'query'>, affiliateId: string, customerId: string | null, at: Date): Promise<Rules> {
  const { rows } = await client.query(`SELECT rules FROM affiliate_rules WHERE affiliate_id=$1
    AND (customer_id IS NULL OR customer_id=$2) AND effective_at <= $3
    ORDER BY (customer_id IS NOT NULL) DESC,effective_at DESC,id DESC LIMIT 1`, [affiliateId, customerId, at])
  return rows[0]?.rules ?? ZERO_RULES
}
export async function partner(idValue: string): Promise<Partner | null> {
  return (await pool.query('SELECT * FROM affiliates WHERE id=$1', [idValue])).rows[0] ?? null
}
export function requireReason(reason: string): string {
  if (typeof reason !== 'string' || !reason.trim() || reason.length > 500) throw new Error('A reason (up to 500 characters) is required')
  return reason.trim()
}
