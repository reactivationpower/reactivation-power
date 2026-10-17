import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export type OnboardingBookingStatus = "open" | "booking" | "booked" | "uncertain";

/**
 * One onboarding meeting per completed enrollment (keyed by payment link).
 * `booking` is a short lease while the GoHighLevel write runs; `uncertain`
 * means the provider may have saved the appointment (timeout / server error)
 * and must be reconciled against the contact's appointments before anyone
 * books again.
 */
export const onboardingBookingsTable = pgTable("onboarding_bookings", {
  linkId: text("link_id").primaryKey(),
  customerId: text("customer_id").notNull(),
  status: text("status").$type<OnboardingBookingStatus>().notNull().default("open"),
  ghlContactId: text("ghl_contact_id"),
  appointmentId: text("appointment_id"),
  slot: text("slot"),
  timezone: text("timezone"),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  bookedAt: timestamp("booked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

export type OnboardingBooking = typeof onboardingBookingsTable.$inferSelect;
