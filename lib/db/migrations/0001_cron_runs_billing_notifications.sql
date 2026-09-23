CREATE TABLE "cron_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"job" text NOT NULL,
	"due_key" text,
	"trigger" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"summary" jsonb,
	"error" text,
	"actor" text
);
--> statement-breakpoint
ALTER TABLE "cron_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "billing_notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"stripe_invoice_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"recipient" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"email_log_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "cron_runs_job_due_key_idx" ON "cron_runs" USING btree ("job","due_key");--> statement-breakpoint
CREATE INDEX "cron_runs_job_started_idx" ON "cron_runs" USING btree ("job","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_notifications_type_invoice_idx" ON "billing_notifications" USING btree ("type","stripe_invoice_id");--> statement-breakpoint
CREATE INDEX "billing_notifications_status_idx" ON "billing_notifications" USING btree ("status");