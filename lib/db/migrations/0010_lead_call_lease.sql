ALTER TABLE "campaign_leads" ADD COLUMN "call_lease_token" text;
ALTER TABLE "campaign_leads" ADD COLUMN "call_lease_caller_id" text;
ALTER TABLE "campaign_leads" ADD COLUMN "call_lease_started_at" timestamptz;
ALTER TABLE "campaign_leads" ADD COLUMN "call_lease_expires_at" timestamptz;
CREATE INDEX "campaign_leads_owner_lease_idx" ON "campaign_leads" ("owner_id", "call_lease_expires_at");