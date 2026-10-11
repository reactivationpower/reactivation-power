import { boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

export const patientTextConnections = pgTable('patient_text_connections', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  kind: text('kind').notNull(),
  provider: text('provider').notNull(),
  accountId: text('account_id').notNull(),
  encrypted: text('encrypted').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, t => [uniqueIndex('patient_text_connection_kind_idx').on(t.ownerId, t.kind)]).enableRLS()

export const patientTextRecipients = pgTable('patient_text_recipients', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  phoneKey: text('phone_key').notNull(),
  consent: boolean('consent').default(false).notNull(),
  consentEvidence: text('consent_evidence'),
  timezone: text('timezone'),
  stopped: boolean('stopped').default(false).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, t => [uniqueIndex('patient_text_recipient_person_idx').on(t.ownerId, t.phoneKey)]).enableRLS()

export const patientTextThreads = pgTable('patient_text_threads', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  recipientId: text('recipient_id').notNull().references(() => patientTextRecipients.id),
  leadId: text('lead_id').notNull(),
  campaignId: text('campaign_id').notNull(),
  ownership: text('ownership').default('team').notNull(),
  revision: integer('revision').default(0).notNull(),
  handoffReason: text('handoff_reason'),
  preferences: text('preferences'),
  nextOpening: timestamp('next_opening', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, t => [uniqueIndex('patient_text_thread_recipient_idx').on(t.recipientId)]).enableRLS()

export const patientTextMessages = pgTable('patient_text_messages', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  threadId: text('thread_id').notNull().references(() => patientTextThreads.id),
  sequence: integer('sequence').notNull(),
  role: text('role').notNull(),
  body: text('body').notNull(),
  delivery: text('delivery').notNull(),
  actorId: text('actor_id'),
  eventId: text('event_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, t => [uniqueIndex('patient_text_message_order_idx').on(t.threadId, t.sequence),
  uniqueIndex('patient_text_message_event_idx').on(t.ownerId, t.eventId)]).enableRLS()

export const patientTextIntents = pgTable('patient_text_intents', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  threadId: text('thread_id').notNull().references(() => patientTextThreads.id),
  revision: integer('revision').notNull(),
  status: text('status').default('blocked').notNull(),
  kind: text('kind').notNull(),
  dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
  attempts: integer('attempts').default(0).notNull(),
  failureReason: text('failure_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}).enableRLS()

export const patientTextPolicies = pgTable('patient_text_policies', {
  ownerId: text('owner_id').primaryKey(),
  policy: jsonb('policy').notNull(),
  updatedBy: text('updated_by').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}).enableRLS()

// Isolated simulation aggregate: no FK cascade into campaigns, calls or analytics.
// All changes lock this row; revision prevents an in-flight model result surviving takeover/reset.
export const patientTextSimulations = pgTable('patient_text_simulations', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  leadId: text('lead_id').notNull(),
  phoneKey: text('phone_key').notNull(),
  state: jsonb('state').notNull(),
  revision: integer('revision').default(0).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, t => [uniqueIndex('patient_text_sim_person_idx').on(t.ownerId, t.phoneKey)]).enableRLS()

// Global authorization budget is not reset with transcripts.
export const patientTextBudget = pgTable('patient_text_budget', {
  id: text('id').primaryKey(),
  reservedCents: integer('reserved_cents').default(0).notNull(),
  calls: integer('calls').default(0).notNull(),
}).enableRLS()
