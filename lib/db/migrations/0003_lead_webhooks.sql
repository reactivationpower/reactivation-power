CREATE TABLE "campaign_webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text NOT NULL,
	"content_type" text,
	"payload" jsonb NOT NULL,
	"outcome" text NOT NULL,
	"error" text,
	"lead_id" text
);
--> statement-breakpoint
ALTER TABLE "campaign_webhook_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lead_campaigns" ADD COLUMN "webhook_token" text DEFAULT replace(gen_random_uuid()::text, '-', '') NOT NULL;--> statement-breakpoint
ALTER TABLE "lead_campaigns" ADD COLUMN "field_mapping" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_webhook_events" ADD CONSTRAINT "campaign_webhook_events_campaign_id_lead_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."lead_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_webhook_events_campaign_idx" ON "campaign_webhook_events" USING btree ("campaign_id","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_campaigns_webhook_token_idx" ON "lead_campaigns" USING btree ("webhook_token");