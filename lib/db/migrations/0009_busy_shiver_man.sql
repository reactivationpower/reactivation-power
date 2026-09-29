ALTER TABLE "campaign_leads" ADD COLUMN "source_submitted_at" timestamp with time zone;
--> statement-breakpoint
-- Previously received webhook leads have a known intake instant. Uploaded
-- leads may not have supplied their original date, so do not invent one.
UPDATE "campaign_leads"
SET "source_submitted_at" = "submitted_at"
WHERE "source" IN ('webhook', 'gohighlevel');
--> statement-breakpoint
-- The previous four-attempt schedule parked unanswered leads permanently.
-- Bring them back into the new recurring schedule, without queuing a burst.
-- Preserve any existing non-null next_due_at as the one previously scheduled
-- retry; after that call, applyLeadDisposition recalculates from the original
-- anchor using the new nine-slot cadence. This avoids moving a promised call
-- earlier or fabricating earlier missed attempts during migration.
UPDATE "campaign_leads"
SET "next_due_at" = greatest(now(), "submitted_at" + interval '2 months')
WHERE "status" = 'attempted'
  AND "next_due_at" IS NULL
  AND "requested_at" IS NULL
  AND "last_disposition" IN ('no_answer', 'voicemail');