import { pgTable, text, boolean, timestamp, index } from 'drizzle-orm/pg-core'
import { salesLeadsTable } from './sales-leads'
const at = (n: string) => timestamp(n, { withTimezone: true })
export const salesInboxSettings = pgTable('sales_inbox_settings', {
  id: text('id').primaryKey(), emailDomain: text('email_domain').notNull().default(''),
  emailReady: boolean('email_ready').notNull().default(false), smsReady: boolean('sms_ready').notNull().default(false),
})
export const salesInboxThreads = pgTable('sales_inbox_threads', {
  leadId: text('lead_id').primaryKey().references(() => salesLeadsTable.id),
  token: text('token').notNull().unique(),
})
export const salesInboxMessages = pgTable('sales_inbox_messages', {
  id: text('id').primaryKey(), leadId: text('lead_id').notNull().references(() => salesLeadsTable.id),
  channel: text('channel').notNull(), direction: text('direction').notNull(),
  subject: text('subject').notNull().default(''), body: text('body').notNull(),
  authorId: text('author_id'), authorName: text('author_name'), state: text('state').notNull(),
  providerId: text('provider_id').unique(), emailLogId: text('email_log_id'), error: text('error'),
  fingerprint: text('fingerprint'), createdAt: at('created_at').notNull().defaultNow(),
}, t => [index('sales_inbox_messages_thread').on(t.leadId, t.createdAt)])
export const salesInboxInbound = pgTable('sales_inbox_inbound', {
  id: text('id').primaryKey(), state: text('state').notNull().default('pending'),
  createdAt: at('created_at').notNull().defaultNow(), lastError: text('last_error'),
})
