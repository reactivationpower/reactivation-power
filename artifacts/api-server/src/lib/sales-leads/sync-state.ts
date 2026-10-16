import { pool } from '@workspace/db'

/** Read-time queue truth also repairs legacy stale labels without replaying writes.
 * A single SQL snapshot prevents older completions from hiding newer work. */
export async function withSyncState<T extends { id: string; ghl_contact_id?: string | null }>(leads: T[]): Promise<Array<T & { sync_state: string; sync_error: string | null }>> {
  if (!leads.length) return []
  const { rows } = await pool.query(`SELECT lead_id,
    bool_or(state='uncertain') AS uncertain,
    bool_or(state='failed') AS failed,
    bool_or(state IN ('pending','sending')) AS pending,
    bool_or(state='done') AS done,
    bool_or(state='pending' AND last_error IS NOT NULL) AS retrying
    FROM sales_jobs WHERE lead_id=ANY($1::text[]) AND kind IN ('contact_sync','note_sync')
    GROUP BY lead_id`, [leads.map(l => l.id)])
  return leads.map(lead => {
    const jobs = rows.find(r => r.lead_id === lead.id)
    const state = jobs?.uncertain ? 'uncertain' : jobs?.failed ? 'failed' : jobs?.pending ? 'pending' :
      jobs?.done || lead.ghl_contact_id ? 'synced' : 'not_synced'
    const error = jobs?.uncertain ? 'Provider acceptance is uncertain. Inspect and reconcile before retrying.' :
      jobs?.failed ? 'Sync failed. Check provider permissions and contact identity, then retry.' :
      jobs?.retrying ? 'Saved locally. Provider unavailable; automatic retry scheduled.' : null
    return { ...lead, sync_state: state, sync_error: error }
  })
}
