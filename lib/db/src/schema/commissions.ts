import { boolean, doublePrecision, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Commission ledger. One row per collected payment (and a negative row per
 * refund), attributed to the sales rep who created the payment link. The
 * rate is frozen from the rep's default at the time of the sale; super
 * admins can override the rate or the owed amount per entry and mark entries
 * as paid out.
 */

export type CommissionSaleType = "full_price" | "setup_fee" | "monthly" | "refund";

export const commissionEntriesTable = pgTable(
  "commission_entries",
  {
    id: text("id").primaryKey(),
    /** The payment_history row this entry was generated from. */
    paymentHistoryId: text("payment_history_id").notNull(),
    customerId: text("customer_id").notNull(),
    linkId: text("link_id"),
    /** Snapshot of the customer at generation time so the report needs no joins. */
    customerName: text("customer_name").notNull().default(""),
    businessName: text("business_name").notNull().default(""),
    repId: text("rep_id").notNull(),
    repName: text("rep_name").notNull().default(""),
    saleType: text("sale_type").$type<CommissionSaleType>().notNull(),
    /** For refunds: which kind of sale is being clawed back. */
    refundOf: text("refund_of").$type<Exclude<CommissionSaleType, "refund">>(),
    description: text("description").notNull().default(""),
    /** Amount collected in cents; negative for refunds. */
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    /** The rep's default rate (percent) when the entry was generated. */
    defaultRatePercent: doublePrecision("default_rate_percent").notNull(),
    /** Effective rate (percent) used for `commissionCents`; differs from default when overridden. */
    ratePercent: doublePrecision("rate_percent").notNull(),
    /** Commission owed in cents (negative for refunds). */
    commissionCents: integer("commission_cents").notNull(),
    /** Set when a super admin changed the rate or amount. */
    overridden: boolean("overridden").notNull().default(false),
    overrideNote: text("override_note"),
    overriddenById: text("overridden_by_id"),
    overriddenByName: text("overridden_by_name"),
    overriddenAt: timestamp("overridden_at", { withTimezone: true }),
    paidOutAt: timestamp("paid_out_at", { withTimezone: true }),
    paidOutById: text("paid_out_by_id"),
    paidOutByName: text("paid_out_by_name"),
    /** When the money moved (mirrors payment_history.occurred_at). */
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("commission_entries_history_idx").on(t.paymentHistoryId),
    index("commission_entries_rep_idx").on(t.repId, t.occurredAt),
    index("commission_entries_customer_idx").on(t.customerId),
  ],
).enableRLS();

export type CommissionEntry = typeof commissionEntriesTable.$inferSelect;
export type NewCommissionEntry = typeof commissionEntriesTable.$inferInsert;
