import { getAdminClient } from '@/lib/supabase/admin'
import { getCurrentParticipant } from '@/lib/data/participants'
import { demoIsStale, seedDemoData } from '@/lib/demo/seed'
import { DemoBar, type DemoIdentity } from './demo-bar'

/**
 * Renders the demo strip only when the signed-in participant belongs to the
 * demo account. Also the "auto-refresh on a new day" hook: if the presenter
 * lands on any portal page and the data was seeded on a previous Eastern
 * calendar day, rebuild it before rendering so no date ever looks stale.
 */
export async function DemoBarServer() {
  const p = await getCurrentParticipant()
  if (!p || !p.is_demo) return null

  const supabase = getAdminClient()
  const ownerId = p.role === 'owner' ? p.id : (p.parent_id ?? p.id)

  const { data: owner } = await supabase
    .from('participants')
    .select('id, demo_seeded_at')
    .eq('id', ownerId)
    .maybeSingle()

  let seededAt = owner?.demo_seeded_at ?? null
  if (demoIsStale(seededAt)) {
    await seedDemoData()
    seededAt = new Date().toISOString()
  }

  const { data: people } = await supabase
    .from('participants')
    .select('id, first_name, last_name, role')
    .eq('is_demo', true)
    .eq('is_active', true)
    .or(`id.eq.${ownerId},parent_id.eq.${ownerId}`)
    .order('role', { ascending: true }) // owner first
    .order('first_name', { ascending: true })

  const identities: DemoIdentity[] = (people ?? []).map((x) => ({
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
    <DemoBar currentId={p.id} identities={identities} seededLabel={seededLabel} />
  )
}
