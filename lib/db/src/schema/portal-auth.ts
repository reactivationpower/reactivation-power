import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { createInsertSchema } from 'drizzle-zod'

export const portalCredentialsTable = pgTable('portal_auth_credentials', {
  participantId: uuid('participant_id').primaryKey(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  version: uuid('version').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}).enableRLS()

export const portalChallengesTable = pgTable('portal_auth_challenges', {
  id: text('id').primaryKey(),
  participantId: uuid('participant_id').notNull(),
  email: text('email').notNull(),
  purpose: text('purpose').notNull(),
  credentialVersion: uuid('credential_version'),
  codeHash: text('code_hash'),
  attempts: integer('attempts').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  nextPath: text('next_path').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}).enableRLS()

export const portalAuthLimitsTable = pgTable('portal_auth_limits', {
  key: text('key').primaryKey(),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull().defaultNow(),
  // Null denotes a legacy counter (all legacy windows were at most one hour).
  windowSeconds: integer('window_seconds'),
  attempts: integer('attempts').notNull().default(1),
}).enableRLS()

export const insertPortalCredentialSchema = createInsertSchema(portalCredentialsTable)
export const insertPortalChallengeSchema = createInsertSchema(portalChallengesTable)
export const insertPortalAuthLimitSchema = createInsertSchema(portalAuthLimitsTable)
export type PortalCredential = typeof portalCredentialsTable.$inferSelect
export type PortalChallenge = typeof portalChallengesTable.$inferSelect

/**
 * A browser that entered a correct email code. For 48 hours (fixed, from the
 * code entry) the same person on that browser skips the code. The id is a
 * digest of the browser's secret; it is bound to one password revision.
 */
export const portalRememberedDevicesTable = pgTable('portal_auth_devices', {
  id: text('id').primaryKey(),
  participantId: uuid('participant_id').notNull(),
  credentialVersion: uuid('credential_version').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, table => [index('portal_devices_participant').on(table.participantId)]).enableRLS()
export type PortalRememberedDevice = typeof portalRememberedDevicesTable.$inferSelect
