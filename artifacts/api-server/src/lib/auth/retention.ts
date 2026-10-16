import { pool, type PoolClient } from '@workspace/db'
import { deleteInBatches } from '@/lib/batched-delete'
import { IDLE_INTERVAL_SQL } from './idle-session'

/**
 * Keep retired security state for a day; never touch analytics sessions/activity.
 * Each DELETE evaluates eligibility on the row it locks, not a previously read
 * id list. Postgres rechecks updated rows after a concurrent writer commits.
 * Missing codes/sessions remain invalid; activity never inserts/upserts a row.
 *
 * Runs in batches so a cron call with a time budget stops between batches;
 * `incomplete: true` means the next run has more to delete (deletes are
 * idempotent, so re-running is always safe).
 */
export async function cleanupAuthRecords(
  conn: Pick<PoolClient, 'query'> = pool,
  opts: { deadline?: number } = {},
): Promise<{ challengesDeleted: number; rateLimitsDeleted: number; idleSessionsDeleted: number; rememberedDevicesDeleted: number; incomplete?: boolean }> {
  const state = { incomplete: false }
  const challenges = await deleteInBatches(conn, 'portal_auth_challenges', `expires_at <= statement_timestamp() - interval '1 day'
       OR consumed_at <= statement_timestamp() - interval '1 day'`, opts.deadline, state)
  // Legacy hashed keys don't expose their scope. One hour is the longest
  // pre-retention window; keep at least that long even for a newer short scope.
  const limits = await deleteInBatches(conn, 'portal_auth_limits', `window_start + (GREATEST(COALESCE(window_seconds, 3600), 3600) * interval '1 second')
      <= statement_timestamp() - interval '1 day'`, opts.deadline, state)
  const sessions = await deleteInBatches(conn, 'auth_idle_sessions', `expires_at <= statement_timestamp() - interval '1 day'
       OR revoked_at <= statement_timestamp() - interval '1 day'
       OR last_interaction_at + ${IDLE_INTERVAL_SQL} <= statement_timestamp() - interval '1 day'`, opts.deadline, state)
  const devices = await deleteInBatches(conn, 'portal_auth_devices', `expires_at <= statement_timestamp() - interval '1 day'
       OR revoked_at <= statement_timestamp() - interval '1 day'`, opts.deadline, state)
  return {
    challengesDeleted: challenges,
    rateLimitsDeleted: limits,
    idleSessionsDeleted: sessions,
    rememberedDevicesDeleted: devices,
    ...(state.incomplete ? { incomplete: true } : {}),
  }
}
