DROP INDEX IF EXISTS "billing_notifications_type_invoice_idx";--> statement-breakpoint
ALTER TABLE "billing_notifications" ADD COLUMN IF NOT EXISTS "slot" text GENERATED ALWAYS AS (CASE WHEN "type" IN ('access_restored', 'payment_received') THEN 'paid' ELSE "type" END) STORED NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "billing_notifications_slot_invoice_idx" ON "billing_notifications" USING btree ("slot","stripe_invoice_id");
