import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Lead Follow-Up tables. Participants live in the Supabase-managed
 * `participants` table (not modelled here), so owner/participant columns are
 * plain ids without a database-level FK, the same way `customers` refers to
 * its portal owner.
 */

/**
 * Per-account product grant, rooted on the access owner exactly like
 * `course_access`: staff inherit whatever their owner holds. Only
 * `lead_followup` rows exist today (reactivation is implicit for every
 * account); the column is free text so a third product needs no migration.
 */
export const productAccessTable = pgTable(
  "product_access",
  {
    participantId: text("participant_id").notNull(),
    product: text("product").notNull(), // lead_followup
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.participantId, t.product] })],
).enableRLS();

export type ProductAccessRow = typeof productAccessTable.$inferSelect;

/** The ad/offer a lead responded to. Two campaigns may share a niche with different prices. */
export const leadCampaignsTable = pgTable(
  "lead_campaigns",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    createdBy: text("created_by"),
    /** Healthcare niche id from Supabase `niches`; decides which script plays. */
    nicheId: text("niche_id").notNull(),
    name: text("name").notNull(),
    /** What's included in the offer, one string per line item. */
    offerItems: jsonb("offer_items").$type<string[]>().notNull().default([]),
    regularPriceCents: integer("regular_price_cents"),
    offerPriceCents: integer("offer_price_cents"),
    priceLineStyle: text("price_line_style").notNull(), // normally_now | offer_only | no_price
    /** "Offer ends Friday" / "only 10 spots" — read aloud when set. */
    urgencyNote: text("urgency_note"),
    status: text("status").notNull().default("active"), // active | paused | archived
    /** Owner-selected guide for connecting incoming leads; not evidence of a live integration. */
    leadSourceSetup: text("lead_source_setup").notNull().default("unsure"), // ghl | facebook | website | unsure
    /**
     * Secret path segment of this campaign's intake URL. Regenerating it is
     * the only way to revoke a URL that leaked. The SQL default only
     * back-fills rows that existed before the column; the app generates
     * tokens itself with node's CSPRNG.
     */
    webhookToken: text("webhook_token")
      .notNull()
      .default(sql`replace(gen_random_uuid()::text, '-', '')`),
    /**
     * Owner overrides for the webhook field mapping: target field -> incoming
     * key (dotted path allowed). Anything not listed falls back to the
     * automatic mapping.
     */
    fieldMapping: jsonb("field_mapping").$type<Record<string, string>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("lead_campaigns_owner_idx").on(t.ownerId, t.status),
    uniqueIndex("lead_campaigns_webhook_token_idx").on(t.webhookToken),
  ],
).enableRLS();

export type LeadCampaignRow = typeof leadCampaignsTable.$inferSelect;
export type NewLeadCampaignRow = typeof leadCampaignsTable.$inferInsert;

/**
 * One lead in one campaign. The same phone may appear in two campaigns (the
 * person answered two ads) but only once per campaign — the unique index on
 * (campaign_id, phone_key) is the dedupe rule.
 */
