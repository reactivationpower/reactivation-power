import { pool } from '@workspace/db'
import { DEMO_PRACTICES, demoEmail } from '../demo/config'
import type { SessionPayload } from './token'
import { SESSION_MAX_AGE } from './token'
import type { IdleState } from './idle-session'

const ownerEmails = DEMO_PRACTICES.map(p => demoEmail(p.owner.email))
const demoFamily = `FROM participants p
  JOIN participants owner ON owner.id = COALESCE(p.parent_id, p.id)
  WHERE p.id = $1 AND p.is_demo = true AND p.is_active = true
    AND owner.is_demo = true AND owner.is_active = true
    AND owner.role = 'owner' AND lower(owner.email) = ANY($2::text[])`

/** Only the two configured sales-demo families, never a client-supplied flag. */
export async function isDemoSessionParticipant(participantId: string): Promise<boolean> {
  const result = await pool.query(`SELECT 1 ${demoFamily}`, [participantId, ownerEmails])
  return result.rowCount === 1
}

/**
 * Preserve the original demo cookie lifetime, including cookies issued before
 * idle tracking existed. New tracked cookies still honor explicit revocation.
 */
export async function readDemoSession(payload: SessionPayload): Promise<IdleState | null> {
  const result = await pool.query(`SELECT
    LEAST(COALESCE(s.expires_at, $4::timestamptz), $4::timestamptz) AS deadline,
    statement_timestamp() AS now
    FROM participants p
    JOIN participants owner ON owner.id = COALESCE(p.parent_id, p.id)
    LEFT JOIN auth_idle_sessions s ON s.id = $3 AND s.kind = 'portal'
    WHERE p.id = $1 AND p.is_demo = true AND p.is_active = true
      AND owner.is_demo = true AND owner.is_active = true
      AND owner.role = 'owner' AND lower(owner.email) = ANY($2::text[])
      AND $4::timestamptz > statement_timestamp()
      AND (s.id IS NULL OR (s.subject_id = p.id::text AND s.revoked_at IS NULL
        AND s.expires_at > statement_timestamp()))`,
    [payload.participantId, ownerEmails, payload.sessionId,
      new Date(payload.issuedAt + SESSION_MAX_AGE * 1000)])
  const row = result.rows[0]
  return row ? {
    sessionId: payload.sessionId, deadline: new Date(row.deadline).getTime(),
    serverNow: new Date(row.now).getTime(), inactivityExempt: true,
  } : null
}
