/**
 * Single source of the agreement defaults the "Send agreement" form prefills
 * from. Change these here; every existing agreement keeps the amounts that
 * were set on it (its own record is the source of truth downstream).
 */
export const AGREEMENT_DEFAULTS = {
  termMonths: 12,
  monthlyCents: 47500,
  /** Equal to the first month's payment; editable or waivable ($0) per agreement. */
  setupFeeCents: 47500,
  /** Written notice required before the end of the term. */
  noticeDays: 30,
  /** Days between the setup payment and the start of monthly billing. */
  trialDays: 30,
  /** Signing links stop working this long after they are (re)sent. */
  linkValidDays: 30,
} as const

export const COMPANY = {
  name: 'Reactivation Power',
  legalName: 'Reactivation Power',
  supportEmail: 'support@reactivationpower.com',
  siteUrl: 'https://patientpipeline.app',
} as const

export function agreementTitle(termMonths: number): string {
  return `${COMPANY.name} ${termMonths}-Month Service Agreement`
}
