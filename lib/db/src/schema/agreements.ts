import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Service agreements: the e-sign document a customer must complete before a
 * subscription is created. One agreement per subscription payment link.
 *
 *   agreements          — the live record (status, amounts, signature, PDF)
 *   agreement_versions  — snapshot of text + amounts for every edit
 *   agreement_initials  — the customer's initials per section, bound to the
 *                         hash of the section text they initialed
 *   agreement_events    — audit trail (sent, edited, viewed, initialed, signed,
 *                         paid …) with IP and browser, source of the certificate
 */

export type AgreementStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "signed"
  | "payment_pending"
  | "completed"
  | "expired";

export type SignatureType = "typed" | "drawn";

export interface SignedSection {
  id: string;
  title: string;
  paragraphs: string[];
  requiresInitials: boolean;
  hash: string;
  initials: string | null;
}

/** Frozen rendering of the document exactly as it was signed. */
export interface SignedSnapshot {
  title: string;
  sections: SignedSection[];
  fields: Record<string, string>;
}

export const agreementsTable = pgTable(
  "agreements",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull(),
    customerId: text("customer_id").notNull(),
    /** Supabase payment_links.id of the subscription link this agreement gates. */
    linkId: text("link_id").notNull(),
    status: text("status").$type<AgreementStatus>().notNull().default("draft"),
    termMonths: integer("term_months").notNull(),
    monthlyCents: integer("monthly_cents").notNull(),
    setupFeeCents: integer("setup_fee_cents").notNull(),
    noticeDays: integer("notice_days").notNull().default(30),
    currentVersion: integer("current_version").notNull().default(1),
    /** Hash of the current version's template + amounts. */
    currentHash: text("current_hash").notNull(),
    sentById: text("sent_by_id"),
    sentByName: text("sent_by_name"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
    viewedAt: timestamp("viewed_at", { withTimezone: true }),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    signedVersion: integer("signed_version"),
    /** Fingerprint of the rendered document that was signed. */
    documentHash: text("document_hash"),
    signedSnapshot: jsonb("signed_snapshot").$type<SignedSnapshot>(),
    consentAt: timestamp("consent_at", { withTimezone: true }),
    signerName: text("signer_name"),
    signerTitle: text("signer_title"),
    signatureType: text("signature_type").$type<SignatureType>(),
    /** Typed name, or a PNG data URL for a drawn signature. */
    signatureData: text("signature_data"),
    signerIp: text("signer_ip"),
    signerUserAgent: text("signer_user_agent"),
    setupPaidAt: timestamp("setup_paid_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    pdfPath: text("pdf_path"),
    pdfGeneratedAt: timestamp("pdf_generated_at", { withTimezone: true }),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("agreements_token_idx").on(t.token),
    index("agreements_customer_idx").on(t.customerId),
    uniqueIndex("agreements_link_idx").on(t.linkId),
    index("agreements_status_idx").on(t.status),
  ],
);

export const agreementVersionsTable = pgTable(
  "agreement_versions",
  {
    id: text("id").primaryKey(),
    agreementId: text("agreement_id").notNull(),
    version: integer("version").notNull(),
    termMonths: integer("term_months").notNull(),
    monthlyCents: integer("monthly_cents").notNull(),
    setupFeeCents: integer("setup_fee_cents").notNull(),
    noticeDays: integer("notice_days").notNull().default(30),
    /** Agreement template text with merge fields (see lib/agreements/template). */
    body: text("body").notNull(),
    hash: text("hash").notNull(),
    changedById: text("changed_by_id"),
    changedByName: text("changed_by_name"),
    /** Human summary of what changed vs. the previous version. */
    changeSummary: text("change_summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agreement_versions_unique_idx").on(t.agreementId, t.version)],
);

export const agreementInitialsTable = pgTable(
  "agreement_initials",
  {
    id: text("id").primaryKey(),
    agreementId: text("agreement_id").notNull(),
    sectionId: text("section_id").notNull(),
    /** Hash of the section text at the time of initialing; stale when the section changes. */
    sectionHash: text("section_hash").notNull(),
    version: integer("version").notNull(),
    initials: text("initials").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agreement_initials_section_idx").on(t.agreementId, t.sectionId)],
);

export type AgreementEventType =
  | "created"
  | "sent"
  | "resent"
  | "edited"
  | "viewed"
  | "initialed"
  | "consented"
  | "signed"
  | "setup_fee_paid"
  | "payment_failed"
  | "subscription_started"
  | "completed"
  | "pdf_generated"
  | "expired";

export const agreementEventsTable = pgTable(
  "agreement_events",
  {
    id: text("id").primaryKey(),
    agreementId: text("agreement_id").notNull(),
    type: text("type").$type<AgreementEventType>().notNull(),
    version: integer("version"),
    /** Who acted: the customer (signer) or an admin (name recorded in detail). */
    actor: text("actor").notNull().default("customer"),
    actorName: text("actor_name"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agreement_events_agreement_idx").on(t.agreementId, t.createdAt)],
);

export type Agreement = typeof agreementsTable.$inferSelect;
export type AgreementVersion = typeof agreementVersionsTable.$inferSelect;
export type AgreementInitial = typeof agreementInitialsTable.$inferSelect;
export type AgreementEvent = typeof agreementEventsTable.$inferSelect;
