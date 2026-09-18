// @ts-nocheck
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

export function getAdminClient(): SupabaseClient {
  if (!client) {
    client = createClient(
      'https://mock.supabase.co',
      'mock-key',
      { auth: { persistSession: false, autoRefreshToken: false } },
    )
  }
  return client
}
