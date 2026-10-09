import { pgTable, text, boolean, integer, jsonb, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core'
import { createInsertSchema } from 'drizzle-zod'
const instant = (name: string) => timestamp(name, { withTimezone: true })
export const salesLeadsTable = pgTable('sales_leads', {
  id: text('id').primaryKey(), firstName: text('first_name').notNull(), lastName: text('last_name').notNull().default(''),
  email: text('email').notNull().default(''), phone: text('phone').notNull().default(''), practiceName: text('practice_name').notNull().default(''),
  source: text('source').notNull(), stage: text('stage').notNull().default('New'),
  affiliateId: text('affiliate_id'), assigneeId: text('assignee_id'), ghlContactId: text('ghl_contact_id'), customerId: text('customer_id'),
  consent: boolean('consent').notNull().default(false), dnd: boolean('dnd').notNull().default(false),
  timezone: text('timezone'), timezoneOrigin: text('timezone_origin'), timezoneConfirmedAt: instant('timezone_confirmed_at'),
  nextFollowupAt: instant('next_followup_at'), appointmentStatus: text('appointment_status'),
  automationState: text('automation_state').notNull().default('manual'), syncState: text('sync_state').notNull().default('pending'),
  syncError: text('sync_error'), lastReplyAt: instant('last_reply_at'), historical: boolean('historical').notNull().default(false),
  revision: integer('revision').notNull().default(1), providerSnapshot: jsonb('provider_snapshot').notNull().default({}),
  reconcileAt: instant('reconcile_at').notNull().defaultNow(), reconcileCursor: text('reconcile_cursor'),
  createdAt: instant('created_at').notNull().defaultNow(), updatedAt: instant('updated_at').notNull().defaultNow(),
}, t => [uniqueIndex('sales_leads_provider_unique').on(t.ghlContactId), index('sales_leads_email_idx').on(t.email), index('sales_leads_phone_idx').on(t.phone), index('sales_leads_reconcile_idx').on(t.reconcileAt)])
export const salesSubmissionsTable = pgTable('sales_submissions', {
  id: text('id').primaryKey(), leadId: text('lead_id').notNull().references(() => salesLeadsTable.id),
  source: text('source').notNull(), sourcePath: text('source_path').notNull(),
  submittedAt: instant('submitted_at').notNull().defaultNow(), context: jsonb('context').notNull().default({}),
  consentEvidence: jsonb('consent_evidence').notNull().default({}), historical: boolean('historical').notNull().default(false),
  dedupeKey: text('dedupe_key').notNull(),
}, t => [uniqueIndex('sales_submissions_dedupe').on(t.dedupeKey)])
export const salesActivitiesTable = pgTable('sales_activities', {
  id: text('id').primaryKey(), leadId: text('lead_id').notNull().references(() => salesLeadsTable.id),
  kind: text('kind').notNull(), body: text('body').notNull().default(''), authorId: text('author_id'), authorName: text('author_name'),
  disposition: text('disposition'), nextFollowupAt: instant('next_followup_at'), providerId: text('provider_id'),
  status: text('status'), occurredAt: instant('occurred_at').notNull().defaultNow(), dedupeKey: text('dedupe_key').notNull(),
}, t => [uniqueIndex('sales_activities_dedupe').on(t.dedupeKey), index('sales_activities_lead_idx').on(t.leadId)])
export const salesJobsTable = pgTable('sales_jobs', {
  id: text('id').primaryKey(), leadId: text('lead_id').references(() => salesLeadsTable.id), kind: text('kind').notNull(),
  state: text('state').notNull().default('pending'), payload: jsonb('payload').notNull().default({}),
  dedupeKey: text('dedupe_key').notNull(), dueAt: instant('due_at').notNull().defaultNow(),
  attempts: integer('attempts').notNull().default(0), lastError: text('last_error'),
  claimedAt: instant('claimed_at'), finishedAt: instant('finished_at'), createdAt: instant('created_at').notNull().defaultNow(),
}, t => [uniqueIndex('sales_jobs_dedupe').on(t.dedupeKey), index('sales_jobs_due_idx').on(t.state, t.dueAt)])
export const salesSettingsTable = pgTable('sales_settings', {
  id: text('id').primaryKey(), defaultAssigneeId: text('default_assignee_id'),
  automationEnabled: boolean('automation_enabled').notNull().default(false), approvedAt: instant('approved_at'),
  template: text('template').notNull().default('Hi {firstName}, this is the Patient Pipeline team. Would you like help planning your practice follow-up? Reply STOP to opt out.'),
  laterDays: jsonb('later_days').notNull().default([5, 7, 10, 14, 21, 28]),
  capabilities: jsonb('capabilities').notNull().default({}), capabilitiesCheckedAt: instant('capabilities_checked_at'),
  scopeReviewedAt: instant('scope_reviewed_at'), enabledAt: instant('enabled_at'),
  pollCursor: text('poll_cursor'), pollAt: instant('poll_at').notNull().defaultNow(), pollError: text('poll_error'),
})
export const salesPreferencesTable = pgTable('sales_preferences', {
  adminId: text('admin_id').primaryKey(), replyNotifications: boolean('reply_notifications').notNull().default(true),
})
export const salesImportsTable = pgTable('sales_imports', {
  id: text('id').primaryKey(), scope: text('scope').notNull(), state: text('state').notNull().default('preview'),
  total: integer('total').notNull().default(0), imported: integer('imported').notNull().default(0),
  cursor: jsonb('cursor').notNull().default({}), sample: jsonb('sample').notNull().default([]), lastError: text('last_error'),
  actorId: text('actor_id').notNull(), claimedAt: instant('claimed_at'), createdAt: instant('created_at').notNull().defaultNow(),
  expiresAt: instant('expires_at').notNull(),
})
export const salesMergeReviewsTable = pgTable('sales_merge_reviews', {
  id: text('id').primaryKey(), dedupeKey: text('dedupe_key').notNull(), candidates: jsonb('candidates').notNull(),
  submission: jsonb('submission').notNull(), state: text('state').notNull().default('pending'),
  createdAt: instant('created_at').notNull().defaultNow(), resolvedAt: instant('resolved_at'),
}, t => [uniqueIndex('sales_merge_review_dedupe').on(t.dedupeKey)])
export const insertSalesLeadSchema = createInsertSchema(salesLeadsTable)
export type SalesLeadRow = typeof salesLeadsTable.$inferSelect
