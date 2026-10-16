CREATE TABLE "patient_call_leases" (
	"contact_id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"caller_id" uuid NOT NULL,
	"token" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"follow_up_id" uuid,
	"context" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contact_services" ADD COLUMN "outreach_status" text DEFAULT 'ready' NOT NULL;--> statement-breakpoint
ALTER TABLE "contact_services" ADD COLUMN "cycle_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contact_services" ADD COLUMN "last_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contact_services" ADD COLUMN "last_outcome" text;
--> statement-breakpoint
-- Additive context on legacy tables. Existing due dates and rows stay intact.
ALTER TABLE reactivation_calls ADD COLUMN service_id uuid REFERENCES contact_services(id) ON DELETE SET NULL;
ALTER TABLE reactivation_calls ADD COLUMN service_label_snapshot text;
ALTER TABLE reactivation_calls ADD COLUMN call_context text;
ALTER TABLE follow_ups ADD COLUMN service_id uuid REFERENCES contact_services(id) ON DELETE SET NULL;
ALTER TABLE follow_ups ADD COLUMN call_context text;
ALTER TABLE contact_services ADD CONSTRAINT contact_services_outreach_status_check
  CHECK (outreach_status IN ('ready', 'active', 'cooling', 'declined'));
CREATE UNIQUE INDEX contact_services_owner_contact_identity_idx ON contact_services(owner_id, contact_id, id);
ALTER TABLE patient_call_leases ADD CONSTRAINT patient_call_leases_contact_owner_fk
  FOREIGN KEY (owner_id, contact_id) REFERENCES contacts(owner_id, id) ON DELETE CASCADE;
ALTER TABLE patient_call_leases ADD CONSTRAINT patient_call_leases_service_owner_fk
  FOREIGN KEY (owner_id, contact_id, service_id) REFERENCES contact_services(owner_id, contact_id, id) ON DELETE CASCADE;
ALTER TABLE patient_call_leases ADD CONSTRAINT patient_call_leases_caller_fk
  FOREIGN KEY (caller_id) REFERENCES participants(id) ON DELETE CASCADE;
ALTER TABLE patient_call_leases ENABLE ROW LEVEL SECURITY;
-- The service-role server is the only caller; no public policies.
DO $$
DECLARE constraint_name text;
BEGIN
  FOR constraint_name IN SELECT conname FROM pg_constraint
    WHERE conrelid = 'reactivation_calls'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%disposition%'
  LOOP
    EXECUTE format('ALTER TABLE reactivation_calls DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;
ALTER TABLE reactivation_calls ADD CONSTRAINT reactivation_calls_disposition_check CHECK (
  disposition IN ('no_answer', 'voicemail', 'spoke_did_not_schedule', 'spoke_call_back_later',
    'scheduled', 'do_not_call', 'service_declined', 'appointment_confirmed', 'appointment_cancelled'));
-- Bind historical calls and follow-ups to the original primary service.
UPDATE reactivation_calls r SET service_id = s.id,
  service_label_snapshot = COALESCE(s.service_label, n.name), call_context = 'initial'
FROM contacts c JOIN contact_services s ON s.contact_id = c.id AND s.niche_id IS NOT DISTINCT FROM c.niche_id
LEFT JOIN niches n ON n.id = s.niche_id WHERE r.contact_id = c.id;
UPDATE follow_ups f SET service_id = s.id, call_context = CASE f.reason
  WHEN 'retry' THEN 'retry' WHEN 'manual' THEN 'callback' WHEN 'initial' THEN 'initial' ELSE 'rotation' END
FROM contacts c JOIN contact_services s ON s.contact_id = c.id AND s.niche_id IS NOT DISTINCT FROM c.niche_id
WHERE f.contact_id = c.id;
UPDATE contact_services s SET
  last_attempt_at = (SELECT max(r.created_at) FROM reactivation_calls r WHERE r.service_id = s.id),
  last_outcome = (SELECT r.disposition FROM reactivation_calls r WHERE r.service_id = s.id ORDER BY r.created_at DESC LIMIT 1),
  cycle_started_at = c.first_call_at,
  outreach_status = CASE
    WHEN EXISTS (SELECT 1 FROM follow_ups f WHERE f.service_id = s.id AND f.completed_call_id IS NULL AND f.reason IN ('retry', 'manual'))
      THEN 'active'
    WHEN c.first_call_at IS NOT NULL THEN 'cooling' ELSE 'ready' END
FROM contacts c WHERE c.id = s.contact_id AND s.niche_id IS NOT DISTINCT FROM c.niche_id;