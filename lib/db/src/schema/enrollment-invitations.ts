import { pgTable, text, jsonb, timestamp, integer } from 'drizzle-orm/pg-core'

/** One immutable initial invitation per link; explicit resends are separate. */
export const enrollmentInvitationsTable = pgTable('enrollment_invitations', {
  linkId: text('link_id').primaryKey(),
  agreementId: text('agreement_id'),
  recipient: text('recipient').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>(),
  status: text('status').$type<'pending' | 'sending' | 'provider_accepted' | 'failed' | 'superseded'>().notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  firstAttemptAt: timestamp('first_attempt_at', { withTimezone: true }),
  emailLogId: text('email_log_id'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}).enableRLS()
