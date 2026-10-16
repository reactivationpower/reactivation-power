import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

/**
 * Service-role Supabase client. Server-only.
 * We do not use Supabase Auth yet — all access control is enforced
 * in server actions / route handlers via our own session cookie.
 */
export function getAdminClient(): SupabaseClient {
  if (!client) {
    client = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    )
  }
  return client
}
