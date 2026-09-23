import { pgTable, text, timestamp, jsonb, integer, uniqueIndex, index } from "drizzle-orm/pg-core";

export type BillingNotificationType = "payment_failed_backup_used" | "access_paused" | "access_restored";
export type BillingNotificationStatus = "pending" | "sent" | "failed";

/**
 * Outbox for the customer emails in the failed-payment flow. One row per
 * (type, invoice): the unique index is what makes "once per invoice" hold
 * when two Stripe events or a webhook and the cron race. The rendered
 * template data is kept so a send that Resend rejected can be retried later
 * without re-deriving anything from Stripe.
 */
export const billingNotificationsTable = pgTable(
  "billing_notifications",
  {
    id: text("id").primaryKey(),
    type: text("type").$type<BillingNotificationType>().notNull(),
    stripeInvoiceId: text("stripe_invoice_id").notNull(),
    customerId: text("customer_id").notNull(),
    recipient: text("recipient").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status").$type<BillingNotificationStatus>().notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    emailLogId: text("email_log_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("billing_notifications_type_invoice_idx").on(t.type, t.stripeInvoiceId),
    index("billing_notifications_status_idx").on(t.status),
  ],
).enableRLS();

export type BillingNotification = typeof billingNotificationsTable.$inferSelect;
export type NewBillingNotification = typeof billingNotificationsTable.$inferInsert;
