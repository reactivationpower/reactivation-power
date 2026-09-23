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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("lead_campaigns_owner_idx").on(t.ownerId, t.status)],
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
    source: text("source").notNull(), // upload | webhook | manual
    /** When the lead responded to the ad (list uploads default to the upload time). */
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    /** Free text the lead gave for when they'd like to come in; acted on by a later task. */
    requestedTime: text("requested_time"),
    /** What they wrote on the form. */
    message: text("message"),
    status: text("status").notNull().default("new"), // new | attempted | reached | booked | confirmed | closed
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("campaign_leads_campaign_phone_idx").on(t.campaignId, t.phoneKey),
    index("campaign_leads_campaign_submitted_idx").on(t.campaignId, t.submittedAt),
    index("campaign_leads_owner_idx").on(t.ownerId),
  ],
).enableRLS();

export type CampaignLeadRow = typeof campaignLeadsTable.$inferSelect;
export type NewCampaignLeadRow = typeof campaignLeadsTable.$inferInsert;
