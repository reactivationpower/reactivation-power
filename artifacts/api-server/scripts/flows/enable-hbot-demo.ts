// Grant the published HBOT niche to the chiropractic demo without resetting
// its contacts, queues, history, or any real account's entitlements.
import { getSupabase } from './lib.ts'
import { CHIRO_DEMO, demoEmail } from '../../src/lib/demo/config.ts'

const supabase = getSupabase()
const { data: niche, error: nicheError } = await supabase
  .from('niches').select('id').eq('name', 'HBOT').eq('is_active', true).single()
if (nicheError || !niche) throw new Error('The active HBOT niche must be created first.')
const { data: owner, error: ownerError } = await supabase
  .from('participants').select('id').eq('email', demoEmail(CHIRO_DEMO.owner.email))
  .eq('is_demo', true).single()
if (ownerError || !owner) throw new Error('The chiropractic demo owner was not found.')
const { error } = await supabase.from('niche_access').upsert(
  { participant_id: owner.id, niche_id: niche.id },
  { onConflict: 'participant_id,niche_id', ignoreDuplicates: true },
)
if (error) throw error
console.log('HBOT enabled for the chiropractic demo. No demo reset or real-account access changes.')
