CREATE TABLE "email_log" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"recipient" text NOT NULL,
	"subject" text NOT NULL,
	"status" text NOT NULL,
	"provider_id" text,
	"error" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"clicked_at" timestamp with time zone,
	"last_clicked_url" text,
	"last_event" text,
	"last_event_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "email_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "billing_links" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"customer_id" text NOT NULL,
	"link_id" text,
	"purpose" text DEFAULT 'billing' NOT NULL,
	"setup_intent_id" text,
	"created_by_id" text,
	"created_by_name" text,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "customer_cards" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"link_id" text,
	"stripe_payment_method_id" text NOT NULL,
	"fingerprint" text,
	"brand" text DEFAULT 'card' NOT NULL,
	"last4" text DEFAULT '' NOT NULL,
	"exp_month" integer,
	"exp_year" integer,
	"rank" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_cards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"business_name" text DEFAULT '' NOT NULL,
	"business_address" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"owner_name" text DEFAULT '' NOT NULL,
	"owner_phone" text DEFAULT '' NOT NULL,
	"email" text NOT NULL,
	"stripe_customer_id" text,
	"billing_status" text DEFAULT 'none' NOT NULL,
	"participant_id" text,
	"billing_blocked_at" timestamp with time zone,
	"billing_issue" text,
	"created_by_id" text,
	"created_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payment_history" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"link_id" text,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"failure_message" text,
	"card_rank" text,
	"card_brand" text,
	"card_last4" text,
	"stripe_payment_method_id" text,
	"stripe_event_id" text,
	"stripe_invoice_id" text,
	"stripe_payment_intent_id" text,
	"stripe_charge_id" text,
	"stripe_refund_id" text,
	"stripe_subscription_id" text,
	"source" text DEFAULT 'webhook' NOT NULL,
	"actor_admin_id" text,
	"actor_admin_name" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payment_link_terms" (
	"link_id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"customer_id" text NOT NULL,
	"type" text NOT NULL,
	"rep_id" text,
	"rep_name" text,
	"setup_fee_cents" integer DEFAULT 0 NOT NULL,
	"monthly_cents" integer DEFAULT 0 NOT NULL,
	"term_months" integer DEFAULT 12 NOT NULL,
	"stripe_customer_id" text,
	"primary_intent_id" text,
	"secondary_intent_id" text,
	"setup_paid_at" timestamp with time zone,
	"stripe_subscription_id" text,
	"subscription_status" text,
	"next_payment_at" timestamp with time zone,
	"agreement_start" timestamp with time zone,
	"agreement_end" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancel_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_link_terms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "stripe_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"livemode" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "stripe_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agreement_events" (
	"id" text PRIMARY KEY NOT NULL,
	"agreement_id" text NOT NULL,
	"type" text NOT NULL,
	"version" integer,
	"actor" text DEFAULT 'customer' NOT NULL,
	"actor_name" text,
	"ip" text,
	"user_agent" text,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agreement_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agreement_initials" (
	"id" text PRIMARY KEY NOT NULL,
	"agreement_id" text NOT NULL,
	"section_id" text NOT NULL,
	"section_hash" text NOT NULL,
	"version" integer NOT NULL,
	"initials" text NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agreement_initials" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agreement_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"agreement_id" text NOT NULL,
	"version" integer NOT NULL,
	"term_months" integer NOT NULL,
	"monthly_cents" integer NOT NULL,
	"setup_fee_cents" integer NOT NULL,
	"notice_days" integer DEFAULT 30 NOT NULL,
	"body" text NOT NULL,
	"hash" text NOT NULL,
	"changed_by_id" text,
	"changed_by_name" text,
	"change_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agreement_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "agreements" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"customer_id" text NOT NULL,
	"link_id" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"term_months" integer NOT NULL,
	"monthly_cents" integer NOT NULL,
	"setup_fee_cents" integer NOT NULL,
	"notice_days" integer DEFAULT 30 NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"current_hash" text NOT NULL,
	"sent_by_id" text,
	"sent_by_name" text,
	"sent_at" timestamp with time zone,
	"last_sent_at" timestamp with time zone,
	"viewed_at" timestamp with time zone,
	"signed_at" timestamp with time zone,
	"signed_version" integer,
	"document_hash" text,
	"signed_snapshot" jsonb,
	"consent_at" timestamp with time zone,
	"signer_name" text,
	"signer_title" text,
	"signature_type" text,
	"signature_data" text,
	"signer_ip" text,
	"signer_user_agent" text,
	"setup_paid_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"pdf_path" text,
	"pdf_generated_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agreements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "commission_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"payment_history_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"link_id" text,
	"customer_name" text DEFAULT '' NOT NULL,
	"business_name" text DEFAULT '' NOT NULL,
	"rep_id" text NOT NULL,
	"rep_name" text DEFAULT '' NOT NULL,
	"sale_type" text NOT NULL,
	"refund_of" text,
	"description" text DEFAULT '' NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"default_rate_percent" double precision NOT NULL,
	"rate_percent" double precision NOT NULL,
	"commission_cents" integer NOT NULL,
	"overridden" boolean DEFAULT false NOT NULL,
	"override_note" text,
	"overridden_by_id" text,
	"overridden_by_name" text,
	"overridden_at" timestamp with time zone,
	"paid_out_at" timestamp with time zone,
	"paid_out_by_id" text,
	"paid_out_by_name" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "commission_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "email_log_provider_id_idx" ON "email_log" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "email_log_created_at_idx" ON "email_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_links_token_idx" ON "billing_links" USING btree ("token");--> statement-breakpoint
CREATE INDEX "billing_links_customer_idx" ON "billing_links" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_cards_customer_idx" ON "customer_cards" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customers_email_idx" ON "customers" USING btree ("email");--> statement-breakpoint
CREATE INDEX "customers_participant_idx" ON "customers" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "payment_history_customer_idx" ON "payment_history" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "payment_history_invoice_idx" ON "payment_history" USING btree ("stripe_invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_history_refund_idx" ON "payment_history" USING btree ("stripe_refund_id");--> statement-breakpoint
CREATE INDEX "payment_link_terms_customer_idx" ON "payment_link_terms" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "payment_link_terms_token_idx" ON "payment_link_terms" USING btree ("token");--> statement-breakpoint
CREATE INDEX "agreement_events_agreement_idx" ON "agreement_events" USING btree ("agreement_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agreement_initials_section_idx" ON "agreement_initials" USING btree ("agreement_id","section_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agreement_versions_unique_idx" ON "agreement_versions" USING btree ("agreement_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "agreements_token_idx" ON "agreements" USING btree ("token");--> statement-breakpoint
CREATE INDEX "agreements_customer_idx" ON "agreements" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agreements_link_idx" ON "agreements" USING btree ("link_id");--> statement-breakpoint
CREATE INDEX "agreements_status_idx" ON "agreements" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "commission_entries_history_idx" ON "commission_entries" USING btree ("payment_history_id");--> statement-breakpoint
CREATE INDEX "commission_entries_rep_idx" ON "commission_entries" USING btree ("rep_id","occurred_at");--> statement-breakpoint
CREATE INDEX "commission_entries_customer_idx" ON "commission_entries" USING btree ("customer_id");