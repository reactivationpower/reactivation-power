import { pgTable, text, integer, jsonb, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { salesLeadsTable, salesSubmissionsTable } from './sales-leads'
const instant = (name: string) => timestamp(name, { withTimezone: true })
/** Published documents and acceptances are append-only, enforced by migration triggers. */
export const leadTermsVersionsTable = pgTable('lead_terms_versions', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  content: text('content').notNull(),
  contentHash: text('content_hash').notNull(),
  checkboxWording: text('checkbox_wording').notNull(),
  publishedAt: instant('published_at').notNull().defaultNow(),
  publishedBy: text('published_by').notNull(),
  publishedByName: text('published_by_name').notNull(),
}).enableRLS()
/** Singleton inserted by the additive migration: null current version means intentionally inactive. */
export const leadTermsSettingsTable = pgTable('lead_terms_settings', {
  id: text('id').primaryKey(),
  currentVersionId: text('current_version_id').references(() => leadTermsVersionsTable.id),
  draftContent: text('draft_content').notNull().default(''),
  draftLabel: text('draft_label').notNull().default(''),
  draftRevision: integer('draft_revision').notNull().default(0),
  updatedBy: text('updated_by'),
  updatedAt: instant('updated_at').notNull().defaultNow(),
}).enableRLS()
export const leadTermsAcceptancesTable = pgTable('lead_terms_acceptances', {
  id: text('id').primaryKey(),
  submissionId: text('submission_id').notNull().references(() => salesSubmissionsTable.id),
  leadId: text('lead_id').notNull().references(() => salesLeadsTable.id),
  versionId: text('version_id').notNull().references(() => leadTermsVersionsTable.id),
  submittedIdentity: jsonb('submitted_identity').notNull(),
  acceptedAt: instant('accepted_at').notNull().defaultNow(),
  contentHash: text('content_hash').notNull(),
  checkboxWording: text('checkbox_wording').notNull(),
  sourcePath: text('source_path').notNull(),
  ip: text('ip').notNull(),
  userAgent: text('user_agent').notNull(),
}, t => [uniqueIndex('lead_terms_acceptance_submission_unique').on(t.submissionId), index('lead_terms_acceptance_lead_idx').on(t.leadId)]).enableRLS()
