import { sql } from 'drizzle-orm'
import { db } from '@workspace/db'
import type { AdminSession } from './auth/admin-session'

/** Re-read current ownership for EVERY operation, including claims and counts.
 * A customer creator or assigned offer rep has customer access; never snapshot
 * recipients into an event, since reassignment/deactivation must take effect.
 */
export function notificationScope(admin: Pick<AdminSession, 'role' | 'userId'>, customerAlias = 'c') {
  const customer = sql.identifier(customerAlias)
  return admin.role === 'super_admin' ? sql`true` : sql`(
    ${customer}.created_by_id = ${admin.userId} OR EXISTS (
      SELECT 1 FROM payment_link_terms owned WHERE owned.customer_id = ${customer}.id AND owned.rep_id = ${admin.userId}
    ))`
}

export async function canAccessNotificationAgreement(admin: Pick<AdminSession, 'role' | 'userId'>, agreementId: string) {
  const result = await db.execute(sql`SELECT a.id FROM agreements a
    JOIN customers c ON c.id = a.customer_id
    WHERE a.id = ${agreementId} AND ${notificationScope(admin)} LIMIT 1`)
  return result.rows.length > 0
}

/** Durable source projection, NOT a billing side effect. Serialized insert/commit
 * means a cursor never skips an earlier allocated but uncommitted event ID.
 * Missing projection can be retried without touching Stripe or sending mail.
 * The rollout singleton excludes all historical milestones.
 */
export async function recoverEnrollmentNotifications() {
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('enrollment-notification-projection'))`)
    await tx.execute(sql`
      INSERT INTO enrollment_notifications (agreement_id, milestone, occurred_at)
      SELECT a.id, milestone.kind, milestone.at
      FROM agreements a
      JOIN payment_link_terms t ON t.link_id = a.link_id AND t.enrollment_flow = true
      CROSS JOIN enrollment_notification_rollout rollout
      CROSS JOIN LATERAL (VALUES
        ('opened', a.display_acknowledged_at),
        ('signed', CASE WHEN a.signed_version = a.current_version AND a.signature_data IS NOT NULL THEN a.signed_at END),
        ('primary_card', a.primary_card_saved_at),
        ('backup_card', CASE WHEN t.type = 'subscription' THEN a.backup_card_saved_at END),
        ('completed', CASE WHEN t.completed_at IS NOT NULL AND a.status = 'completed' AND a.signed_at IS NOT NULL
          THEN a.completed_at END)
      ) milestone(kind, at)
      WHERE rollout.id = 'enrollment' AND milestone.at >= rollout.since
        AND NOT EXISTS (SELECT 1 FROM enrollment_notifications n WHERE n.agreement_id = a.id AND n.milestone = milestone.kind)
      ORDER BY milestone.at, a.id, milestone.kind
      LIMIT 500
      ON CONFLICT (agreement_id, milestone) DO NOTHING
    `)
  })
}
