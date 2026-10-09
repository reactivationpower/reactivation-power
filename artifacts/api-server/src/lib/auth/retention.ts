import { pool, type PoolClient } from '@workspace/db'

/**
 * Keep retired security state for a day; never touch analytics sessions/activity.
 * Each DELETE evaluates eligibility on the row it locks, not a previously read
 * id list. Postgres rechecks updated rows after a concurrent writer commits.
 * Missing codes/sessions remain invalid; activity never inserts/upserts a row.
 */
export async function cleanupAuthRecords(conn: Pick<PoolClient, 'query'> = pool): Promise<Record<string, number>> {
  const challenges = await conn.query(`DELETE FROM portal_auth_challenges
    WHERE expires_at <= statement_timestamp() - interval '1 day'
       OR consumed_at <= statement_timestamp() - interval '1 day'`)
  // Legacy hashed keys don't expose their scope. One hour is the longest
  // pre-retention window; keep at least that long even for a newer short scope.
  const limits = await conn.query(`DELETE FROM portal_auth_limits
    WHERE window_start + (GREATEST(COALESCE(window_seconds, 3600), 3600) * interval '1 second')
      <= statement_timestamp() - interval '1 day'`)
  const sessions = await conn.query(`DELETE FROM auth_idle_sessions
    WHERE expires_at <= statement_timestamp() - interval '1 day'
       OR revoked_at <= statement_timestamp() - interval '1 day'
       OR last_interaction_at + interval '5 minutes' <= statement_timestamp() - interval '1 day'`)
  return {
    challengesDeleted: challenges.rowCount ?? 0,
    rateLimitsDeleted: limits.rowCount ?? 0,
    idleSessionsDeleted: sessions.rowCount ?? 0,
  }
}
