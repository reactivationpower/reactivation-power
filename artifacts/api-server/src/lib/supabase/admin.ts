
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

/**
 * Service-role Supabase client. Server-only.
 * We do not use Supabase Auth yet — all access control is enforced
 * in server actions / route handlers via our own session cookie.
 */
export function getAdminClient(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
    }
    client = createClient(
      url,
      key,
      { auth: { persistSession: false, autoRefreshToken: false } },
    )
  }
  return client
}
