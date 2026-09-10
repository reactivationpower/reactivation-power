'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAdminClient } from '@/lib/supabase/admin'
import {
  addGhlContactNote,
  ghlConfigured,
  upsertGhlContact,
} from '@/lib/ghl'
import { readLeadFields, validateLeadFields } from '@/lib/lead-validation'

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
      next: { revalidate: 60 * 60 * 24 * 30 },
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
  } = fields
  const practiceName = String(formData.get('practiceName') ?? '').trim()

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
  }

  // The client runs these same rules before submitting; this is the real gate.
  const fieldErrors = validateLeadFields(fields)
  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors, values, services }
  }

  const phoneDigits = phone.replace(/\D/g, '')

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
        tags: ['reactivation-power-lead', 'healthcare-funnel'],
        source: 'Reactivation Power /healthcare landing page',
      })

      const submissionNote = [
        'HEALTHCARE FUNNEL SUBMISSION — Reactivation Power',
        '',
        `Name: ${firstName} ${lastName}`,
        `Practice: ${practiceName || '(not provided)'}`,
        `Location: ${city && state ? `${city}, ${state} ${zip}` : zip}`,
        '',
        `Years in practice: ${yearsInPractice}`,
        `Estimated inactive patients: ${inactivePatients}`,
        `Services offered: ${services.length > 0 ? services.join(', ') : '(none selected)'}`,
      ].join('\n')

      const consentNote = [
        'CONSENT RECORD',
        '',
        `${firstName} ${lastName} consented to be contacted by text message and phone call for marketing related to Reactivation Power.`,
        '',
        `Submitted: ${new Date().toISOString()}`,
        `IP address: ${ip}`,
        `Page: /healthcare`,
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
  const { error } = await supabase.from('landing_leads').insert({
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
    inactive_patients_estimate: inactivePatients,
    services,
    source_path: '/healthcare',
  })

  if (error) {
    console.error('[v0] landing lead insert failed:', error.message)
    return { error: 'Something went wrong. Please try again.', values, services }
  }

  const params = new URLSearchParams({
    name: firstName,
    inactive: inactivePatients,
  })
  if (services.length > 0) params.set('services', services.join('|'))
  if (ghlContactId) params.set('cid', ghlContactId)
  redirect(`/healthcare/your-opportunity?${params.toString()}`)
}
