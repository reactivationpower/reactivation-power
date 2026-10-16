ALTER TABLE "campaign_leads" ADD COLUMN "requested_at" timestamp;--> statement-breakpoint
CREATE INDEX "campaign_leads_owner_requested_idx" ON "campaign_leads" USING btree ("owner_id","requested_at");