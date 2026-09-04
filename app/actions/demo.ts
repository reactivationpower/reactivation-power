'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getAdminClient } from '@/lib/supabase/admin'
import { setSessionCookie, getClientIp } from '@/lib/auth/session'
import { getCurrentParticipant } from '@/lib/data/participants'
import { demoIsStale, seedDemoData } from '@/lib/demo/seed'
import { DEMO_OWNER, demoEmail } from '@/lib/demo/config'

/**
 * Presenter enters the shared demo password at /demo. On success we sign them
 * in AS the demo owner (a real participant row flagged is_demo) and, if the
 * data is from a previous day, regenerate it first so every date is current.
 */
export async function enterDemo(formData: FormData) {
  const password = String(formData.get('password') ?? '')
  const expected = process.env.DEMO_PASSWORD
  if (!expected) return { error: 'Demo is not configured yet.' }
  if (password !== expected) return { error: 'That password isn\u2019t right.' }

  const supabase = getAdminClient()
  let { data: owner } = await supabase
    .from('participants')
    .select('id, demo_seeded_at, is_demo')
    .eq('email', demoEmail(DEMO_OWNER.email))
    .maybeSingle()

  // First run, or a new day: build (or rebuild) the account.
  if (!owner || demoIsStale(owner.demo_seeded_at)) {
    await seedDemoData()
    const r = await supabase
      .from('participants')
      .select('id, demo_seeded_at, is_demo')
      .eq('email', demoEmail(DEMO_OWNER.email))
      .maybeSingle()
    owner = r.data
  }
  if (!owner) return { error: 'Could not prepare the demo account.' }

  await startSessionAs(owner.id)
  redirect('/portal')
}

async function startSessionAs(participantId: string) {
  const supabase = getAdminClient()
  const ip = await getClientIp()
  const h = await headers()
  const { data: session } = await supabase
    .from('sessions')
    .insert({
      participant_id: participantId,
      ip_address: ip,
      user_agent: h.get('user-agent') ?? null,
    })
    .select('id')
    .single()
  if (!session) throw new Error('session insert failed')
  await setSessionCookie({
    participantId,
    sessionId: session.id,
    issuedAt: Date.now(),
  })
}

/** Only demo participants may call the reset/switch actions below. */
async function requireDemoParticipant() {
  const p = await getCurrentParticipant()
  if (!p || !p.is_demo) return null
  return p
}

/** Presenter's "Reset demo data" button. Rebuilds the account from scratch. */
export async function resetDemo() {
  const p = await requireDemoParticipant()
  if (!p) return { error: 'Not in the demo account.' }
  const summary = await seedDemoData()
  // The reset wipes seeded sessions but NOT the presenter's own cookie
  // session (created by startSessionAs and also demo-owned). Re-mint it so
  // the presenter stays signed in.
  const ownerId = p.parent_id ?? p.id
  await startSessionAs(p.role === 'owner' ? ownerId : p.id)
  revalidatePath('/portal', 'layout')
  return { ok: true, summary }
}

/**
 * Switch which demo person the presenter is viewing as (owner or a caller),
 * so they can show the narrower caller experience without a second login.
 */
export async function switchDemoView(targetId: string) {
  const p = await requireDemoParticipant()
  if (!p) return { error: 'Not in the demo account.' }
  const supabase = getAdminClient()
  const { data: target } = await supabase
    .from('participants')
    .select('id, is_demo, is_active')
    .eq('id', targetId)
    .eq('is_demo', true) // may only hop to another demo identity
    .maybeSingle()
  if (!target || !target.is_active) return { error: 'Not a demo identity.' }
  await startSessionAs(target.id)
  revalidatePath('/portal', 'layout')
  redirect('/portal')
}
