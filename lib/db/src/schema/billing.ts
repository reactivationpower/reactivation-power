import { boolean, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Billing records live in the Replit Postgres. The Supabase `payment_links`
 * row stays the identity of a link (token, buyer name/email, paid flag,
 * provisioned participant); the tables below extend it with the customer
 * record, offer terms, subscription state and cards on file.
 */

export type BillingStatus = "none" | "setup_paid" | "trialing" | "active" | "past_due" | "canceled" | "paid";
export type LinkType = "one_time" | "subscription";
export type CardRank = "primary" | "secondary";

export const customersTable = pgTable(
  "customers",
  {
    id: text("id").primaryKey(),
    fullName: text("full_name").notNull(),
    businessName: text("business_name").notNull().default(""),
    businessAddress: text("business_address").notNull().default(""),
    phone: text("phone").notNull().default(""),
    ownerName: text("owner_name").notNull().default(""),
    ownerPhone: text("owner_phone").notNull().default(""),
    email: text("email").notNull(),
    stripeCustomerId: text("stripe_customer_id"),
    billingStatus: text("billing_status").$type<BillingStatus>().notNull().default("none"),
    createdById: text("created_by_id"),
    createdByName: text("created_by_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("customers_email_idx").on(t.email)],
);

/** One row per payment link (keyed by the Supabase payment_links.id). */
export const paymentLinkTermsTable = pgTable(
  "payment_link_terms",
  {
    linkId: text("link_id").primaryKey(),
    token: text("token").notNull(),
    customerId: text("customer_id").notNull(),
    type: text("type").$type<LinkType>().notNull(),
    repId: text("rep_id"),
    repName: text("rep_name"),
    setupFeeCents: integer("setup_fee_cents").notNull().default(0),
    monthlyCents: integer("monthly_cents").notNull().default(0),
    stripeCustomerId: text("stripe_customer_id"),
    /** PaymentIntent (setup fee > 0) or SetupIntent (waived) for the primary card. */
    primaryIntentId: text("primary_intent_id"),
    /** Most recent SetupIntent for the secondary card. */
    secondaryIntentId: text("secondary_intent_id"),
    setupPaidAt: timestamp("setup_paid_at", { withTimezone: true }),
    stripeSubscriptionId: text("stripe_subscription_id"),
    subscriptionStatus: text("subscription_status"),
    nextPaymentAt: timestamp("next_payment_at", { withTimezone: true }),
    agreementStart: timestamp("agreement_start", { withTimezone: true }),
    agreementEnd: timestamp("agreement_end", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payment_link_terms_customer_idx").on(t.customerId), index("payment_link_terms_token_idx").on(t.token)],
);

export const customerCardsTable = pgTable(
  "customer_cards",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").notNull(),
    linkId: text("link_id"),
    stripePaymentMethodId: text("stripe_payment_method_id").notNull(),
    fingerprint: text("fingerprint"),
    brand: text("brand").notNull().default("card"),
    last4: text("last4").notNull().default(""),
    expMonth: integer("exp_month"),
    expYear: integer("exp_year"),
    rank: text("rank").$type<CardRank>().notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("customer_cards_customer_idx").on(t.customerId)],
);

export type Customer = typeof customersTable.$inferSelect;
export type PaymentLinkTerms = typeof paymentLinkTermsTable.$inferSelect;
export type CustomerCard = typeof customerCardsTable.$inferSelect;
