ALTER TABLE "agreements" ADD COLUMN "primary_card_saved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agreements" ADD COLUMN "backup_card_saved_at" timestamp with time zone;