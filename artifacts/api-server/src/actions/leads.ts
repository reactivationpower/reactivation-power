import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAdminClient } from '@/lib/supabase/admin'
import { referralFromRequest, resolveQualifiedReferral } from '@/lib/affiliates/attribution'
import { isProductInterest, PRODUCT_INTEREST_LABELS, readLeadFields, validateLeadFields, validatedCalculatorScenario } from '@workspace/shared/lead-validation'
import { validatedBookingFunnel } from '@workspace/shared/booking-funnel'
import {
  parseInactiveCount,
  parsePatientValue,
  reactivatedPatients,
  scenarioEstimates,
} from '@workspace/shared/opportunity'
import { intake } from '@/lib/sales-leads/store'
import { validTimezone } from '@/lib/sales-leads/cadence'
import { requestVisitorId, leadOutcome } from '@/lib/marketing/outcomes'
import { newBookingHandoff } from '@/lib/booking-handoff'
import { randomUUID } from 'node:crypto'
import { currentTerms, termsRequestEvidence, TermsAcceptanceError } from '@/lib/lead-terms/store'
import { termsAcceptanceError, type CurrentLeadTerms } from '@workspace/shared/lead-terms'

export interface LeadState {
  error?: string
  /** Per-field validation errors keyed by input name */
  fieldErrors?: Record<string, string>
  /** Submitted values echoed back so the form doesn't reset */
  values?: Record<string, string>
  /** Services echoed back (multi-value) */
  services?: string[]
  terms?: CurrentLeadTerms
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
  const funnelSource = scheduleSource ? validatedBookingFunnel(formData.get('funnelSource')) : undefined
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
  const marketingTerms = {
    version: String(formData.get('termsVersion') ?? '').slice(0, 100),
    checked: formData.get('termsAccepted') === 'on',
    ...termsRequestEvidence(),
    identity: { firstName: firstNameRaw, lastName: lastNameRaw, email, phone, practiceName },
  }
  // Cheap early gate avoids the earlier legacy landing-row write on normal
  // validation errors. Intake repeats this check under the publishing lock.
  try {
    const terms = await currentTerms()
    const error = termsAcceptanceError(terms, marketingTerms.version, marketingTerms.checked)
    if (error) return { terms, fieldErrors: { termsAccepted: error }, values, services }
  } catch {
    return { error: 'Terms of Service could not be loaded. Your entries are saved; please try again.', values, services }
  }
  const suppliedSubmissionId = String(formData.get('marketingSubmissionId') ?? '')
  const submissionKey = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(suppliedSubmissionId) ? suppliedSubmissionId : randomUUID()
  const scenario = validatedCalculatorScenario(fields)
  const estimates = scenario ? scenarioEstimates(scenario) : null
  const sourceParams = new URLSearchParams(baseSourcePath.split('?')[1] ?? '')
  if (funnelSource) sourceParams.set('funnelSource', funnelSource)
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

