CREATE TABLE "agreement_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"agreement_id" text NOT NULL,
	"recipient" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"email_log_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agreement_deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "agreements" ADD COLUMN "signer_delivery_email" text;--> statement-breakpoint
ALTER TABLE "agreements" ADD COLUMN "copy_emails" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "agreement_deliveries_recipient_idx" ON "agreement_deliveries" USING btree ("agreement_id","recipient");