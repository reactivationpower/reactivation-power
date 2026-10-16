import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Billing records live in Supabase next to `payment_links`. The `payment_links`
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
    /** Supabase participant id of the portal owner provisioned for this customer. */
    participantId: text("participant_id"),
    /** Set while portal access is shut off for a billing problem. */
    billingBlockedAt: timestamp("billing_blocked_at", { withTimezone: true }),
    /** Human-readable reason shown on the login notice (last decline message). */
    billingIssue: text("billing_issue"),
    createdById: text("created_by_id"),
    createdByName: text("created_by_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("customers_email_idx").on(t.email), index("customers_participant_idx").on(t.participantId)],
).enableRLS();

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
    /** Agreement term; the subscription's agreement window is this many months after the trial. */
    termMonths: integer("term_months").notNull().default(12),
    /** Existing links keep their 30-day anchor; newly created subscriptions use a calendar month. */
    billingAnchor: text("billing_anchor").$type<"thirty_days" | "calendar_month">().notNull().default("thirty_days"),
    /** New agreement-first offers; legacy links retain their original checkout. */
    enrollmentFlow: boolean("enrollment_flow").notNull().default(false),
    /** Prevent a sandbox enrollment from being finalized by the live scheduler on the shared database. */
    enrollmentStripeMode: text("enrollment_stripe_mode").$type<"test" | "live">(),
    stripeCustomerId: text("stripe_customer_id"),
    /** PaymentIntent (setup fee > 0) or SetupIntent (waived) for the primary card. */
    primaryIntentId: text("primary_intent_id"),
    /** Most recent SetupIntent for the secondary card. */
    secondaryIntentId: text("secondary_intent_id"),
    /** Initial payment is created only after explicit final confirmation. */
    enrollmentPaymentIntentId: text("enrollment_payment_intent_id"),
    /** Recoverable lease: serialize cross-process completion without holding a DB transaction during network calls. */
    enrollmentFinalizingAt: timestamp("enrollment_finalizing_at", { withTimezone: true }),
    /** Durable explicit confirmation for waived enrollment (there is no PaymentIntent). */
    enrollmentSelectedMethodId: text("enrollment_selected_method_id"),
    setupPaidAt: timestamp("setup_paid_at", { withTimezone: true }),
    stripeSubscriptionId: text("stripe_subscription_id"),
    subscriptionStatus: text("subscription_status"),
    nextPaymentAt: timestamp("next_payment_at", { withTimezone: true }),
    agreementStart: timestamp("agreement_start", { withTimezone: true }),
    agreementEnd: timestamp("agreement_end", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /** Scheduled cancellation (Stripe cancel_at / cancel_at_period_end). */
    cancelAt: timestamp("cancel_at", { withTimezone: true }),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payment_link_terms_customer_idx").on(t.customerId), index("payment_link_terms_token_idx").on(t.token)],
).enableRLS();

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
).enableRLS();

/**
 * Every Stripe webhook event we have seen, keyed by Stripe's event id, so a
 * redelivered event is acknowledged without being processed twice.
 */
export const stripeEventsTable = pgTable("stripe_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  livemode: boolean("livemode").notNull().default(false),
  status: text("status").$type<StripeEventStatus>().notNull().default("processing"),
  error: text("error"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
}).enableRLS();

export type StripeEventStatus = "processing" | "processed" | "ignored" | "failed";

export type PaymentHistoryKind =
  | "invoice_paid"
  | "invoice_failed"
  | "refund"
  | "subscription_updated"
  | "subscription_canceled"
  | "billing_date_changed"
  | "cancellation_scheduled"
  | "card_added";

export type PaymentHistoryStatus = "succeeded" | "failed" | "refunded" | "info";

/**
 * Human-readable billing ledger per customer: every charge attempt, refund
 * and subscription change, with the card used and the admin who acted.
 */
export const paymentHistoryTable = pgTable(
  "payment_history",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").notNull(),
    linkId: text("link_id"),
    kind: text("kind").$type<PaymentHistoryKind>().notNull(),
    status: text("status").$type<PaymentHistoryStatus>().notNull(),
    amountCents: integer("amount_cents").notNull().default(0),
    currency: text("currency").notNull().default("usd"),
    description: text("description").notNull().default(""),
    failureMessage: text("failure_message"),
    cardRank: text("card_rank").$type<CardRank>(),
    cardBrand: text("card_brand"),
    cardLast4: text("card_last4"),
    stripePaymentMethodId: text("stripe_payment_method_id"),
    stripeEventId: text("stripe_event_id"),
    stripeInvoiceId: text("stripe_invoice_id"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeChargeId: text("stripe_charge_id"),
    stripeRefundId: text("stripe_refund_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    /** Where the record came from: webhook, dunning retry, cron or an admin. */
    source: text("source").$type<PaymentHistorySource>().notNull().default("webhook"),
    actorAdminId: text("actor_admin_id"),
    actorAdminName: text("actor_admin_name"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("payment_history_customer_idx").on(t.customerId),
    index("payment_history_invoice_idx").on(t.stripeInvoiceId),
    uniqueIndex("payment_history_refund_idx").on(t.stripeRefundId),
  ],
).enableRLS();

export type PaymentHistorySource = "webhook" | "dunning" | "cron" | "admin" | "customer";

export type BillingLinkPurpose = "update_card" | "billing";
export type Customer = typeof customersTable.$inferSelect;
export type StripeEvent = typeof stripeEventsTable.$inferSelect;
export type PaymentHistory = typeof paymentHistoryTable.$inferSelect;
export type NewPaymentHistory = typeof paymentHistoryTable.$inferInsert;
export type PaymentLinkTerms = typeof paymentLinkTermsTable.$inferSelect;
export type CustomerCard = typeof customerCardsTable.$inferSelect;

/**
 * Tokenized, expiring links to the public customer billing page
 * (/billing/:token). Sent by an admin ("update your card") or requested by
 * the customer from the login notice when access is paused. The customer
 * never needs a portal session, so a locked-out account can still pay.
 */
export const billingLinksTable = pgTable(
  "billing_links",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull(),
    customerId: text("customer_id").notNull(),
    /** The agreement (payment link) the cards are scoped to. */
    linkId: text("link_id"),
    purpose: text("purpose").$type<BillingLinkPurpose>().notNull().default("billing"),
    /** SetupIntent handed to Stripe Elements for the card being added. */
    setupIntentId: text("setup_intent_id"),
    createdById: text("created_by_id"),
    createdByName: text("created_by_name"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("billing_links_token_idx").on(t.token), index("billing_links_customer_idx").on(t.customerId)],
).enableRLS();

export type BillingLink = typeof billingLinksTable.$inferSelect;
