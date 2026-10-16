CREATE TABLE "lead_email_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"recipient" text NOT NULL,
	"lead_count" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"first_attempt_at" timestamp with time zone,
	"last_error" text,
	CONSTRAINT "lead_email_outbox_positive_count" CHECK ("lead_email_outbox"."lead_count" > 0)
);
--> statement-breakpoint
ALTER TABLE "lead_email_outbox" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "office_lead_email_settings" (
	"owner_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"recipient" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "office_lead_email_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "lead_email_outbox_pending" ON "lead_email_outbox" USING btree ("status","updated_at");