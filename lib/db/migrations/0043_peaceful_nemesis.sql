CREATE TABLE "onboarding_bookings" (
	"link_id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"ghl_contact_id" text,
	"appointment_id" text,
	"slot" text,
	"timezone" text,
	"claimed_at" timestamp with time zone,
	"booked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "onboarding_bookings" ENABLE ROW LEVEL SECURITY;