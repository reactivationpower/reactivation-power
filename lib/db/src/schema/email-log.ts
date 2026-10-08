import { pgTable, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * One row per transactional email attempt. Delivery, open and click columns
 * are filled in later by Resend's webhook (matched on provider_id).
 */
export const emailLogTable = pgTable(
  "email_log",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    recipient: text("recipient").notNull(),
    subject: text("subject").notNull(),
    status: text("status").notNull(), // sent (provider accepted) | failed | delivered | bounced | suppressed | complained
    providerId: text("provider_id"),
    error: text("error"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    clickedAt: timestamp("clicked_at", { withTimezone: true }),
    lastClickedUrl: text("last_clicked_url"), // Legacy only: never save webhook links (may carry authentication secrets).
    lastEvent: text("last_event"),
    lastEventAt: timestamp("last_event_at", { withTimezone: true }),
  },
  (t) => [index("email_log_provider_id_idx").on(t.providerId), index("email_log_created_at_idx").on(t.createdAt)],
).enableRLS();

export const insertEmailLogSchema = createInsertSchema(emailLogTable).omit({ createdAt: true });
export type InsertEmailLog = z.infer<typeof insertEmailLogSchema>;
export type EmailLog = typeof emailLogTable.$inferSelect;