  // Save both the full-context submission and legacy funnel row before any
  // GoHighLevel write. Provider availability must never be the intake gate.
  const submittedAt = new Date().toISOString()
  const actualPathRaw = String(formData.get('actualSourcePath') ?? '')
  const actualPath = /^\/[a-zA-Z0-9/_-]*$/.test(actualPathRaw) ? actualPathRaw.slice(0, 200) : baseSourcePath.split('?')[0]!
  let utm: Record<string, string> = {}
  try {
    const parsed = JSON.parse(String(formData.get('utmContext') ?? '{}'))
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']) if (typeof parsed[key] === 'string') utm[key] = parsed[key].slice(0, 300)
  } catch { /* no UTM evidence supplied */ }
  const zone = formData.get('deviceTimezone')
  const timezone = validTimezone(zone) ? zone : null
  const carried: Record<string, string> = { name: firstName }
  if (funnelSource) carried.funnelSource = funnelSource
  if (hasReactivation && inactiveCount !== null) {
    carried.inactive = String(inactiveCount)
    carried.value = String(patientValue)
  }
  if (scenario) {
    carried.newMonthly = String(scenario.additionalPatientsPerMonth)
    carried.newValue = String(scenario.newPatientValue)
  }
  if (scheduleSource || productInterest) carried.interest = interest
  if (services.length) carried.services = services.join('|')
  // Generate before any save; persist atomically inside intake's submission.
  const handoff = newBookingHandoff(carried)
  const supabase = getAdminClient()
  const { error, data: submittedLead } = await supabase.from('landing_leads').insert({
    sector: 'healthcare', first_name: firstName, last_name: lastName, email,
    phone: `(${phoneDigits.slice(0, 3)}) ${phoneDigits.slice(3, 6)}-${phoneDigits.slice(6)}`,
    practice_name: practiceName, zip, city, state, consent, consent_ip: ip,
    years_in_practice: yearsInPractice, inactive_patients_estimate: inactiveCount === null ? '' : String(inactiveCount),
    services, source_path: sourcePath,
  }).select('id').single()
  if (error) return { error: 'Something went wrong. Please try again.', values, services }
  let salesLead: Awaited<ReturnType<typeof intake>>
  try {
  const attribution = await resolveQualifiedReferral({
    email, phone: phoneDigits, practiceName, affiliateId: await referralFromRequest(email),
    sourceLeadId: String(submittedLead.id),
  })
  salesLead = await intake({
    noteBody: [
      `Interested in: ${PRODUCT_INTEREST_LABELS[interest]}`,
      `Name: ${firstName} ${lastName}\nPractice: ${practiceName}\nLocation: ${city}, ${state} ${zip}`,
      `Years in practice: ${yearsInPractice}\nServices: ${services.join(', ')}`,
      `Inactive patient files: ${inactiveCount ?? 'not provided'}${inactiveNote}`,
      `Annual patient value used: ${money(patientValue)}${valueNote}`,
      ...(revenueShown !== null ? [`${scenario ? 'Reactivation estimate shown to lead' : 'Revenue estimate shown to lead'}: ${money(revenueShown)} (illustrative, not guaranteed)`] : []),
      ...(scenario && estimates ? [
        `Additional new patients per month: ${scenario.additionalPatientsPerMonth}`,
        `New patient first-year value used: ${money(scenario.newPatientValue)}`,
        `New patient first-year cohort value estimate: ${money(estimates.newPatients)}`,
        `Combined illustrative opportunity: ${money(estimates.combined)} (12 months; illustrative, not guaranteed)`,
      ] : []),
    ].join('\n'),
    firstName, lastName, email, phone: `+1${phoneDigits}`, practiceName,
    source: attribution.affiliateId ? 'affiliate' : 'website', sourcePath: actualPath, submittedAt,
    consent, timezone, affiliateId: attribution.affiliateId, dedupeKey: `marketing:${submissionKey}:${marketingTerms.version || 'inactive'}`,
    marketingTerms,
    consentEvidence: {
      checked: consent, submittedAt, sourcePath: actualPath, ip,
      disclosure: 'I consent to being contacted by text message and phone call for marketing related to Patient Pipeline. Message and data rates may apply. Reply STOP to opt out at any time.',
      disclosureVersion: 'patient-pipeline-sms-v1',
    },
    context: {
      bookingHandoff: { ...handoff.context, ref: handoff.ref },
      marketingVisitorId: await requestVisitorId(),
      firstName, lastName, email, phone, practiceName, zip, city, state, yearsInPractice, services, productInterest: interest,
      inactivePatients: inactiveCount, patientValue, revenueShown, scenario, estimates,
      inactiveAdjusted: formData.get('inactiveAdjusted'), valueAdjusted: valueAdjusted ?? 'assumed',
      additionalPatientsAdjusted: formData.get('additionalPatientsAdjusted'), newValueAdjusted: formData.get('newValueAdjusted'),
      utm, affiliateId: attribution.affiliateId, deviceTimezone: timezone, legacySourcePath: sourcePath,
    },
  })
  } catch (err) {
    // The legacy row is not acceptance evidence. It precedes canonical intake;
    // on a failed intake remove only this invocation's legacy row, best effort.
    await supabase.from('landing_leads').delete().eq('id', submittedLead.id).then(() => {}, () => {})
    if (err instanceof TermsAcceptanceError) return { terms: err.terms, fieldErrors: { termsAccepted: err.message }, values, services }
    return { error: 'We could not save your request. Your entries are saved; please try again.', values, services }
  }

  // Intake committed contact and stable-marker note jobs together. Do not
  // duplicate those writes or delay the saved booking handoff on provider I/O.
  if (!salesLead.review) await leadOutcome(salesLead.id, String(submittedLead.id))

  // Straight to the calendar; the calculator now lives on the thank-you page
  redirect(`/healthcare/book-a-call?bookingRef=${salesLead.bookingRef ?? handoff.ref}`)
}
