import { pgTable, text, boolean, integer, jsonb, timestamp, index } from 'drizzle-orm/pg-core'
import { salesLeadsTable } from './sales-leads'
const instant = (name: string) => timestamp(name, { withTimezone: true })
export const appointmentMessageSettingsTable = pgTable('appointment_message_settings', {
  id: text('id').primaryKey(), enabled: boolean('enabled').notNull().default(false),
  enabledAt: instant('enabled_at'), readinessConfirmedAt: instant('readiness_confirmed_at'),
})
export const appointmentHostsTable = pgTable('appointment_hosts', {
  ghlUserId: text('ghl_user_id').primaryKey(), adminId: text('admin_id').notNull(),
  name: text('name').notNull(), replyEmail: text('reply_email').notNull(),
  active: boolean('active').notNull().default(true),
})
export const appointmentMessagesTable = pgTable('appointment_messages', {
  appointmentId: text('appointment_id').primaryKey(),
  leadId: text('lead_id').notNull().references(() => salesLeadsTable.id),
  bookedAt: instant('booked_at').notNull().defaultNow(), startsAt: instant('starts_at').notNull(),
  timezone: text('timezone').notNull(), version: integer('version').notNull().default(0),
  fingerprint: text('fingerprint'), snapshot: jsonb('snapshot').notNull().default({}),
  reconcileAt: instant('reconcile_at').notNull().defaultNow(), lastError: text('last_error'),
  stopped: boolean('stopped').notNull().default(false),
}, t => [index('appointment_messages_reconcile').on(t.stopped, t.reconcileAt)])
export const appointmentDeliveriesTable = pgTable('appointment_deliveries', {
  id: text('id').primaryKey(), appointmentId: text('appointment_id').notNull().references(() => appointmentMessagesTable.appointmentId),
  version: integer('version').notNull(), kind: text('kind').notNull(), channel: text('channel').notNull(),
  state: text('state').notNull().default('pending'), dueAt: instant('due_at').notNull(), expiresAt: instant('expires_at').notNull(),
  attempts: integer('attempts').notNull().default(0), claimedAt: instant('claimed_at'), sentAt: instant('sent_at'),
  snapshot: jsonb('snapshot'), providerId: text('provider_id'), emailLogId: text('email_log_id'), lastError: text('last_error'),
}, t => [index('appointment_deliveries_due').on(t.state, t.dueAt)])
