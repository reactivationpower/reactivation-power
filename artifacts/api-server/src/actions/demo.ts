
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getAdminClient } from '@/lib/supabase/admin'
import { setSessionCookie, getClientIp } from '@/lib/auth/session'
import { getCurrentParticipant } from '@/lib/data/participants'
import { landingPathFor } from '@workspace/shared/lead-followup'
import { hasLeadFollowUp } from '@/lib/lead-followup/access'
import {
  demoPracticeOfParticipant,
  ensureDemoSeeded,
  getDemoOwnerState,
} from '@/lib/demo/seed'
import { getDemoPractice, isDemoPracticeKey, type DemoPractice } from '@/lib/demo/config'

const DB_UNAVAILABLE =
  'The demo database is not responding right now. Give it a few seconds and try again.'

/**
 * Presenter enters the shared demo password at /demo and picks a practice.
 * On success we sign them in AS that practice's demo owner (a real
 * participant row flagged is_demo). The data is rebuilt first ONLY when it is
 * genuinely from a previous Eastern day or has never been built. A failed
 * database read is reported as such, never treated as "first run", and a
 * rebuild already in progress is waited for, not started a second time.
 */
export async function enterDemo(formData: FormData) {
  const password = String(formData.get('password') ?? '')
  const expected = process.env.DEMO_PASSWORD
  if (!expected) return { error: 'Demo is not configured yet.' }
  if (password !== expected) return { error: 'That password isn\u2019t right.' }

  const practiceKey = formData.get('practice')
  if (!isDemoPracticeKey(practiceKey)) return { error: 'Pick which practice to open.' }
  const practice = getDemoPractice(practiceKey)

  const seeded = await ensureDemoSeeded(practice.key)
  if (seeded.status === 'error') {
    console.error(`[demo] enter ${practice.key}: rebuild check failed:`, seeded.message)
    return { error: DB_UNAVAILABLE }
  }

  let ownerId: string
  try {
    const owner = await getDemoOwnerState(practice)
    if (!owner) return { error: 'Could not prepare the demo account.' }
    ownerId = owner.id
    await startSessionAs(ownerId)
  } catch (err) {
    console.error(`[demo] enter ${practice.key}: sign-in failed:`, err)
    return { error: DB_UNAVAILABLE }
  }
  // Both demo practices carry Lead Follow-Up, so each opens on the two-door chooser.
  redirect(landingPathFor({ reactivation: true, leadFollowUp: await hasLeadFollowUp(ownerId) }))
}

async function startSessionAs(participantId: string, preserveDeadline = false) {
  const supabase = getAdminClient()
  const ip = await getClientIp()
  const h = await headers()
  const { data: session, error } = await supabase
    .from('sessions')
    .insert({
      participant_id: participantId,
      ip_address: ip,
      user_agent: h.get('user-agent') ?? null,
    })
    .select('id')
    .single()
  if (error || !session) {
    throw new Error(`session insert failed: ${error?.message ?? 'no row'}`)
  }
  await setSessionCookie({
    participantId,
    sessionId: session.id,
    issuedAt: Date.now(),
  }, preserveDeadline)
}

type DemoParticipant = {
  id: string
  parent_id: string | null
  role: string
  email: string
}

/**
 * Only demo participants may call the reset/switch actions below, and each
 * acts on the ONE practice the presenter is currently inside.
 */
async function requireDemoParticipant(): Promise<
  { p: DemoParticipant; practice: DemoPractice } | null
> {
  const p = await getCurrentParticipant()
  if (!p || !p.is_demo) return null
  const practice = await demoPracticeOfParticipant(p)
  if (!practice) return null
  return { p, practice }
}

/**
 * A rebuild wipes every session of that practice's family, including the
 * presenter's own cookie session, so after one finishes the presenter is
 * signed back in as whoever they were viewing as.
 */
async function reSignIn(p: DemoParticipant) {
  const ownerId = p.parent_id ?? p.id
  await startSessionAs(p.role === 'owner' ? ownerId : p.id, true)
  revalidatePath('/portal', 'layout')
}

/** Presenter's "Reset demo data" button. Rebuilds the current practice from scratch. */
export async function resetDemo() {
  const ctx = await requireDemoParticipant()
  if (!ctx) return { error: 'Not in the demo account.' }
  const { p, practice } = ctx

  const result = await ensureDemoSeeded(practice.key, { force: true })
  if (result.status === 'error') {
    console.error(`[demo] reset ${practice.key} failed:`, result.message)
    return { error: `Reset did not finish. ${result.message}` }
  }
  try {
    await reSignIn(p)
  } catch (err) {
    console.error(`[demo] reset ${practice.key}: re-sign-in failed:`, err)
    return { error: 'Data was rebuilt but signing you back in failed. Open /demo again.' }
  }
  return {
    ok: true,
    summary: result.status === 'seeded' ? result.summary : undefined,
  }
}

/**
 * Called by the demo bar when a portal page rendered with data from a
 * previous Eastern day (a tab left open overnight). Page rendering itself
 * never rebuilds; this is the one client-initiated path, and it goes through
 * the same per-practice lock as everything else.
 */
export async function refreshDemoIfStale() {
  const ctx = await requireDemoParticipant()
  if (!ctx) return { error: 'Not in the demo account.' }
  const { p, practice } = ctx

  const result = await ensureDemoSeeded(practice.key)
  if (result.status === 'error') {
    console.error(`[demo] refresh ${practice.key} failed:`, result.message)
    return { error: DB_UNAVAILABLE }
  }
  const rebuilt = result.status !== 'fresh'
  if (rebuilt) {
    try {
      await reSignIn(p)
    } catch (err) {
      console.error(`[demo] refresh ${practice.key}: re-sign-in failed:`, err)
      return { error: 'Data was refreshed but signing you back in failed. Open /demo again.' }
    }
  }
  return { ok: true, rebuilt }
}

/**
 * Switch which demo person the presenter is viewing as (owner or a caller),
 * so they can show the narrower caller experience without a second login.
 * Only identities of the SAME practice are reachable; hopping into the other
 * demo goes through /demo.
 */
export async function switchDemoView(targetId: string) {
  const ctx = await requireDemoParticipant()
  if (!ctx) return { error: 'Not in the demo account.' }
  const ownerId = ctx.p.parent_id ?? ctx.p.id
  const supabase = getAdminClient()
  const { data: target } = await supabase
    .from('participants')
    .select('id, is_demo, is_active')
    .eq('id', targetId)
    .eq('is_demo', true) // may only hop to another demo identity
    .or(`id.eq.${ownerId},parent_id.eq.${ownerId}`) // ...of this practice
    .maybeSingle()
  if (!target || !target.is_active) return { error: 'Not a demo identity.' }
  await startSessionAs(target.id, true)
  revalidatePath('/portal', 'layout')
  redirect('/portal')
}
