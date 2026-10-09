
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAdminClient } from '@/lib/supabase/admin'
import { referralFromRequest, resolveQualifiedReferral } from '@/lib/affiliates/attribution'
import {
  addGhlContactNote,
  ghlConfigured,
  upsertGhlContact,
} from '@/lib/ghl'
import { isProductInterest, PRODUCT_INTEREST_LABELS, readLeadFields, validateLeadFields, validatedCalculatorScenario } from '@workspace/shared/lead-validation'
import {
  parseInactiveCount,
  parsePatientValue,
  reactivatedPatients,
  scenarioEstimates,
} from '@workspace/shared/opportunity'

export interface LeadState {
  error?: string
  /** Per-field validation errors keyed by input name */
  fieldErrors?: Record<string, string>
  /** Submitted values echoed back so the form doesn't reset */
  values?: Record<string, string>
  /** Services echoed back (multi-value) */
  services?: string[]
}

/** Look up city/state for a US zip code (server-side, no API key). */
export async function lookupZip(
  zip: string,
): Promise<{ city: string; state: string } | null> {
  const clean = zip.replace(/\D/g, '').slice(0, 5)
  if (clean.length !== 5) return null
  try {
    const res = await fetch(`https://api.zippopotam.us/us/${clean}`, {
      // Zip->city mappings are static; cache aggressively
      // (Next fetch cache option removed)
    })
    if (!res.ok) return null
    const json = (await res.json()) as {
      places?: { 'place name'?: string; 'state abbreviation'?: string }[]
    }
    const place = json?.places?.[0]
    if (!place) return null
    return {
      city: place['place name'] ?? '',
      state: place['state abbreviation'] ?? '',
    }
  } catch {
    return null
  }
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s\-'])[a-z]/g, (m) => m.toUpperCase())
}

