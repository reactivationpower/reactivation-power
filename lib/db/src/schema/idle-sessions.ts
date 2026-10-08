import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { createInsertSchema } from 'drizzle-zod'

export const idleSessionsTable = pgTable('auth_idle_sessions', {
  id: uuid('id').primaryKey(),
  kind: text('kind').notNull(),
  subjectId: text('subject_id').notNull(),
  lastInteractionAt: timestamp('last_interaction_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}).enableRLS()
export const insertIdleSessionSchema = createInsertSchema(idleSessionsTable)
export type IdleSession = typeof idleSessionsTable.$inferSelect
