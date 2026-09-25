import { boolean, integer, pgTable, text, timestamp, index, check } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { createInsertSchema } from 'drizzle-zod'
import { z } from 'zod/v4'

export const officeLeadEmailSettingsTable = pgTable('office_lead_email_settings', {
  ownerId: text('owner_id').primaryKey(),
  enabled: boolean('enabled').notNull().default(false),
  recipient: text('recipient').notNull().default(''),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}).enableRLS()
export const leadEmailOutboxTable = pgTable('lead_email_outbox', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  campaignId: text('campaign_id').notNull(),
  recipient: text('recipient').notNull(),
  leadCount: integer('lead_count').notNull(),
  status: text('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  firstAttemptAt: timestamp('first_attempt_at', { withTimezone: true }),
  lastError: text('last_error'),
}, table => [
  index('lead_email_outbox_pending').on(table.status, table.updatedAt),
  check('lead_email_outbox_positive_count', sql`${table.leadCount} > 0`),
]).enableRLS()
export const insertOfficeLeadEmailSettingsSchema = createInsertSchema(officeLeadEmailSettingsTable)
export type InsertOfficeLeadEmailSettings = z.infer<typeof insertOfficeLeadEmailSettingsSchema>
export type OfficeLeadEmailSettings = typeof officeLeadEmailSettingsTable.$inferSelect
export const insertLeadEmailOutboxSchema = createInsertSchema(leadEmailOutboxTable)
export type InsertLeadEmailOutbox = z.infer<typeof insertLeadEmailOutboxSchema>
export type LeadEmailOutbox = typeof leadEmailOutboxTable.$inferSelect