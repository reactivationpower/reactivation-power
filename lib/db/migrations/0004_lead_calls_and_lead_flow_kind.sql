CREATE TABLE "lead_calls" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"caller_id" text,
	"disposition" text NOT NULL,
	"notes" text,
	"call_back_at" timestamp with time zone,
	"booked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lead_calls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "campaign_leads" ADD COLUMN "last_disposition" text;--> statement-breakpoint
ALTER TABLE "campaign_leads" ADD COLUMN "next_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "campaign_leads" ADD COLUMN "unanswered_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_leads" ADD COLUMN "booked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "lead_calls" ADD CONSTRAINT "lead_calls_lead_id_campaign_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."campaign_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_calls_lead_idx" ON "lead_calls" USING btree ("lead_id","created_at");--> statement-breakpoint
CREATE INDEX "lead_calls_campaign_idx" ON "lead_calls" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "lead_calls_owner_idx" ON "lead_calls" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "campaign_leads_owner_due_idx" ON "campaign_leads" USING btree ("owner_id","next_due_at");--> statement-breakpoint
-- Hand-written addition (script_flow_* are Supabase-managed tables outside
-- the drizzle schema): a second script family. Every existing row is a
-- reactivation flow; lead flows share step_keys (open, obj_cost, scheduling)
-- with their reactivation counterparts, so flow_kind joins the uniqueness key.
ALTER TABLE "script_flow_steps" ADD COLUMN "flow_kind" text NOT NULL DEFAULT 'reactivation';--> statement-breakpoint
ALTER TABLE "script_flow_choices" ADD COLUMN "flow_kind" text NOT NULL DEFAULT 'reactivation';--> statement-breakpoint
ALTER TABLE "script_flow_steps" ADD CONSTRAINT "script_flow_steps_flow_kind_check" CHECK ("flow_kind" IN ('reactivation', 'lead'));--> statement-breakpoint
ALTER TABLE "script_flow_choices" ADD CONSTRAINT "script_flow_choices_flow_kind_check" CHECK ("flow_kind" IN ('reactivation', 'lead'));--> statement-breakpoint
DROP INDEX IF EXISTS "script_flow_steps_niche_key";--> statement-breakpoint
CREATE UNIQUE INDEX "script_flow_steps_niche_key" ON "script_flow_steps" USING btree ("flow_kind", COALESCE(("niche_id")::text, 'general'), "step_key");--> statement-breakpoint
CREATE INDEX "script_flow_steps_kind_idx" ON "script_flow_steps" USING btree ("flow_kind");--> statement-breakpoint
CREATE INDEX "script_flow_choices_kind_idx" ON "script_flow_choices" USING btree ("flow_kind");--> statement-breakpoint
NOTIFY pgrst, 'reload schema';
