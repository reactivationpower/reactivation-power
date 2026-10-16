CREATE TABLE "lead_terms_acceptances" (
	"id" text PRIMARY KEY NOT NULL,
	"submission_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"version_id" text NOT NULL,
	"submitted_identity" jsonb NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"content_hash" text NOT NULL,
	"checkbox_wording" text NOT NULL,
	"source_path" text NOT NULL,
	"ip" text NOT NULL,
	"user_agent" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lead_terms_acceptances" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "lead_terms_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"current_version_id" text,
	"draft_content" text DEFAULT '' NOT NULL,
	"draft_label" text DEFAULT '' NOT NULL,
	"draft_revision" integer DEFAULT 0 NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lead_terms_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "lead_terms_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	"checkbox_wording" text NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_by" text NOT NULL,
	"published_by_name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lead_terms_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "lead_terms_acceptances" ADD CONSTRAINT "lead_terms_acceptances_submission_id_sales_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."sales_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_terms_acceptances" ADD CONSTRAINT "lead_terms_acceptances_lead_id_sales_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."sales_leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_terms_acceptances" ADD CONSTRAINT "lead_terms_acceptances_version_id_lead_terms_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."lead_terms_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_terms_settings" ADD CONSTRAINT "lead_terms_settings_current_version_id_lead_terms_versions_id_fk" FOREIGN KEY ("current_version_id") REFERENCES "public"."lead_terms_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lead_terms_acceptance_submission_unique" ON "lead_terms_acceptances" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "lead_terms_acceptance_lead_idx" ON "lead_terms_acceptances" USING btree ("lead_id");
--> statement-breakpoint
ALTER TABLE lead_terms_settings ADD CONSTRAINT lead_terms_singleton CHECK (id='marketing');
ALTER TABLE lead_terms_versions ADD CONSTRAINT lead_terms_nonempty CHECK (length(btrim(content))>0 AND length(btrim(label))>0 AND length(content_hash)=64 AND length(btrim(checkbox_wording))>0);
INSERT INTO lead_terms_settings(id) VALUES('marketing');
--> statement-breakpoint
CREATE FUNCTION lead_terms_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Published terms and acceptance evidence are immutable';
END;
$$;
CREATE TRIGGER lead_terms_versions_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON lead_terms_versions
FOR EACH STATEMENT EXECUTE FUNCTION lead_terms_immutable();
CREATE TRIGGER lead_terms_acceptances_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON lead_terms_acceptances
FOR EACH STATEMENT EXECUTE FUNCTION lead_terms_immutable();
--> statement-breakpoint
CREATE FUNCTION lead_terms_activation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Terms settings cannot be deleted'; END IF;
  IF OLD.current_version_id IS NOT NULL AND NEW.current_version_id IS NULL THEN
    RAISE EXCEPTION 'Published terms cannot be deactivated';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER lead_terms_activation_guard BEFORE UPDATE OR DELETE ON lead_terms_settings
FOR EACH ROW EXECUTE FUNCTION lead_terms_activation_guard();
CREATE TRIGGER lead_terms_settings_no_truncate BEFORE TRUNCATE ON lead_terms_settings
FOR EACH STATEMENT EXECUTE FUNCTION lead_terms_immutable();
--> statement-breakpoint
REVOKE ALL ON lead_terms_versions,lead_terms_settings,lead_terms_acceptances FROM anon,authenticated;