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
export function agreementWindow(setupPaidAt: Date): { agreementStart: Date; agreementEnd: Date } {
  const agreementStart = new Date(setupPaidAt.getTime() + TRIAL_DAYS * DAY_MS)
  const agreementEnd = new Date(agreementStart)
  agreementEnd.setUTCMonth(agreementEnd.getUTCMonth() + AGREEMENT_MONTHS)
  return { agreementStart, agreementEnd }
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
