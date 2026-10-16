import { randomUUID } from 'node:crypto'
import { pool, type PoolClient } from '@workspace/db'
import { authTransaction } from '@/lib/auth/portal-challenges'
import { getAdminSession, type AdminSession } from '@/lib/auth/admin-session'
import { canSeeProspect, isResellerRole, assertPrices } from './policy'
import { AGREEMENT_DEFAULTS } from '@/lib/agreements/defaults'

export const id = () => randomUUID()
export const transaction = authTransaction
export type Seller = AdminSession & { companyId?: string }
export function reason(value: string) {
  if (typeof value !== 'string' || !value.trim() || value.length > 500) throw new Error('A reason (up to 500 characters) is required.')
  return value.trim()
}
export async function audit(client: Pick<PoolClient, 'query'>, companyId: string | null, actor: string,
  action: string, why: string, prospectId: string | null = null, details: Record<string, unknown> = {}) {
  await client.query(`INSERT INTO reseller_activity(id,company_id,actor,action,reason,prospect_id,details)
    VALUES($1,$2,$3,$4,$5,$6,$7)`, [id(), companyId, actor, action, why, prospectId, JSON.stringify(details)])
}
export async function requireSeller(): Promise<Seller> {
  const session = await getAdminSession()
  if (!session) throw new Error('Sign in required.')
  if (session.role === 'super_admin' || session.role === 'sales_rep') return session
  if (!isResellerRole(session.role)) throw new Error('Forbidden')
  const member = (await pool.query(`SELECT m.*,c.terminated_at FROM reseller_members m
    JOIN reseller_companies c ON c.id=m.company_id WHERE m.user_id=$1`, [session.userId])).rows[0]
  if (!member?.active || member.terminated_at || member.role !== session.role) throw new Error('Reseller selling access has ended.')
  return { ...session, companyId: member.company_id }
}
export async function requireReseller(): Promise<Seller> {
  const actor = await requireSeller()
  if (!actor.companyId && actor.role !== 'super_admin') throw new Error('Reseller permission required.')
  return actor
}
export async function scopedProspect(actor: Seller, prospectId: string, client: Pick<PoolClient, 'query'> = pool, lock = false) {
  const p = (await client.query(`SELECT * FROM reseller_prospects WHERE id=$1${lock ? ' FOR UPDATE' : ''}`, [prospectId])).rows[0]
  if (!p || !canSeeProspect(actor, p)) throw new Error('Prospect not found.')
  return p
}
/** Every shared enrollment action checks reseller scope before hydrating sensitive records. */
export async function assertSellerLink(actor: Seller, linkId: string) {
  if (!actor.companyId) return
  const sale = (await pool.query('SELECT * FROM reseller_sales WHERE link_id=$1', [linkId])).rows[0]
  if (!sale || sale.company_id !== actor.companyId ||
    (actor.role !== 'reseller_manager' && sale.salesperson_id !== actor.userId)) throw new Error('Offer not found.')
}
export async function assertAgreementPrices(linkId: string, type: string, terms: {
  termMonths: number; monthlyCents: number; setupFeeCents: number; body?: string; noticeDays?: number
}, actor: Seller) {
  await assertSellerLink(actor, linkId)
  const sale = (await pool.query('SELECT * FROM reseller_sales WHERE link_id=$1', [linkId])).rows[0]
  if (!sale) return
  assertPrices({ lifetime_cents: sale.standard_lifetime_cents, monthly_cents: sale.standard_monthly_cents,
    setup_cents: sale.standard_setup_cents, version: sale.price_version }, type,
  type === 'one_time' ? terms.setupFeeCents : 0, terms.monthlyCents, type === 'one_time' ? 0 : terms.setupFeeCents)
  const existing=(await pool.query('SELECT term_months,notice_days FROM agreements WHERE link_id=$1',[linkId])).rows[0]
  if (actor.companyId && (terms.termMonths !== (existing?.term_months ?? (type === 'one_time' ? 0 : AGREEMENT_DEFAULTS.termMonths)) ||
    terms.noticeDays !== (existing?.notice_days ?? AGREEMENT_DEFAULTS.noticeDays)))
    throw new Error('Resellers cannot change the standard service term or cancellation rules.')
}
