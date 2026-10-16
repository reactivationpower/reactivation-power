import { sql } from 'drizzle-orm'
import { db } from '@workspace/db'
import { requireAdmin } from '@/lib/auth/admin-session'
import { notificationScope, recoverEnrollmentNotifications } from '@/lib/enrollment-notifications'

function cursor(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{1,19}$/.test(value) || BigInt(value) > 9223372036854775807n) throw new Error('Invalid notification cursor')
  return value
}
const joins = sql`FROM enrollment_notifications n
  JOIN agreements a ON a.id = n.agreement_id
  JOIN customers c ON c.id = a.customer_id
  JOIN payment_link_terms t ON t.link_id = a.link_id AND t.enrollment_flow = true`

type Row = { id: string; agreement_id: string; full_name: string; business_name: string; milestone: string; occurred_at: Date; read: boolean }
function item(row: Row) {
  return { id: String(row.id), agreementId: row.agreement_id, customerName: row.full_name,
    practiceName: row.business_name, milestone: row.milestone, occurredAt: new Date(row.occurred_at).toISOString(),
    read: row.read, href: `/admin/agreements/${encodeURIComponent(row.agreement_id)}` }
}

export async function listNotifications(input: { after?: string; before?: string } = {}) {
  const admin = await requireAdmin()
  if (!input || typeof input !== 'object') throw new Error('Invalid notification request')
  const after = input.after === undefined ? undefined : cursor(input.after)
  const before = input.before === undefined ? undefined : cursor(input.before)
  await recoverEnrollmentNotifications()
  // Snapshot cursor BEFORE history queries. Concurrent later inserts are fetched
  // on the next poll, never silently skipped by a later max(id) read.
  const max = await db.execute<{ id: string }>(sql`SELECT coalesce(max(id), 0)::text id FROM enrollment_notifications`)
  const top = String(max.rows[0].id)
  const scope = notificationScope(admin)
  const columns = sql`SELECT n.id::text, n.agreement_id, c.full_name, c.business_name, n.milestone, n.occurred_at,
    EXISTS (SELECT 1 FROM enrollment_notification_state s WHERE s.admin_id = ${admin.userId}
      AND s.event_id = n.id AND s.read_at IS NOT NULL) AS read`
  const history = await db.execute<Row>(sql`${columns} ${joins} WHERE ${scope}
    AND n.id <= ${top}::bigint ${before === undefined ? sql`` : sql`AND n.id < ${before}::bigint`}
    ORDER BY n.id DESC LIMIT 51`)
  const live = after === undefined ? [] : (await db.execute<Row>(sql`${columns} ${joins}
    WHERE ${scope} AND n.id > ${after}::bigint AND n.id <= ${top}::bigint ORDER BY n.id ASC LIMIT 50`)).rows
  const count = await db.execute<{ count: string }>(sql`SELECT count(*)::text count ${joins} WHERE ${scope} AND NOT EXISTS (
    SELECT 1 FROM enrollment_notification_state s WHERE s.admin_id = ${admin.userId} AND s.event_id = n.id AND s.read_at IS NOT NULL)`)
  const prefs = await db.execute<{ sound: boolean; desktop: boolean }>(sql`SELECT sound, desktop FROM enrollment_notification_preferences WHERE admin_id = ${admin.userId}`)
  return { items: history.rows.slice(0, 50).map(item), live: live.map(item),
    cursor: live.length === 50 ? String(live[live.length - 1].id) : top,
    unread: Number(count.rows[0].count), preferences: prefs.rows[0] ?? { sound: false, desktop: false },
    hasMore: history.rows.length > 50 }
}

export async function markRead(id?: string) {
  const admin = await requireAdmin()
  const eventId = id === undefined ? undefined : cursor(id)
  await db.execute(sql`INSERT INTO enrollment_notification_state (admin_id, event_id, read_at)
    SELECT ${admin.userId}, n.id, now() ${joins} WHERE ${notificationScope(admin)}
    ${eventId === undefined ? sql`` : sql`AND n.id = ${eventId}::bigint`}
    ON CONFLICT (admin_id, event_id) DO UPDATE SET read_at = excluded.read_at`)
  return { ok: true }
}

/** Atomic cross-tab and cross-device audible/desktop delivery claim. */
export async function claimDelivery(id: string) {
  const admin = await requireAdmin()
  const eventId = cursor(id)
  const result = await db.execute(sql`INSERT INTO enrollment_notification_state (admin_id, event_id, delivered_at)
    SELECT ${admin.userId}, n.id, now() ${joins} WHERE ${notificationScope(admin)} AND n.id = ${eventId}::bigint
    ON CONFLICT (admin_id, event_id) DO UPDATE SET delivered_at = excluded.delivered_at
      WHERE enrollment_notification_state.delivered_at IS NULL
    RETURNING event_id`)
  return { claimed: result.rows.length > 0 }
}

export async function savePreferences(input: { sound?: boolean; desktop?: boolean }) {
  const admin = await requireAdmin()
  if (!input || typeof input !== 'object' ||
    (input.sound !== undefined && typeof input.sound !== 'boolean') ||
    (input.desktop !== undefined && typeof input.desktop !== 'boolean')) throw new Error('Invalid notification preferences')
  await db.execute(sql`INSERT INTO enrollment_notification_preferences (admin_id, sound, desktop)
    VALUES (${admin.userId}, ${input.sound ?? false}, ${input.desktop ?? false})
    ON CONFLICT (admin_id) DO UPDATE SET
      sound = ${input.sound === undefined ? sql`enrollment_notification_preferences.sound` : sql`${input.sound}`},
      desktop = ${input.desktop === undefined ? sql`enrollment_notification_preferences.desktop` : sql`${input.desktop}`}`)
  return { ok: true }
}