export async function submitHealthcareLead(
  _prev: LeadState,
  formData: FormData,
): Promise<LeadState> {
  const fields = readLeadFields(formData)
  const {
    firstName: firstNameRaw,
    lastName: lastNameRaw,
    email,
    phone,
    zip,
    yearsInPractice,
    inactivePatients,
    consent,
    services,
    productInterest,
  } = fields
  const practiceName = String(formData.get('practiceName') ?? '').trim()
  const scheduleSource = formData.get('leadSource') === 'schedule-a-call'
  const interest = productInterest && isProductInterest(productInterest) ? productInterest : 'reactivation'
  const hasReactivation = interest !== 'lead-follow-up'
  // source_path already stores landing attribution; use its query to retain
  // interest without requiring a new column in the existing Supabase table.
  const baseSourcePath = scheduleSource
    ? `/schedule-a-call?interest=${interest}`
    : productInterest ? `/healthcare?interest=${interest}` : '/healthcare'

  const values: Record<string, string> = {
    firstName: firstNameRaw,
    lastName: lastNameRaw,
    email,
    phone,
    practiceName,
    zip,
    yearsInPractice,
    inactivePatients,
    consent: consent ? 'on' : '',
    productInterest: productInterest ?? '',
    patientValue: fields.patientValue,
    additionalPatientsPerMonth: fields.additionalPatientsPerMonth,
    newPatientValue: fields.newPatientValue,
  }

  // The client runs these same rules before submitting; this is the real gate.
  const fieldErrors = validateLeadFields(fields)
  if (scheduleSource && !productInterest)
    fieldErrors.productInterest = 'Select how we can help your practice.'
  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, values, services }
  }
  const scenario = validatedCalculatorScenario(fields)
  const estimates = scenario ? scenarioEstimates(scenario) : null
  const sourceParams = new URLSearchParams(baseSourcePath.split('?')[1] ?? '')
  if (scenario) {
    sourceParams.set('inactive', String(scenario.inactivePatients))
    sourceParams.set('value', String(scenario.patientValue))
    sourceParams.set('newMonthly', String(scenario.additionalPatientsPerMonth))
    sourceParams.set('newValue', String(scenario.newPatientValue))
    sourceParams.set('reactivationEstimate', String(estimates!.reactivation))
    sourceParams.set('newPatientEstimate', String(estimates!.newPatients))
    sourceParams.set('combinedEstimate', String(estimates!.combined))
  }
  const sourcePath = `${baseSourcePath.split('?')[0]}${sourceParams.size ? `?${sourceParams}` : ''}`

  const phoneDigits = phone.replace(/\D/g, '')

  // The figures the lead saw on the calculator, carried to the thank-you page
  // and the CRM note so the salesperson sees the same number the lead did
  const inactiveCount = inactivePatients ? parseInactiveCount(inactivePatients) : null
  const patientValue = scenario?.patientValue ?? parsePatientValue(fields.patientValue)
  const revenueShown = hasReactivation && inactiveCount !== null
    ? estimates?.reactivation ?? reactivatedPatients(inactiveCount) * patientValue
    : null
  const money = (n: number) => '$' + n.toLocaleString('en-US')

  // An untouched slider default looks identical to a real answer in the CRM,
  // so tell the salesperson which it was. The flags are absent on pages
  // without a calculator, where the count is typed and the value is assumed.
  const UNTOUCHED = ' (default — visitor did not adjust)'
  const inactiveNote =
    formData.get('inactiveAdjusted') === 'no' ? UNTOUCHED : ''
  const valueAdjusted = formData.get('valueAdjusted')
  const valueNote =
    valueAdjusted === 'no'
      ? UNTOUCHED
      : valueAdjusted === null
        ? ' (assumed — no calculator on that page)'
        : ''

  const firstName = titleCase(firstNameRaw)
  const lastName = titleCase(lastNameRaw)

  // City/state from zip so the lead never types them
  const zipPlace = await lookupZip(zip)
  const city = zipPlace?.city ?? ''
  const state = zipPlace?.state ?? ''

  const h = await headers()
  const ip =
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    h.get('x-real-ip') ??
    'unknown'

  // Create/update the GoHighLevel contact first so the funnel carries its id
  let ghlContactId = ''
  if (ghlConfigured()) {
    try {
      ghlContactId = await upsertGhlContact({
        firstName,
        lastName,
        email,
        phone: `+1${phoneDigits}`,
        companyName: practiceName || undefined,
        postalCode: zip,
        city: city || undefined,
        state: state || undefined,
        tags: [
          'reactivation-power-lead',
          'healthcare-funnel',
          ...(scheduleSource ? [`interest-${interest}`] : []),
        ],
        source: `Reactivation Power ${scheduleSource ? '/schedule-a-call' : '/healthcare'} landing page`,
      })

      const submissionNote = [
        `${scheduleSource ? 'SCHEDULE A CALL' : 'HEALTHCARE FUNNEL'} SUBMISSION — Reactivation Power`,
        '',
        `Name: ${firstName} ${lastName}`,
        `Practice: ${practiceName || '(not provided)'}`,
        `Location: ${city && state ? `${city}, ${state} ${zip}` : zip}`,
        '',
        `Years in practice: ${yearsInPractice}`,
        `Interested in: ${PRODUCT_INTEREST_LABELS[interest]}`,
        ...(inactiveCount !== null ? [
          `Inactive patient files: ${inactiveCount.toLocaleString('en-US')}${inactiveNote}`,
        ] : ['Inactive patient files: (not provided)']),
        ...(revenueShown !== null ? [
          `Annual patient value used: ${money(patientValue)}${valueNote}`,
          `${scenario ? 'Reactivation estimate shown to lead' : 'Revenue estimate shown to lead'}: ${money(revenueShown)} (illustrative, not guaranteed)`,
        ] : ['Revenue estimate: not applicable to lead-only inquiry']),
        ...(scenario && estimates ? [
          `Additional new patients per month: ${scenario.additionalPatientsPerMonth}`,
          `New patient first-year value used: ${money(scenario.newPatientValue)}`,
          `New patient first-year cohort value estimate: ${money(estimates.newPatients)} (12 months of additional new patients; illustrative, not guaranteed)`,
          `Combined illustrative opportunity: ${money(estimates.combined)} (reactivation + new patient first-year cohort value; not annual cash or guaranteed revenue)`,
        ] : []),
        `Services offered: ${services.length > 0 ? services.join(', ') : '(none selected)'}`,
      ].join('\n')

      const consentNote = [
        'CONSENT RECORD',
        '',
        `${firstName} ${lastName} consented to be contacted by text message and phone call for marketing related to Reactivation Power.`,
        '',
        `Submitted: ${new Date().toISOString()}`,
        `IP address: ${ip}`,
        `Page: ${scheduleSource ? '/schedule-a-call' : '/healthcare'}`,
      ].join('\n')

      await Promise.all([
        addGhlContactNote(ghlContactId, submissionNote),
        addGhlContactNote(ghlContactId, consentNote),
      ])
    } catch (err) {
      // Never lose the lead because CRM sync failed — log and continue
      console.error('[v0] GHL contact sync failed:', err)
    }
  }

  const supabase = getAdminClient()
  const { error, data: submittedLead } = await supabase.from('landing_leads').insert({
    sector: 'healthcare',
    first_name: firstName,
    last_name: lastName,
    email,
    phone: `(${phoneDigits.slice(0, 3)}) ${phoneDigits.slice(3, 6)}-${phoneDigits.slice(6)}`,
    practice_name: practiceName,
    zip,
    city,
    state,
    consent,
    consent_ip: ip,
    ghl_contact_id: ghlContactId || null,
    years_in_practice: yearsInPractice,
    inactive_patients_estimate: inactiveCount === null ? '' : String(inactiveCount),
    services,
    source_path: sourcePath,
  }).select('id').single()

  if (error) {
    console.error('[v0] landing lead insert failed:', error.message)
    return { error: 'Something went wrong. Please try again.', values, services }
  }

  await resolveQualifiedReferral({
    email, phone: phoneDigits, practiceName,
    affiliateId: await referralFromRequest(email),
    sourceLeadId: submittedLead?.id ? String(submittedLead.id) : undefined,
  })

  const params = new URLSearchParams({
    name: firstName,
  })
  if (hasReactivation && inactiveCount !== null) {
    params.set('inactive', String(inactiveCount))
    params.set('value', String(patientValue))
  }
  if (scenario) {
    params.set('newMonthly', String(scenario.additionalPatientsPerMonth))
    params.set('newValue', String(scenario.newPatientValue))
  }
  if (scheduleSource || productInterest) params.set('interest', interest)
  if (services.length > 0) params.set('services', services.join('|'))
  if (ghlContactId) params.set('cid', ghlContactId)
  // Straight to the calendar; the calculator now lives on the thank-you page
  redirect(`/healthcare/book-a-call?${params.toString()}`)
}
