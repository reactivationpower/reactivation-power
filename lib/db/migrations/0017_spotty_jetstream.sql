ALTER TABLE "payment_link_terms" ADD COLUMN "enrollment_flow" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_link_terms" ADD COLUMN "enrollment_payment_intent_id" text;