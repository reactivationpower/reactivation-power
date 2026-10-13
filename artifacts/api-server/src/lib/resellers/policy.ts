export const isResellerRole = (role: string) => role === 'reseller_manager' || role === 'reseller_salesperson'
export interface StandardPrices {
  lifetime_cents: number; monthly_cents: number; setup_cents: number; version: number
}
export function assertPrices(prices: StandardPrices | null | undefined, type: string,
  lifetime: number, monthly: number, setup: number) {
  if (!prices) throw new Error('Selling is unavailable until the owner configures standard prices.')
  const valid = (n: number) => Number.isSafeInteger(n) && n >= 0 && n <= 99999999
  if (![lifetime, monthly, setup].every(valid)) throw new Error('Enter valid prices in cents.')
  if (type === 'one_time') {
    if (lifetime < Math.max(50, prices.lifetime_cents - 100000) || lifetime > prices.lifetime_cents || monthly !== 0 || setup !== 0)
      throw new Error('Lifetime discount cannot exceed $1,000 from the approved standard price.')
  } else if (type === 'subscription') {
    if (monthly < Math.max(50, prices.monthly_cents - 10000) || monthly > prices.monthly_cents || lifetime !== 0)
      throw new Error('Monthly discount cannot exceed $100 from the approved standard price.')
    if (setup !== prices.setup_cents) throw new Error('Setup pricing is owner-controlled and cannot be discounted or waived.')
  } else throw new Error('Choose a lifetime or subscription offer.')
}
export function canSeeProspect(actor: { userId: string; role: string; companyId?: string },
  prospect: { company_id: string; salesperson_id: string }) {
  return actor.role === 'super_admin' || (actor.companyId === prospect.company_id &&
    (actor.role === 'reseller_manager' || actor.userId === prospect.salesperson_id))
}
export function eligibleRelationship(company: { activated_at: Date | string; terminated_at: Date | string | null }, at: Date) {
  return +at >= +new Date(company.activated_at) &&
    (!company.terminated_at || +at < +new Date(company.terminated_at))
}
/** One cumulative loss target prevents overlapping refunds/disputes deducting twice. */
export function reversalTarget(earned: number, collected: number, refund: number, disputed: number, proven: number) {
  return collected > 0 ? Math.min(earned, Math.round(earned * Math.min(collected, Math.max(refund + proven, disputed)) / collected)) : 0
}
