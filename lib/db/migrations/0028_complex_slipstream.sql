CREATE TABLE IF NOT EXISTS "enrollment_invitations" (
	"link_id" text PRIMARY KEY NOT NULL,
	"agreement_id" text,
	"recipient" text NOT NULL,
	"payload" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"first_attempt_at" timestamp with time zone,
	"email_log_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "enrollment_invitations" ENABLE ROW LEVEL SECURITY;