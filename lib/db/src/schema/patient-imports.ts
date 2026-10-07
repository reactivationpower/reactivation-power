import { pgTable, uuid, text, date, timestamp, jsonb, integer, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { createInsertSchema } from 'drizzle-zod'

export const patientSources = pgTable('patient_sources', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerId: uuid('owner_id').notNull(),
  contactId: uuid('contact_id').notNull(),
  sourceSystem: text('source_system').notNull(),
  patientId: text('patient_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('patient_sources_identity_idx').on(t.ownerId, t.sourceSystem, t.patientId),
  uniqueIndex('patient_sources_contact_source_idx').on(t.contactId, t.sourceSystem),
])

export const contactServices = pgTable('contact_services', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerId: uuid('owner_id').notNull(),
  contactId: uuid('contact_id').notNull(),
  serviceKey: text('service_key').notNull(),
  nicheId: uuid('niche_id'),
  serviceLabel: text('service_label'),
  lastVisit: date('last_visit', { mode: 'string' }),
  originalComplaint: text('original_complaint'),
  sourceNotes: text('source_notes'),
  outreachStatus: text('outreach_status').default('ready').notNull(),
  cycleStartedAt: timestamp('cycle_started_at', { withTimezone: true }),
  lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
  lastOutcome: text('last_outcome'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex('contact_services_contact_key_idx').on(t.contactId, t.serviceKey), index('contact_services_owner_idx').on(t.ownerId)])

export const patientImportReviews = pgTable('patient_import_reviews', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerId: uuid('owner_id').notNull(),
  batchId: uuid('batch_id').notNull(),
  rowNumber: integer('row_number').notNull(),
  sourceSystem: text('source_system').notNull(),
  fingerprint: text('fingerprint').notNull(),
  incoming: jsonb('incoming').notNull(),
  reason: text('reason').notNull(),
  candidateIds: uuid('candidate_ids').array().notNull(),
  contactId: uuid('contact_id'),
  decision: text('decision'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex('patient_import_reviews_fingerprint_idx').on(t.ownerId, t.fingerprint), index('patient_import_reviews_owner_idx').on(t.ownerId, t.resolvedAt)])

export const insertPatientSourceSchema = createInsertSchema(patientSources)
export const insertContactServiceSchema = createInsertSchema(contactServices)
export const insertPatientImportReviewSchema = createInsertSchema(patientImportReviews)

export const patientCallLeases = pgTable('patient_call_leases', {
  contactId: uuid('contact_id').primaryKey(),
  ownerId: uuid('owner_id').notNull(),
  callerId: uuid('caller_id').notNull(),
  token: uuid('token').notNull(),
  serviceId: uuid('service_id').notNull(),
  followUpId: uuid('follow_up_id'),
  context: text('context').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
})
export const insertPatientCallLeaseSchema = createInsertSchema(patientCallLeases)
