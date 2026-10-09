CREATE TABLE "sales_activities" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"kind" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"author_id" text,
	"author_name" text,
	"disposition" text,
	"next_followup_at" timestamp with time zone,
	"provider_id" text,
	"status" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dedupe_key" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_imports" (
	"id" text PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"state" text DEFAULT 'preview' NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"imported" integer DEFAULT 0 NOT NULL,
	"cursor" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sample" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_error" text,
	"actor_id" text NOT NULL,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text,
	"kind" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"due_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"claimed_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_leads" (
	"id" text PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"practice_name" text DEFAULT '' NOT NULL,
	"source" text NOT NULL,
	"stage" text DEFAULT 'New' NOT NULL,
	"affiliate_id" text,
	"assignee_id" text,
	"ghl_contact_id" text,
	"customer_id" text,
	"consent" boolean DEFAULT false NOT NULL,
	"dnd" boolean DEFAULT false NOT NULL,
	"timezone" text,
	"timezone_origin" text,
	"timezone_confirmed_at" timestamp with time zone,
	"next_followup_at" timestamp with time zone,
	"appointment_status" text,
	"automation_state" text DEFAULT 'manual' NOT NULL,
	"sync_state" text DEFAULT 'pending' NOT NULL,
	"sync_error" text,
	"last_reply_at" timestamp with time zone,
	"historical" boolean DEFAULT false NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"provider_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reconcile_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reconcile_cursor" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_merge_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"dedupe_key" text NOT NULL,
	"candidates" jsonb NOT NULL,
	"submission" jsonb NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sales_preferences" (
	"admin_id" text PRIMARY KEY NOT NULL,
	"reply_notifications" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"default_assignee_id" text,
	"automation_enabled" boolean DEFAULT false NOT NULL,
	"approved_at" timestamp with time zone,
	"template" text DEFAULT 'Hi {firstName}, this is the Patient Pipeline team. Would you like help planning your practice follow-up? Reply STOP to opt out.' NOT NULL,
	"later_days" jsonb DEFAULT '[5,7,10,14,21,28]'::jsonb NOT NULL,
	"capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"capabilities_checked_at" timestamp with time zone,
	"scope_reviewed_at" timestamp with time zone,
	"enabled_at" timestamp with time zone,
	"poll_cursor" text,
	"poll_at" timestamp with time zone DEFAULT now() NOT NULL,
	"poll_error" text
);
--> statement-breakpoint
CREATE TABLE "sales_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"source" text NOT NULL,
	"source_path" text NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"consent_evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"historical" boolean DEFAULT false NOT NULL,
	"dedupe_key" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sales_activities" ADD CONSTRAINT "sales_activities_lead_id_sales_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."sales_leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_jobs" ADD CONSTRAINT "sales_jobs_lead_id_sales_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."sales_leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_submissions" ADD CONSTRAINT "sales_submissions_lead_id_sales_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."sales_leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sales_activities_dedupe" ON "sales_activities" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "sales_activities_lead_idx" ON "sales_activities" USING btree ("lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_jobs_dedupe" ON "sales_jobs" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "sales_jobs_due_idx" ON "sales_jobs" USING btree ("state","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_leads_provider_unique" ON "sales_leads" USING btree ("ghl_contact_id");--> statement-breakpoint
CREATE INDEX "sales_leads_email_idx" ON "sales_leads" USING btree ("email");--> statement-breakpoint
CREATE INDEX "sales_leads_phone_idx" ON "sales_leads" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "sales_leads_reconcile_idx" ON "sales_leads" USING btree ("reconcile_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_merge_review_dedupe" ON "sales_merge_reviews" USING btree ("dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_submissions_dedupe" ON "sales_submissions" USING btree ("dedupe_key");
--> statement-breakpoint
ALTER TABLE sales_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_merge_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sales_leads,sales_submissions,sales_activities,sales_jobs,sales_settings,sales_preferences,sales_imports,sales_merge_reviews FROM anon,authenticated;
INSERT INTO sales_settings(id) VALUES('internal') ON CONFLICT DO NOTHING;