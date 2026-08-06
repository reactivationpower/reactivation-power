'use server'

import { redirect } from 'next/navigation'
import { getAdminClient } from '@/lib/supabase/admin'

export interface LeadState {
  error?: string
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function submitHealthcareLead(
  _prev: LeadState,
  formData: FormData,
): Promise<LeadState> {
  const firstName = String(formData.get('firstName') ?? '').trim()
  const lastName = String(formData.get('lastName') ?? '').trim()
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase()
  const phone = String(formData.get('phone') ?? '').trim()
  const practiceName = String(formData.get('practiceName') ?? '').trim()
  const yearsInPractice = String(formData.get('yearsInPractice') ?? '').trim()
  const inactivePatients = String(formData.get('inactivePatients') ?? '').trim()
  const services = formData
    .getAll('services')
    .map((s) => String(s).trim())
    .filter(Boolean)
    .slice(0, 30)

  if (
    !firstName ||
    !lastName ||
    !email ||
    !phone ||
    !yearsInPractice ||
    !inactivePatients
  ) {
    return { error: 'Please fill in all required fields.' }
  }
  if (!EMAIL_RE.test(email)) {
    return { error: 'Please enter a valid email address.' }
  }
  if (phone.replace(/\D/g, '').length < 10) {
    return { error: 'Please enter a valid phone number.' }
  }

  const supabase = getAdminClient()
  const { error } = await supabase.from('landing_leads').insert({
    sector: 'healthcare',
    first_name: firstName,
    last_name: lastName,
    email,
    phone,
    practice_name: practiceName,
    years_in_practice: yearsInPractice,
    inactive_patients_estimate: inactivePatients,
    services,
    source_path: '/healthcare',
  })

  if (error) {
    console.error('[v0] landing lead insert failed:', error.message)
    return { error: 'Something went wrong. Please try again.' }
  }

  const params = new URLSearchParams({
    name: firstName,
    inactive: inactivePatients,
  })
  if (services.length > 0) params.set('services', services.join('|'))
  redirect(`/healthcare/your-opportunity?${params.toString()}`)
}
