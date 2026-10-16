/**
 * Validation rules for the /healthcare lead form. Shared by the client (so
 * errors appear the instant someone clicks submit) and the server action (the
 * real gate), so the two can never disagree about what "required" means.
 */
import { INACTIVE_TYPED_MAX, NEW_PATIENTS_MONTHLY_MAX, NEW_PATIENTS_MONTHLY_MIN, SCENARIO_VALUE_MAX, VALUE_MIN, parseCalculatorScenario, type CalculatorScenario } from './opportunity'

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const PRODUCT_INTERESTS = ['reactivation', 'lead-follow-up', 'both'] as const
export type ProductInterest = (typeof PRODUCT_INTERESTS)[number]
export const PRODUCT_INTEREST_LABELS: Record<ProductInterest, string> = {
  reactivation: 'Reactivation',
  'lead-follow-up': 'Lead Follow-Up',
  both: 'Both',
}
export function isProductInterest(value: string): value is ProductInterest {
  return PRODUCT_INTERESTS.some((interest) => interest === value)
}

/** "Best time to connect" choices, in the visitor's own local time. Empty = not chosen. */
export const BEST_TIMES = ['9–11 AM', '11 AM–1 PM', '1–3 PM', '3–5 PM', 'Anytime'] as const
export type BestTime = (typeof BEST_TIMES)[number]
export function isBestTime(value: string): value is BestTime {
  return BEST_TIMES.some((time) => time === value)
}

export interface LeadFieldValues {
  firstName: string
  lastName: string
  email: string
  phone: string
  zip: string
  yearsInPractice: string
  /** Whole-number count as a digit string, e.g. "1800" */
  inactivePatients: string
  /** Annual patient value from the hero slider as a digit string; may be empty */
  patientValue: string
  consent: boolean
  services: string[]
  /** Missing on legacy /healthcare submissions; those remain reactivation. */
  productInterest?: string
  /** Optional; empty or one of BEST_TIMES */
  bestTime: string
  calculatorScenario: boolean
  additionalPatientsPerMonth: string
  newPatientValue: string
}

/** The slice of FormData this helper reads. Declared structurally so the
 * package type-checks without the DOM lib (the api-server has none). */
export interface LeadFormDataLike {
  get(key: string): unknown
  getAll(key: string): unknown[]
}

/** Pull the lead fields out of a FormData identically on both sides. */
export function readLeadFields(formData: LeadFormDataLike): LeadFieldValues {
  const str = (key: string) => String(formData.get(key) ?? '').trim()
  return {
    firstName: str('firstName'),
    lastName: str('lastName'),
    email: str('email').toLowerCase(),
    phone: str('phone'),
    zip: str('zip').replace(/\D/g, '').slice(0, 5),
    yearsInPractice: str('yearsInPractice'),
    inactivePatients: str('inactivePatients').replace(/,/g, ''),
    patientValue: str('patientValue').replace(/[$,]/g, ''),
    calculatorScenario: formData.get('calculatorScenario') !== null ||
      formData.get('additionalPatientsPerMonth') !== null ||
      formData.get('newPatientValue') !== null,
    additionalPatientsPerMonth: str('additionalPatientsPerMonth'),
    newPatientValue: str('newPatientValue').replace(/[$,]/g, ''),
    consent: formData.get('consent') === 'on',
    services: formData
      .getAll('services')
      .map((s) => String(s).trim())
      .filter(Boolean)
      .slice(0, 30),
    productInterest: str('productInterest') || undefined,
    bestTime: str('bestTime'),
  }
}

/** One message per invalid field, keyed by input name. Empty object = valid. */
export function validateLeadFields(
  v: LeadFieldValues,
): Record<string, string> {
  const errors: Record<string, string> = {}

  if (!v.firstName) errors.firstName = 'First name is required.'
  if (!v.lastName) errors.lastName = 'Last name is required.'

  if (!v.email) errors.email = 'Email is required.'
  else if (!EMAIL_RE.test(v.email))
    errors.email = 'Enter a valid email address.'

  const phoneDigits = v.phone.replace(/\D/g, '')
  if (!v.phone) errors.phone = 'Phone number is required.'
  else if (phoneDigits.length !== 10)
    errors.phone = 'Enter a valid 10-digit phone number.'

  if (v.zip.length !== 5) errors.zip = 'Enter your 5-digit zip code.'
  if (!v.yearsInPractice) errors.yearsInPractice = 'Select an option.'
  if (v.productInterest && !isProductInterest(v.productInterest))
    errors.productInterest = 'Select how we can help your practice.'
  if (!v.inactivePatients && v.productInterest !== 'lead-follow-up')
    errors.inactivePatients = 'Enter your inactive patient count.'
  else if (v.inactivePatients) {
    const count = Number(v.inactivePatients)
    if (!/^\d+$/.test(v.inactivePatients) || !Number.isSafeInteger(count) || count < 1 || count > INACTIVE_TYPED_MAX)
      errors.inactivePatients = `Enter a whole number from 1 to ${INACTIVE_TYPED_MAX.toLocaleString('en-US')}.`
  }
  if (v.bestTime && !isBestTime(v.bestTime))
    errors.bestTime = 'Select a time from the list.'
  if (v.services.length === 0)
    errors.services = 'Select at least one service.'
  if (v.calculatorScenario) {
    const wholeInRange = (raw: string, min: number, max: number) =>
      /^\d+$/.test(raw) && Number.isSafeInteger(Number(raw)) &&
      Number(raw) >= min && Number(raw) <= max
    if (!wholeInRange(v.patientValue, VALUE_MIN, SCENARIO_VALUE_MAX))
      errors.patientValue = 'Enter an annual patient value from $1,000 to $10,000.'
    if (!wholeInRange(v.additionalPatientsPerMonth, NEW_PATIENTS_MONTHLY_MIN, NEW_PATIENTS_MONTHLY_MAX))
      errors.additionalPatientsPerMonth = 'Enter 1 to 40 additional new patients per month.'
    if (!wholeInRange(v.newPatientValue, VALUE_MIN, SCENARIO_VALUE_MAX))
      errors.newPatientValue = 'Enter a first-year new patient value from $1,000 to $10,000.'
    if (v.productInterest === 'lead-follow-up')
      errors.productInterest = 'Select Both for a combined calculator estimate.'
  }
  if (!v.consent)
    errors.consent =
      'Please check this box so we can contact you about your call.'

  return errors
}

/** Only call after validateLeadFields reports no errors. */
export function validatedCalculatorScenario(v: LeadFieldValues): CalculatorScenario | null {
  if (!v.calculatorScenario) return null
  return parseCalculatorScenario(v)
}
