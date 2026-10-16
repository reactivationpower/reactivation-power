/**
 * Pure billing rules shared by the payment/subscription actions.
 * No I/O here so the state machine can be unit-tested directly.
 */

export const TRIAL_DAYS = 30
export const AGREEMENT_MONTHS = 12
const DAY_MS = 24 * 60 * 60 * 1000

export type CheckoutStage = 'primary' | 'secondary' | 'done'

export interface StageInput {
  setupPaidAt: Date | null
  completedAt: Date | null
}

/** Which step of the two-card checkout a subscription link is on. */
export function stageOf(terms: StageInput): CheckoutStage {
  if (terms.completedAt) return 'done'
  if (terms.setupPaidAt) return 'secondary'
  return 'primary'
}

/**
 * A link may only be deleted while nothing has been charged. Once the setup
 * fee is paid (or the subscription exists) it is a customer record, not a link.
 */
export function canDeleteLink(terms: StageInput | null | undefined): boolean {
  if (!terms) return true
  return stageOf(terms) === 'primary'
}

export interface CardIdentity {
  stripePaymentMethodId: string
  fingerprint: string | null
}

/** True when the candidate is the same physical card as the primary. */
export function isSameCard(primary: CardIdentity, candidate: CardIdentity): boolean {
  if (candidate.stripePaymentMethodId === primary.stripePaymentMethodId) return true
  return Boolean(candidate.fingerprint) && candidate.fingerprint === primary.fingerprint
}

/** Trial end / agreement window anchored on the setup-fee payment. */
export function agreementWindow(
  setupPaidAt: Date,
  termMonths: number = AGREEMENT_MONTHS,
  anchor: 'thirty_days' | 'calendar_month' = 'thirty_days',
): { agreementStart: Date; agreementEnd: Date } {
  const agreementStart = anchor === 'calendar_month'
    ? addCalendarMonths(setupPaidAt, 1)
    : new Date(setupPaidAt.getTime() + TRIAL_DAYS * DAY_MS)
  const agreementEnd = anchor === 'calendar_month'
    ? addCalendarMonths(agreementStart, termMonths > 0 ? termMonths : AGREEMENT_MONTHS)
    : new Date(agreementStart)
  if (anchor === 'thirty_days') agreementEnd.setUTCMonth(agreementEnd.getUTCMonth() + (termMonths > 0 ? termMonths : AGREEMENT_MONTHS))
  return { agreementStart, agreementEnd }
}

/** Retain the day where possible; a 29th–31st anchor uses the month's last day. */
export function addCalendarMonths(date: Date, months: number): Date {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(date.getUTCDate(), lastDay))
  target.setUTCHours(date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds())
  return target
}

export interface CustomerInput {
  fullName: string
  businessName: string
  businessAddress: string
  phone: string
  ownerName: string
  ownerPhone: string
  email: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Every contact field is mandatory for a customer record. */
export function cleanCustomer(
  input: Partial<CustomerInput> | null | undefined,
): { ok: true; value: CustomerInput } | { ok: false; error: string } {
  const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max)
  const value: CustomerInput = {
    fullName: str(input?.fullName, 120),
    businessName: str(input?.businessName, 160),
    businessAddress: str(input?.businessAddress, 400),
    phone: str(input?.phone, 32),
    ownerName: str(input?.ownerName, 120),
    ownerPhone: str(input?.ownerPhone, 32),
    email: str(input?.email, 254).toLowerCase(),
  }
  if (!value.fullName) return { ok: false, error: 'Full name is required.' }
  if (!value.businessName) return { ok: false, error: 'Business name is required.' }
  if (!value.businessAddress) return { ok: false, error: 'Business address is required.' }
  if (!value.phone) return { ok: false, error: 'Business phone is required.' }
  if (!value.ownerName) return { ok: false, error: 'Owner name is required.' }
  if (!value.ownerPhone) return { ok: false, error: 'Owner phone is required.' }
  if (!value.email || !EMAIL_RE.test(value.email)) return { ok: false, error: 'A valid email is required.' }
  return { ok: true, value }
}

// ── Dunning / access rules ─────────────────────────────────────────────────

export interface RetryCard {
  rank: 'primary' | 'secondary'
  stripePaymentMethodId: string
}

/**
 * The next card to try for an invoice, given every card that has already
 * declined on it. Policy: primary once, then secondary once, then stop —
 * never back to a card that already failed this invoice. Stripe emits a
 * fresh `invoice.payment_failed` for each attempt we make, so anything that
 * alternated between the two cards would loop forever.
 */
export function cardToRetry<T extends RetryCard>(cards: T[], failedPaymentMethodIds: Iterable<string | null | undefined>): T | null {
  const failed = new Set<string>()
  for (const id of failedPaymentMethodIds) if (id) failed.add(id)
  const primary = cards.find((c) => c.rank === 'primary') ?? null
  const secondary = cards.find((c) => c.rank === 'secondary') ?? null
  // Unknown failed card (e.g. Stripe charged a method we do not track):
  // treat it as the primary having been tried.
  if (failed.size === 0 || ![...failed].some((id) => id === primary?.stripePaymentMethodId || id === secondary?.stripePaymentMethodId)) {
    return secondary ?? null
  }
  if (secondary && !failed.has(secondary.stripePaymentMethodId)) return secondary
  return null
}

export type AccessReconciliation = 'block' | 'restore' | 'none'

