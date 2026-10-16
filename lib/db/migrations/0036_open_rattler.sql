CREATE TABLE "patient_text_budget" (
	"id" text PRIMARY KEY NOT NULL,
	"reserved_cents" integer DEFAULT 0 NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "patient_text_budget" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "patient_text_policies" (
	"owner_id" text PRIMARY KEY NOT NULL,
	"policy" jsonb NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "patient_text_policies" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "patient_text_simulations" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"phone_key" text NOT NULL,
	"state" jsonb NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "patient_text_simulations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE UNIQUE INDEX "patient_text_sim_person_idx" ON "patient_text_simulations" USING btree ("owner_id","phone_key");