/**
 * Validation rules for the /healthcare lead form. Shared by the client (so
 * errors appear the instant someone clicks submit) and the server action (the
 * real gate), so the two can never disagree about what "required" means.
 */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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
}

/** Pull the lead fields out of a FormData identically on both sides. */
export function readLeadFields(formData: FormData): LeadFieldValues {
  const str = (key: string) => String(formData.get(key) ?? '').trim()
  return {
    firstName: str('firstName'),
    lastName: str('lastName'),
    email: str('email').toLowerCase(),
    phone: str('phone'),
    zip: str('zip').replace(/\D/g, '').slice(0, 5),
    yearsInPractice: str('yearsInPractice'),
    inactivePatients: str('inactivePatients').replace(/\D/g, ''),
    patientValue: str('patientValue').replace(/\D/g, ''),
    consent: formData.get('consent') === 'on',
    services: formData
      .getAll('services')
      .map((s) => String(s).trim())
      .filter(Boolean)
      .slice(0, 30),
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
  if (!v.inactivePatients)
    errors.inactivePatients = 'Enter your inactive patient count.'
  else if (Number(v.inactivePatients) < 1)
    errors.inactivePatients = 'Enter a count of at least 1.'
  if (v.services.length === 0)
    errors.services = 'Select at least one service.'
  if (!v.consent)
    errors.consent =
      'Please check this box so we can contact you about your call.'

  return errors
}