export const campaignLeadsTable = pgTable(
  "campaign_leads",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => leadCampaignsTable.id, { onDelete: "cascade" }),
    /** Denormalised from the campaign so account-wide queries never need a join. */
    ownerId: text("owner_id").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull().default(""),
    phone: text("phone").notNull(),
    /** Digits-only phone used for dedupe within a campaign. */
    phoneKey: text("phone_key").notNull(),
    email: text("email"),
    source: text("source").notNull(), // upload | webhook | gohighlevel | manual
    /** When the lead responded to the ad (list uploads default to the upload time). */
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    /** Source-provided submission instant. Null for imports whose original date is unknown. */
    sourceSubmittedAt: timestamp("source_submitted_at", { withTimezone: true }),
    /** Free text the lead gave for when they'd like to come in, exactly as written. */
    requestedTime: text("requested_time"),
    /**
     * `requested_time` resolved to a wall-clock slot when it named a day and a
     * time (see @workspace/shared/lead-requested-time). Zone-less on purpose:
     * the office's clock, read back by the browser in local time. Drives the
     * confirmation-call entry point and the call-next ordering.
     */
    requestedAt: timestamp("requested_at", { mode: "string" }),
    /** What they wrote on the form. */
    message: text("message"),
    status: text("status").notNull().default("new"), // new | attempted | reached | booked | confirmed | closed
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    /** Outcome of the most recent call (a LeadDisposition); explains a `closed` status. */
    lastDisposition: text("last_disposition"),
    /** When the lead is next due on the "call next" list: a retry from the lead cadence or a requested callback. Null when parked, booked or closed. */
    nextDueAt: timestamp("next_due_at", { withTimezone: true }),
    /** Consecutive no-answer / voicemail attempts since the lead was last reached; drives the retry cadence. */
    unansweredAttempts: integer("unanswered_attempts").notNull().default(0),
    /** Appointment time captured when the caller logged "booked". */
    bookedAt: timestamp("booked_at", { withTimezone: true }),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("campaign_leads_campaign_phone_idx").on(t.campaignId, t.phoneKey),
    index("campaign_leads_campaign_submitted_idx").on(t.campaignId, t.submittedAt),
    index("campaign_leads_owner_idx").on(t.ownerId),
    index("campaign_leads_owner_due_idx").on(t.ownerId, t.nextDueAt),
    index("campaign_leads_owner_requested_idx").on(t.ownerId, t.requestedAt),
  ],
).enableRLS();

export type CampaignLeadRow = typeof campaignLeadsTable.$inferSelect;
export type NewCampaignLeadRow = typeof campaignLeadsTable.$inferInsert;

/**
 * One call attempt against a lead. Mirrors `reactivation_calls` for contacts
 * but keyed on the lead, so the cadence and the per-campaign conversion
 * numbers never mix with reactivation history.
 */
export const leadCallsTable = pgTable(
  "lead_calls",
  {
    id: text("id").primaryKey(),
    leadId: text("lead_id")
      .notNull()
      .references(() => campaignLeadsTable.id, { onDelete: "cascade" }),
    /** Denormalised from the lead so campaign stats and owner-wide lists never need a join. */
    campaignId: text("campaign_id").notNull(),
    ownerId: text("owner_id").notNull(),
    /** Participant who made the call (Supabase `participants`, no FK). */
    callerId: text("caller_id"),
    disposition: text("disposition").notNull(), // LeadDisposition
    notes: text("notes"),
    /** Requested callback time for `callback_later`. */
    callBackAt: timestamp("call_back_at", { withTimezone: true }),
    /** Appointment time for `booked`, `confirmed` and `rescheduled`. */
    bookedAt: timestamp("booked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("lead_calls_lead_idx").on(t.leadId, t.createdAt),
    index("lead_calls_campaign_idx").on(t.campaignId),
    index("lead_calls_owner_idx").on(t.ownerId),
  ],
).enableRLS();

/**
 * Every POST a campaign's intake URL received, raw, whether or not it became
 * a lead. The Lead sources tab shows the latest 20 so the owner can see what
 * their form tool actually sends and why a payload was rejected.
 */
export const campaignWebhookEventsTable = pgTable(
  "campaign_webhook_events",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => leadCampaignsTable.id, { onDelete: "cascade" }),
    ownerId: text("owner_id").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    /** webhook | gohighlevel | test */
    source: text("source").notNull(),
    contentType: text("content_type"),
    /** The body exactly as parsed (JSON object or form fields). */
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    /** created | updated | rejected */
    outcome: text("outcome").notNull(),
    /** Why a payload was rejected, in the owner's words. */
    error: text("error"),
    leadId: text("lead_id"),
  },
  (t) => [index("campaign_webhook_events_campaign_idx").on(t.campaignId, t.receivedAt)],
).enableRLS();

export type CampaignWebhookEventRow = typeof campaignWebhookEventsTable.$inferSelect;
export type NewCampaignWebhookEventRow = typeof campaignWebhookEventsTable.$inferInsert;

export type NewLeadCallRow = typeof leadCallsTable.$inferInsert;

export type LeadCallRow = typeof leadCallsTable.$inferSelect;