/**
 * What a subscription status event means for portal access, decided from
 * *fresh* Stripe state rather than the event payload: webhooks arrive out of
 * order, so a stale `past_due` must not re-lock a customer whose invoice
 * the backup card already paid.
 */
export function reconcileAccess(input: {
  subscriptionStatus: string
  openInvoices: number
  billingStatus: string
}): AccessReconciliation {
  const blocked = isAccessBlocked(input.billingStatus)
  if (input.subscriptionStatus === 'active' || input.subscriptionStatus === 'trialing') {
    if (input.openInvoices > 0) return 'none'
    if (blocked) return 'restore'
    return input.billingStatus === 'active' || input.billingStatus === 'trialing' ? 'none' : 'restore'
  }
  if (input.subscriptionStatus === 'past_due' || input.subscriptionStatus === 'unpaid') {
    return !blocked && input.openInvoices > 0 ? 'block' : 'none'
  }
  return 'none'
}

/** Billing statuses that shut the portal off for the owner and all staff. */
export function isAccessBlocked(billingStatus: string): boolean {
  return billingStatus === 'past_due' || billingStatus === 'canceled'
}

/** Customer status once an invoice is paid, from the subscription's status. */
export function billingStatusAfterPayment(subscriptionStatus: string | null): 'trialing' | 'active' {
  return subscriptionStatus === 'trialing' ? 'trialing' : 'active'
}

interface SubscriptionLike {
  status: string
  trial_end: number | null
  items: { data: { current_period_end: number }[] }
}

/** When Stripe will next try to bill this subscription. */
export function subscriptionNextPaymentAt(sub: SubscriptionLike): Date | null {
  if (sub.status === 'canceled') return null
  if (sub.status === 'trialing' && sub.trial_end) return new Date(sub.trial_end * 1000)
  const end = sub.items.data[0]?.current_period_end
  return end ? new Date(end * 1000) : null
}

/** A next-billing-date change must be in the future; Stripe rejects the past. */
export function validateBillingDate(date: Date, now = new Date()): string | null {
  if (Number.isNaN(date.getTime())) return 'Pick a valid date.'
  if (date.getTime() <= now.getTime() + 60 * 60 * 1000) return 'The next billing date must be at least an hour from now.'
  if (date.getTime() > now.getTime() + 366 * 24 * 60 * 60 * 1000) return 'The next billing date cannot be more than a year out.'
  return null
}

/** Refund amount check against what is still refundable on the charge. */
export function validateRefundAmount(amountCents: number | null | undefined, refundableCents: number): string | null {
  if (refundableCents <= 0) return 'This payment has already been fully refunded.'
  if (amountCents == null) return null // full refund of the remainder
  if (!Number.isInteger(amountCents) || amountCents <= 0) return 'Enter a refund amount greater than $0.'
  if (amountCents > refundableCents) return `You can refund at most ${(refundableCents / 100).toFixed(2)} on this payment.`
  return null
}

export interface ObligationInput {
  /** Next scheduled charge (Stripe current_period_end / trial_end). */
  nextPaymentAt: Date | null
  /** End of the 12-month agreement. */
  agreementEnd: Date | null
  monthlyCents: number
  now?: Date
}

export interface RemainingObligation {
  /** Monthly charges still due before the agreement ends. */
  payments: number
  totalCents: number
  /** The dates of those charges, in order. */
  dates: Date[]
  agreementEnd: Date | null
}

/**
 * What a customer still owes under the agreement if they cancel today: every
 * monthly charge from the next payment date up to (not including) the
 * agreement end. A 12-month agreement started on its first charge bills on
 * months 0–11, so a charge that would fall on the end date itself is not
 * counted. Nothing is owed once the term has run out or the subscription
 * never scheduled another charge.
 */
/** Safety bound only — well above the 60-month maximum term. */
const MAX_OBLIGATION_PAYMENTS = 120

/** Add calendar months in UTC, clamping to the last day of the target month. */
export function addUtcMonthsClamped(from: Date, months: number): Date {
  const day = from.getUTCDate()
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + months, 1, from.getUTCHours(), from.getUTCMinutes(), from.getUTCSeconds(), from.getUTCMilliseconds()))
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, lastDay))
  return d
}

export function remainingObligation(input: ObligationInput): RemainingObligation {
  const now = input.now ?? new Date()
  const empty: RemainingObligation = { payments: 0, totalCents: 0, dates: [], agreementEnd: input.agreementEnd }
  if (!input.nextPaymentAt || !input.agreementEnd || input.monthlyCents <= 0) return empty
  if (input.agreementEnd.getTime() <= now.getTime()) return empty
  // Walk the billing anchor forward one calendar month at a time until the
  // agreement ends. No fixed cap: agreements run anywhere from 1 to 60 months.
  // Anchored on the original day-of-month so a Jan 31 anchor bills Feb 28 and
  // then Mar 31 (Stripe's behaviour), never drifting to the 28th for good.
  const dates: Date[] = []
  const anchor = new Date(input.nextPaymentAt)
  const endMs = input.agreementEnd.getTime()
  for (let k = 0; k <= MAX_OBLIGATION_PAYMENTS; k++) {
    const d = addUtcMonthsClamped(anchor, k)
    if (d.getTime() >= endMs) break
    dates.push(d)
  }
  return { payments: dates.length, totalCents: dates.length * input.monthlyCents, dates, agreementEnd: input.agreementEnd }
}
