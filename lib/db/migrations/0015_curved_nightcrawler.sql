-- This task's earlier migration may already exist in the shared Supabase
-- database. Preserve its audit rows while appending after main's migrations.
CREATE TABLE IF NOT EXISTS "patient_service_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"actor_id" uuid,
	"actor_name_snapshot" text NOT NULL,
	"service_label_snapshot" text NOT NULL,
	"event_type" text NOT NULL,
	"previous_status" text NOT NULL,
	"new_status" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "patient_service_events_history_idx" ON "patient_service_events" USING btree ("owner_id","contact_id","created_at");
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'patient_service_events'::regclass
    AND conname = 'patient_service_events_contact_owner_fk') THEN
    ALTER TABLE patient_service_events ADD CONSTRAINT patient_service_events_contact_owner_fk
      FOREIGN KEY (owner_id, contact_id) REFERENCES contacts(owner_id, id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'patient_service_events'::regclass
    AND conname = 'patient_service_events_service_owner_fk') THEN
    ALTER TABLE patient_service_events ADD CONSTRAINT patient_service_events_service_owner_fk
      FOREIGN KEY (owner_id, contact_id, service_id) REFERENCES contact_services(owner_id, contact_id, id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'patient_service_events'::regclass
    AND conname = 'patient_service_events_actor_fk') THEN
    ALTER TABLE patient_service_events ADD CONSTRAINT patient_service_events_actor_fk
      FOREIGN KEY (actor_id) REFERENCES participants(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'patient_service_events'::regclass
    AND conname = 'patient_service_events_reopening_check') THEN
    ALTER TABLE patient_service_events ADD CONSTRAINT patient_service_events_reopening_check
      CHECK (event_type = 'service_reopened' AND previous_status = 'declined' AND new_status = 'cooling'
        AND length(btrim(reason)) BETWEEN 1 AND 1000);
  END IF;
END $$;
ALTER TABLE patient_service_events ENABLE ROW LEVEL SECURITY;
-- No public policies: only the practice-scoped service-role server has access.