import { bigint, bigserial, boolean, index, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

export const enrollmentNotificationRolloutTable = pgTable('enrollment_notification_rollout', {
  id: text('id').primaryKey(),
  since: timestamp('since', { withTimezone: true }).notNull().defaultNow(),
}).enableRLS()

export const enrollmentNotificationsTable = pgTable('enrollment_notifications', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  agreementId: text('agreement_id').notNull(),
  milestone: text('milestone').$type<'opened' | 'signed' | 'primary_card' | 'backup_card' | 'completed'>().notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
}, t => [
  uniqueIndex('enrollment_notifications_milestone_idx').on(t.agreementId, t.milestone),
]).enableRLS()

export const enrollmentNotificationStateTable = pgTable('enrollment_notification_state', {
  adminId: text('admin_id').notNull(),
  eventId: bigint('event_id', { mode: 'bigint' }).notNull().references(() => enrollmentNotificationsTable.id, { onDelete: 'cascade' }),
  readAt: timestamp('read_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
}, t => [
  primaryKey({ columns: [t.adminId, t.eventId] }),
  index('enrollment_notification_state_admin_idx').on(t.adminId),
]).enableRLS()

export const enrollmentNotificationPreferencesTable = pgTable('enrollment_notification_preferences', {
  adminId: text('admin_id').primaryKey(),
  sound: boolean('sound').notNull().default(false),
  desktop: boolean('desktop').notNull().default(false),
}).enableRLS()
