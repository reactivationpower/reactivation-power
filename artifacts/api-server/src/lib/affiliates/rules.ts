export interface Rule { kind: 'percent' | 'flat'; value: number }
export interface Rules { monthly: Rule; one_time: Rule }
export const ZERO_RULES: Rules = { monthly: { kind: 'percent', value: 0 }, one_time: { kind: 'percent', value: 0 } }

export function validateRules(value: Rules): Rules {
  for (const rule of [value?.monthly, value?.one_time]) {
    if (!rule || !['percent', 'flat'].includes(rule.kind) || !Number.isSafeInteger(rule.value) ||
      rule.value < 0 || rule.value > (rule.kind === 'percent' ? 10000 : 99999999)) throw new Error('Invalid commission rule')
  }
  return { monthly: { ...value.monthly }, one_time: { ...value.one_time } }
}
/** Integer cents, round half up. Percentage values are integer basis points. */
export function earnedCents(collected: number, rule: Rule): number {
  if (!Number.isSafeInteger(collected) || collected <= 0) return 0
  return rule.kind === 'flat' ? rule.value : Number((BigInt(collected) * BigInt(rule.value) + 5000n) / 10000n)
}
export function clawbackCents(earned: number, collected: number, reversed: number): number {
  if (collected <= 0) return 0
  const capped = Math.max(0, Math.min(collected, reversed))
  return Number((BigInt(earned) * BigInt(capped) * 2n + BigInt(collected)) / (BigInt(collected) * 2n))
}
export function periodAt(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit' }).formatToParts(date)
  return `${parts.find(p => p.type === 'year')!.value}-${parts.find(p => p.type === 'month')!.value}`
}
export function canReattribute(protectedUntil: Date | null, converted: boolean, now: Date): boolean {
  return !converted && (!protectedUntil || now.getTime() >= protectedUntil.getTime())
}
