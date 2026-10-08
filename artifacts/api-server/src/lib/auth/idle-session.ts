import { pool } from '@workspace/db'

export const IDLE_TIMEOUT_MS = 5 * 60 * 1000
export type SessionKind = 'portal' | 'admin'
export interface IdleState {
  sessionId: string
  deadline: number
  serverNow: number
  inactivityExempt?: boolean
}

/** No upsert: a revoked/expired id must never become live again. */
export async function createIdleSession(id: string, kind: SessionKind, subjectId: string, expiresAt: number, inheritFrom?: string) {
  if (inheritFrom) {
    const result = await pool.query(
      `INSERT INTO auth_idle_sessions (id, kind, subject_id, expires_at, last_interaction_at)
       SELECT $1, $2, $3, LEAST(expires_at, $4), last_interaction_at
       FROM auth_idle_sessions WHERE id = $5 AND kind = $2
       AND revoked_at IS NULL AND expires_at > statement_timestamp()
       AND last_interaction_at > statement_timestamp() - interval '5 minutes'
       RETURNING id`, [id, kind, subjectId, new Date(expiresAt), inheritFrom])
    if (!result.rowCount) throw new Error('Session expired')
    return
  }
  await pool.query(
    `INSERT INTO auth_idle_sessions (id, kind, subject_id, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [id, kind, subjectId, new Date(expiresAt)],
  )
}

/**
 * Authorization is read-only. Only the human-activity endpoint can advance
 * this timestamp. The conditional UPDATE serializes activity against logout;
 * expired rows cannot be revived, including by delayed requests.
 */
export async function readIdleSession(
  id: string, kind: SessionKind, subjectId: string,
  interactionAgeMs?: number,
): Promise<IdleState | null> {
  const condition = `id = $1 AND kind = $2 AND subject_id = $3
    AND revoked_at IS NULL AND expires_at > statement_timestamp()
    AND last_interaction_at > statement_timestamp() - interval '5 minutes'`
  const result = interactionAgeMs === undefined
    ? await pool.query(
      `SELECT id, LEAST(expires_at, last_interaction_at + interval '5 minutes') AS deadline,
       statement_timestamp() AS now FROM auth_idle_sessions WHERE ${condition}`, [id, kind, subjectId])
    : await pool.query(
      `UPDATE auth_idle_sessions
       SET last_interaction_at = GREATEST(last_interaction_at,
         statement_timestamp() - ($4::double precision * interval '1 millisecond'))
       WHERE ${condition}
       RETURNING id, LEAST(expires_at, last_interaction_at + interval '5 minutes') AS deadline,
       statement_timestamp() AS now`, [id, kind, subjectId, interactionAgeMs])
  const row = result.rows[0]
  return row ? { sessionId: row.id, deadline: new Date(row.deadline).getTime(), serverNow: new Date(row.now).getTime() } : null
}

export async function revokeIdleSession(id: string, kind: SessionKind) {
  await pool.query(`UPDATE auth_idle_sessions SET revoked_at = COALESCE(revoked_at, statement_timestamp())
    WHERE id = $1 AND kind = $2`, [id, kind])
}
