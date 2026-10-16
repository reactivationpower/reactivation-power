CREATE TABLE "contact_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"service_key" text NOT NULL,
	"niche_id" uuid,
	"service_label" text,
	"last_visit" date,
	"original_complaint" text,
	"source_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patient_import_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"row_number" integer NOT NULL,
	"source_system" text NOT NULL,
	"fingerprint" text NOT NULL,
	"incoming" jsonb NOT NULL,
	"reason" text NOT NULL,
	"candidate_ids" uuid[] NOT NULL,
	"contact_id" uuid,
	"decision" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patient_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"source_system" text NOT NULL,
	"patient_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "contact_services_contact_key_idx" ON "contact_services" USING btree ("contact_id","service_key");--> statement-breakpoint
CREATE INDEX "contact_services_owner_idx" ON "contact_services" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "patient_import_reviews_fingerprint_idx" ON "patient_import_reviews" USING btree ("owner_id","fingerprint");--> statement-breakpoint
CREATE INDEX "patient_import_reviews_owner_idx" ON "patient_import_reviews" USING btree ("owner_id","resolved_at");--> statement-breakpoint
CREATE UNIQUE INDEX "patient_sources_identity_idx" ON "patient_sources" USING btree ("owner_id","source_system","patient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "patient_sources_contact_source_idx" ON "patient_sources" USING btree ("contact_id","source_system");
--> statement-breakpoint
-- contacts and participants are legacy Supabase tables, deliberately not
-- managed by Drizzle. Enforce tenant consistency for these additive tables.
CREATE UNIQUE INDEX IF NOT EXISTS contacts_owner_id_identity_idx ON contacts (owner_id, id);
ALTER TABLE contact_services ADD CONSTRAINT contact_services_contact_owner_fk
  FOREIGN KEY (owner_id, contact_id) REFERENCES contacts (owner_id, id) ON DELETE CASCADE;
ALTER TABLE contact_services ADD CONSTRAINT contact_services_niche_fk
  FOREIGN KEY (niche_id) REFERENCES niches (id) ON DELETE SET NULL;
ALTER TABLE patient_sources ADD CONSTRAINT patient_sources_contact_owner_fk
  FOREIGN KEY (owner_id, contact_id) REFERENCES contacts (owner_id, id) ON DELETE CASCADE;
ALTER TABLE patient_import_reviews ADD CONSTRAINT patient_import_reviews_owner_fk
  FOREIGN KEY (owner_id) REFERENCES participants (id) ON DELETE CASCADE;
ALTER TABLE patient_import_reviews ADD CONSTRAINT patient_import_reviews_contact_owner_fk
  FOREIGN KEY (owner_id, contact_id) REFERENCES contacts (owner_id, id) ON DELETE CASCADE;
ALTER TABLE patient_import_reviews ADD CONSTRAINT patient_import_reviews_decision_check
  CHECK (decision IS NULL OR decision IN ('match', 'create', 'ignore'));
ALTER TABLE contact_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_import_reviews ENABLE ROW LEVEL SECURITY;
-- No public policies. Access is only through authenticated, practice-scoped
-- server actions or the existing service-role loaders.
INSERT INTO contact_services (owner_id, contact_id, service_key, niche_id, service_label, original_complaint)
SELECT owner_id, id,
  CASE WHEN niche_id IS NOT NULL THEN 'niche:' || niche_id::text
       WHEN NULLIF(btrim(service_label), '') IS NOT NULL THEN 'service:' || lower(regexp_replace(btrim(service_label), '\s+', ' ', 'g'))
       ELSE 'unclassified' END,
  niche_id, service_label, original_complaint
FROM contacts
ON CONFLICT (contact_id, service_key) DO NOTHING;