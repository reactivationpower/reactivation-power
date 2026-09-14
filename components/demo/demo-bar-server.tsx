import { getAdminClient } from '@/lib/supabase/admin'
import { getCurrentParticipant } from '@/lib/data/participants'
import { demoIsStale } from '@/lib/demo/seed'
import { DemoBar, type DemoIdentity } from './demo-bar'

/**
 * Renders the demo strip only when the signed-in participant belongs to the
 * demo account.
 *
 * Rendering is READ-ONLY. If the data was seeded on a previous Eastern day
 * (a tab left open overnight) we tell the client bar, which asks for a
 * rebuild through the locked `refreshDemoIfStale` action. A failed lookup is
 * deliberately NOT treated as stale: an API blip that made this component
 * rebuild inline on every page render once produced four overlapping rebuilds.
 */
export async function DemoBarServer() {
  const p = await getCurrentParticipant()
  if (!p || !p.is_demo) return null

  const supabase = getAdminClient()
  const ownerId = p.role === 'owner' ? p.id : (p.parent_id ?? p.id)

  const [ownerRes, peopleRes] = await Promise.all([
    supabase
      .from('participants')
      .select('id, demo_seeded_at')
      .eq('id', ownerId)
      .maybeSingle(),
    supabase
      .from('participants')
      .select('id, first_name, last_name, role')
      .eq('is_demo', true)
      .eq('is_active', true)
      .or(`id.eq.${ownerId},parent_id.eq.${ownerId}`)
      .order('role', { ascending: true }) // owner first
      .order('first_name', { ascending: true }),
  ])

  const seededAt = ownerRes.data?.demo_seeded_at ?? null
  const stale = !ownerRes.error && demoIsStale(seededAt)

  const identities: DemoIdentity[] = (peopleRes.data ?? []).map((x) => ({
    id: x.id,
    label: `${x.first_name} ${x.last_name}`,
    role: x.role === 'owner' ? 'owner' : 'staff',
  }))

  const seededLabel = seededAt
    ? `Data refreshed ${new Date(seededAt).toLocaleString('en-US', {
        timeZone: 'America/New_York',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })} ET`
    : ''

  return (
    <DemoBar
      currentId={p.id}
      identities={identities}
      seededLabel={seededLabel}
      stale={stale}
    />
  )
}
